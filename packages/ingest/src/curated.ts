/**
 * Observaciones registradas a mano, desde boletines oficiales y prensa.
 *
 * Existe por una limitación real, no por comodidad: los datos abiertos de la UNGRD llegan
 * hasta el 31 de diciembre de 2024 —publican con más de un año de rezago— y la API de
 * ReliefWeb exige un `appname` aprobado por ellos. Durante la emergencia, entonces, no hay
 * forma automática de obtener cifras por municipio.
 *
 * En vez de dejar el mapa sin cifras, se abre una vía humana con las mismas garantías que
 * el resto del sistema: cada dato pasa por el mismo esquema, exige fuente con enlace y
 * fecha de corte, y entra por pull request, o sea revisado por otra persona.
 *
 * El archivo vive en `curated/` y no en `data/` a propósito: `data/` es generado y lo
 * reescribe el robot; `curated/` lo escriben personas y nadie lo pisa.
 */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { CURATED_FILE } from './paths.js';
import { IsoDateTimeSchema, MetricSchema, PcodeSchema, SourceSchema, type Observation } from './schema.js';

/** Igual que `Observation`, pero sin `ingested_at`: eso lo pone el pipeline. */
const CuratedObservationSchema = z
  .object({
    metric: MetricSchema,
    value: z.number().finite().nonnegative(),
    pcode: PcodeSchema,
    source: SourceSchema,
    observed_at: IsoDateTimeSchema,
    notes: z.string().max(280).optional(),
  })
  .strict();

const CuratedFileSchema = z.object({
  observaciones: z.array(CuratedObservationSchema),
});

export class CuratedDataError extends Error {
  constructor(issues: string[]) {
    super(
      `El archivo curated/observaciones.json tiene errores:\n` +
        issues.map((i) => `  · ${i}`).join('\n') +
        `\n\nRevisa las reglas al inicio del archivo. Toda cifra necesita fuente con URL,` +
        `\ny observed_at debe llevar zona horaria (por ejemplo -05:00).`,
    );
    this.name = 'CuratedDataError';
  }
}

/**
 * Lee y valida las observaciones curadas.
 *
 * Falla ruidosamente si el archivo está mal: una cifra sin fuente o con fecha ambigua es
 * exactamente lo que este proyecto no publica, y es mejor que el robot se detenga a que
 * pase un dato sin procedencia.
 */
export async function loadCuratedObservations(now: Date = new Date()): Promise<Observation[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(CURATED_FILE, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new CuratedDataError([`No se pudo leer el archivo: ${(error as Error).message}`]);
  }

  const parsed = CuratedFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CuratedDataError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
  }

  const ingestedAt = now.toISOString();

  return parsed.data.observaciones.map((o) => ({
    ...o,
    ingested_at: ingestedAt,
  })) as Observation[];
}
