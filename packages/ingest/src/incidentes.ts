/**
 * Incidentes puntuales: edificaciones colapsadas, vías bloqueadas, albergues.
 *
 * **La regla de los 100 metros (ADR-012).** Un mapa público que señala con precisión qué
 * edificaciones quedaron colapsadas o desocupadas es, visto de otra forma, una lista de
 * objetivos para saqueo, y recae sobre familias que ya lo perdieron casi todo.
 *
 * Por eso:
 *   · lo **verificado por una persona** se publica en su ubicación exacta;
 *   · lo **no verificado** se recorta a una rejilla de ~100 m antes de salir.
 *
 * El recorte ocurre **en el pipeline, no en la interfaz**: la coordenada precisa sin
 * verificar nunca sale del servidor, así que un error de front-end no puede filtrarla.
 * Que sea imposible por construcción vale más que que esté prohibido por convención.
 *
 * A un equipo de socorro le sirve igual saber la manzana; a quien busca casas vacías, no.
 */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { INCIDENTES_FILE } from './paths.js';
import { IsoDateTimeSchema, PcodeSchema, SourceSchema } from './schema.js';

/** Tipos de incidente que el mapa sabe dibujar. */
export const TIPOS_INCIDENTE = [
  'edificacion_colapsada',
  'edificacion_danada',
  'via_bloqueada',
  'albergue',
  'centro_salud_afectado',
  'centro_acopio',
] as const;

export const TipoIncidenteSchema = z.enum(TIPOS_INCIDENTE);
export type TipoIncidente = z.infer<typeof TipoIncidenteSchema>;

const CuratedIncidenteSchema = z
  .object({
    tipo: TipoIncidenteSchema,
    /** Municipio al que pertenece. Se usa para agrupar y para servirlo por separado. */
    pcode: PcodeSchema,
    longitud: z.number().gte(-82).lte(-66),
    latitud: z.number().gte(-4.3).lte(13.5),
    /** Qué pasó. Nunca nombres ni datos de las personas afectadas (ADR-001). */
    descripcion: z.string().max(280),
    source: SourceSchema,
    observed_at: IsoDateTimeSchema,
    /**
     * `true` solo si una persona confirmó la ubicación exacta. Si es `false` —el valor
     * por defecto y el correcto para un reporte sacado de una nota de prensa— el punto
     * se recorta a la rejilla de 100 m.
     */
    verificado: z.boolean().default(false),
  })
  .strict();

const ArchivoIncidentesSchema = z.object({
  incidentes: z.array(CuratedIncidenteSchema),
});

export type IncidenteCurado = z.infer<typeof CuratedIncidenteSchema>;

export interface IncidentePublicado extends Omit<IncidenteCurado, 'verificado'> {
  verificado: boolean;
  /** `exacta` o `rejilla-100m`. Queda a la vista para que el dato sea auditable. */
  precision: 'exacta' | 'rejilla-100m';
}

export class IncidentesError extends Error {
  constructor(issues: string[]) {
    super(
      `El archivo curated/incidentes.json tiene errores:\n` +
        issues.map((i) => `  · ${i}`).join('\n'),
    );
    this.name = 'IncidentesError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Metros por grado de latitud. Constante suficiente para lo que hacemos. */
const METROS_POR_GRADO_LAT = 111_320;

/**
 * Recorta una coordenada a una rejilla de `metros`.
 *
 * El paso en longitud se corrige por el coseno de la latitud: un grado de longitud mide
 * menos cuanto más lejos del ecuador. Sin esa corrección la celda saldría rectangular y
 * en Colombia —cerca del ecuador— quedaría más ancha de lo debido, publicando más
 * precisión de la que decimos publicar.
 */
export function recortarARejilla(
  longitud: number,
  latitud: number,
  metros = 100,
): { longitud: number; latitud: number } {
  // Al centro de la celda, no a su esquina: así el punto publicado no sugiere una
  // precisión que no tiene, y dos incidentes de la misma manzana caen en el mismo sitio.
  const redondear = (valor: number, paso: number) => (Math.floor(valor / paso) + 0.5) * paso;

  const pasoLat = metros / METROS_POR_GRADO_LAT;
  const latRecortada = redondear(latitud, pasoLat);

  // El paso de longitud se calcula sobre la latitud YA RECORTADA, no sobre la original.
  //
  // Si se usara la original, dos puntos de la misma manzana con latitudes ligeramente
  // distintas obtendrían pasos ligeramente distintos, y cerca del borde de una celda
  // caerían en celdas diferentes — justo lo que la rejilla existe para evitar. Con la
  // latitud recortada, toda la banda comparte el mismo paso y la rejilla es consistente.
  const pasoLon = metros / (METROS_POR_GRADO_LAT * Math.cos((latRecortada * Math.PI) / 180));

  return {
    longitud: Number(redondear(longitud, pasoLon).toFixed(6)),
    latitud: Number(latRecortada.toFixed(6)),
  };
}

/** Aplica la regla de ADR-012. Puro: sin red ni disco. */
export function publicables(incidentes: IncidenteCurado[]): IncidentePublicado[] {
  return incidentes.map((i) => {
    if (i.verificado) return { ...i, precision: 'exacta' as const };

    const { longitud, latitud } = recortarARejilla(i.longitud, i.latitud);
    return { ...i, longitud, latitud, precision: 'rejilla-100m' as const };
  });
}

/** Agrupa por municipio: cada uno se sirve aparte y se descarga solo al abrirlo. */
export function porMunicipio(
  incidentes: IncidentePublicado[],
): Map<string, IncidentePublicado[]> {
  const mapa = new Map<string, IncidentePublicado[]>();

  for (const i of incidentes) {
    const lista = mapa.get(i.pcode);
    if (lista) lista.push(i);
    else mapa.set(i.pcode, [i]);
  }

  return mapa;
}

/** Convierte a GeoJSON, que es lo que consume el mapa. */
export function aGeoJson(incidentes: IncidentePublicado[]): unknown {
  return {
    type: 'FeatureCollection',
    features: incidentes.map((i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [i.longitud, i.latitud] },
      properties: {
        tipo: i.tipo,
        descripcion: i.descripcion,
        precision: i.precision,
        fuente: i.source.name,
        fuente_url: i.source.url,
        fuente_tipo: i.source.type,
        observado: i.observed_at,
      },
    })),
  };
}

export async function cargarIncidentes(): Promise<IncidenteCurado[]> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(await readFile(INCIDENTES_FILE, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new IncidentesError([`No se pudo leer el archivo: ${(error as Error).message}`]);
  }

  const parsed = ArchivoIncidentesSchema.safeParse(crudo);
  if (!parsed.success) {
    throw new IncidentesError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
  }

  return parsed.data.incidentes;
}
