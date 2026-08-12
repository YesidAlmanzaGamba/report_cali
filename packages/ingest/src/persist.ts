/**
 * Escritura de datasets en `data/`, con dos garantías que sostienen ADR-003 y ADR-004.
 *
 * 1. **Conservar el último dato bueno.** Si una fuente rompe su contrato, fallamos
 *    ruidosamente y dejamos intacto el archivo anterior. Una cifra vieja y marcada como
 *    vieja hace mucho menos daño que una cifra corrupta presentada como fresca.
 *
 * 2. **Escritura estable.** El cron corre cada 15 minutos. Si `ingested_at` entrara al
 *    archivo sin más, cada corrida produciría un diff y el historial de git — que es
 *    justamente nuestra trazabilidad de procedencia (ADR-004) — quedaría ahogado en
 *    ~96 commits diarios de ruido. Por eso comparamos un hash del contenido
 *    significativo y solo reescribimos cuando algo cambió de verdad.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  DatasetMetaSchema,
  ObservationsSchema,
  EVENT_ID,
  type DatasetMeta,
  type Observation,
  type Source,
} from './schema.js';

/** La fuente devolvió algo que no cumple el contrato. Nunca se publica. */
export class SourceContractError extends Error {
  constructor(
    readonly dataset: string,
    readonly issues: string[],
  ) {
    super(
      `La fuente "${dataset}" rompió su contrato de datos:\n` +
        issues.map((i) => `  · ${i}`).join('\n') +
        `\n\nNo se escribió nada. Se conserva el último dato bueno.`,
    );
    this.name = 'SourceContractError';
  }
}

export interface DatasetFile {
  meta: DatasetMeta;
  /** Hash del contenido significativo. Ver nota de escritura estable arriba. */
  content_hash: string;
  observations: Observation[];
}

export interface WriteResult {
  path: string;
  changed: boolean;
  recordCount: number;
}

/**
 * Hash sobre el contenido que de verdad importa. Deja fuera `ingested_at` (cambia en cada
 * corrida sin que cambie el dato) y ordena las claves para que el hash no dependa del
 * orden en que el adaptador construyó los objetos.
 */
export function contentHashOf(observations: Observation[]): string {
  const normalized = observations
    .map(({ ingested_at: _ignored, ...rest }) => rest)
    .map((o) => JSON.stringify(o, Object.keys(o).sort()))
    .sort();

  return createHash('sha256').update(normalized.join('\n')).digest('hex');
}

async function readExisting(path: string): Promise<DatasetFile | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as DatasetFile;
  } catch {
    // No existe o está corrupto: se trata como "sin dato previo".
    return undefined;
  }
}

export interface WriteDatasetOptions {
  /** Raíz de `data/`. */
  dataDir: string;
  /** Ruta relativa dentro de `data/`, sin extensión. Ej: `observations/ungrd`. */
  name: string;
  observations: Observation[];
  sources: Source[];
  now?: Date;
}

/**
 * Valida y escribe un dataset. Lanza `SourceContractError` sin tocar el disco si la
 * validación falla.
 */
export async function writeDataset(options: WriteDatasetOptions): Promise<WriteResult> {
  const { dataDir, name, observations, sources, now = new Date() } = options;
  const path = join(dataDir, `${name}.json`);

  const parsed = ObservationsSchema.safeParse(observations);
  if (!parsed.success) {
    throw new SourceContractError(
      name,
      parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
  }

  const contentHash = contentHashOf(parsed.data);
  const existing = await readExisting(path);

  if (existing?.content_hash === contentHash) {
    return { path, changed: false, recordCount: parsed.data.length };
  }

  const meta = DatasetMetaSchema.parse({
    dataset: name,
    generated_at: now.toISOString(),
    event_id: EVENT_ID,
    record_count: parsed.data.length,
    sources,
  } satisfies DatasetMeta);

  const file: DatasetFile = { meta, content_hash: contentHash, observations: parsed.data };

  await mkdir(dirname(path), { recursive: true });
  // Newline final y 2 espacios de indentación: los diffs de git son la auditoría,
  // y un JSON en una sola línea los vuelve ilegibles.
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

  return { path, changed: true, recordCount: parsed.data.length };
}

/**
 * Marcas de tiempo que cambian en cada corrida sin que cambie ningún dato real.
 *
 * `generated_at` e `ingested_at` son nuestras. `updatedAt` viene del USGS y se mueve cada
 * vez que tocan el registro del evento, aunque la ciencia sea idéntica. Cuando el USGS
 * revisa de verdad el ShakeMap sí cambian cosas que nos importan —el MMI, la URL versionada
 * del producto— y esas sí disparan escritura.
 *
 * Sin esta lista, el cron produce ~96 commits diarios en los que lo único que cambia es la
 * hora, y el historial de git —que ES nuestra trazabilidad de procedencia (ADR-004)— queda
 * ahogado en ruido.
 */
const VOLATILE_KEYS = new Set(['generated_at', 'ingested_at', 'updatedAt']);

/** Copia sin las marcas de tiempo volátiles, a cualquier profundidad. */
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = stripVolatile(inner);
    }
    return out;
  }

  return value;
}

/**
 * Escribe un archivo generado solo si su contenido cambió.
 *
 * Sirve para los datasets que no son observaciones — geometría, malla de intensidad,
 * ficha del evento. No llevan el envelope `Observation` porque no son cifras reportadas
 * por alguien: son la base cartográfica y científica sobre la que se dibuja todo.
 *
 * `hashBasis` permite comparar por el contenido significativo y aun así escribir el
 * archivo completo, con sus marcas de tiempo, cuando algo cambió de verdad.
 */
async function writeIfChanged(
  path: string,
  serialized: string,
  hashBasis: string = serialized,
): Promise<WriteResult> {
  const hash = createHash('sha256').update(hashBasis).digest('hex');
  const previous = await readFile(path, 'utf8').catch(() => undefined);

  if (previous !== undefined) {
    let previousBasis = previous;
    try {
      previousBasis = JSON.stringify(stripVolatile(JSON.parse(previous)));
    } catch {
      // No es JSON o está corrupto: se compara crudo y, si difiere, se reescribe.
    }

    if (createHash('sha256').update(previousBasis).digest('hex') === hash) {
      return { path, changed: false, recordCount: 0 };
    }
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialized, 'utf8');

  return { path, changed: true, recordCount: 0 };
}

/**
 * GeoJSON compacto: la geometría se sirve al navegador y cada byte cuenta.
 * Aquí sí sacrificamos legibilidad del diff — un polígono no se revisa a ojo.
 */
export async function writeGeoJson(
  dataDir: string,
  name: string,
  geojson: unknown,
): Promise<WriteResult> {
  return writeIfChanged(
    join(dataDir, `${name}.geojson`),
    `${JSON.stringify(geojson)}\n`,
    JSON.stringify(stripVolatile(geojson)),
  );
}

/**
 * Archivo binario generado (la superposición de deslizamientos).
 *
 * Se compara por hash para no reescribirlo en cada corrida: un PNG idéntico reescrito
 * cada 30 minutos ensuciaría el historial igual que un JSON.
 */
export async function writeBinary(
  dataDir: string,
  name: string,
  bytes: Uint8Array,
): Promise<WriteResult> {
  const path = join(dataDir, name);
  const hash = createHash('sha256').update(bytes).digest('hex');

  const previo = await readFile(path).catch(() => undefined);
  if (previo && createHash('sha256').update(previo).digest('hex') === hash) {
    return { path, changed: false, recordCount: 0 };
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);

  return { path, changed: true, recordCount: 0 };
}

/** Texto plano generado (CSV de exportación). */
export async function writeText(
  dataDir: string,
  name: string,
  contents: string,
): Promise<WriteResult> {
  return writeIfChanged(join(dataDir, name), contents);
}

/** TopoJSON compacto: es lo que descarga el navegador. */
export async function writeTopoJson(
  dataDir: string,
  name: string,
  topology: unknown,
): Promise<WriteResult> {
  return writeIfChanged(
    join(dataDir, `${name}.topojson`),
    `${JSON.stringify(topology)}\n`,
    JSON.stringify(stripVolatile(topology)),
  );
}

/**
 * JSON indentado, para lo que sí se revisa leyendo el diff (ficha del evento,
 * MMI por municipio).
 */
export async function writeJson(
  dataDir: string,
  name: string,
  value: unknown,
): Promise<WriteResult> {
  return writeIfChanged(
    join(dataDir, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
    JSON.stringify(stripVolatile(value)),
  );
}
