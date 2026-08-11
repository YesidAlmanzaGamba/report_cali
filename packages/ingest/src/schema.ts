/**
 * El envelope `Observation` — el primitivo central del proyecto (ADR-003).
 *
 * Regla dura: nunca se guarda un número pelado. En las primeras 24 horas del sismo
 * circularon 169, 224 y 234 fallecidos; ninguna cifra era falsa, eran cortes distintos.
 * Un número sin fuente ni hora no es verificable, y en una emergencia lo no verificable
 * termina funcionando como desinformación aunque haya nacido con buena intención.
 */
import { z } from 'zod';

/**
 * Confiabilidad de la fuente. El orden importa: se usa para resolver conflictos
 * cuando dos fuentes reportan la misma métrica para el mismo municipio.
 */
export const SOURCE_TYPES = ['official', 'humanitarian', 'press', 'unverified'] as const;
export const SourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/** Prioridad para desempatar fuentes. Mayor gana. */
export const SOURCE_PRIORITY: Record<SourceType, number> = {
  official: 3,
  humanitarian: 2,
  press: 1,
  unverified: 0,
};

export const SourceSchema = z.object({
  /** Nombre visible en la interfaz. Ej: "UNGRD", "USGS", "Cruz Roja Colombiana". */
  name: z.string().min(1),
  /** Enlace donde una persona puede comprobar el dato por su cuenta. Obligatorio. */
  url: z.string().url(),
  type: SourceTypeSchema,
});
export type Source = z.infer<typeof SourceSchema>;

/**
 * Métricas admitidas. La lista es cerrada a propósito: agregar una obliga a pensar
 * si el dato es agregado por municipio o si es dato personal encubierto (ADR-001).
 *
 * `missing_reported` es un CONTEO agregado que publican las autoridades.
 * Nunca son registros individuales.
 */
export const METRICS = [
  'deaths_confirmed',
  'injured',
  'missing_reported',
  'buildings_collapsed',
  'buildings_damaged',
  'people_affected',
  'people_displaced',
  'shelters_open',
  'shelter_capacity',
  'health_facilities_affected',
  'roads_blocked',
  'power_outage_users',
  'water_service_affected',
] as const;
export const MetricSchema = z.enum(METRICS);
export type Metric = z.infer<typeof MetricSchema>;

/**
 * P-code COD-AB de Colombia. `CO` + código DIVIPOLA del DANE.
 *   admin0 (país):         CO          → sin dígitos
 *   admin1 (departamento): CO05        → 2 dígitos
 *   admin2 (municipio):    CO05001     → 5 dígitos
 *
 * El nivel nacional existe porque las cifras que más circulan en una emergencia son
 * justamente las del país entero —«234 fallecidos»— y sin un lugar donde ponerlas
 * tendrían que quedarse fuera del sistema de procedencia, que es donde más falta hace.
 * Ver ADR-006.
 */
export const PcodeSchema = z
  .string()
  .regex(
    /^CO(\d{2}|\d{5})?$/,
    'P-code inválido: se espera CO (país), CO + 2 dígitos (depto) o CO + 5 (municipio)',
  );

export const ADMIN_LEVELS = [0, 1, 2] as const;

/** Nivel administrativo implícito en el P-code. */
export function adminLevelOf(pcode: string): 0 | 1 | 2 {
  if (pcode.length === 2) return 0;
  return pcode.length === 4 ? 1 : 2;
}

/**
 * DIVIPOLA del DANE → P-code COD-AB.
 *
 * Los datasets del Estado publican el código con y sin cero inicial —«5656» y «05656»
 * son el mismo municipio de Antioquia—, así que se rellena a cinco dígitos. Sin esto, los
 * 32 departamentos cuyo código empieza por cero no cruzarían con la geometría.
 */
export function pcodeFromDivipola(divipola: string | number): string {
  const digits = String(divipola).replace(/\D/g, '');
  if (digits.length === 0) throw new Error(`DIVIPOLA vacío o no numérico: ${String(divipola)}`);

  if (digits.length <= 2) return `CO${digits.padStart(2, '0')}`;
  return `CO${digits.padStart(5, '0')}`;
}

/**
 * Fecha-hora ISO 8601 en UTC. Se exige el sufijo de zona: una hora sin zona en un país
 * que reporta en hora local y consume fuentes en UTC es una fuente silenciosa de errores
 * de 5 horas.
 */
export const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Se requiere fecha ISO 8601 con zona horaria (Z u offset)' });

export const ObservationSchema = z
  .object({
    metric: MetricSchema,
    /** Conteos: enteros no negativos. Un conteo negativo siempre es un error de parseo. */
    value: z.number().finite().nonnegative(),
    pcode: PcodeSchema,
    source: SourceSchema,
    /** Cuándo la FUENTE afirma que el dato era cierto (el corte del boletín). */
    observed_at: IsoDateTimeSchema,
    /** Cuándo lo trajimos nosotros. Sirve para detectar fuentes congeladas. */
    ingested_at: IsoDateTimeSchema,
    /** Contexto libre y corto. Nunca datos personales. */
    notes: z.string().max(280).optional(),
  })
  .strict()
  .refine((o) => Date.parse(o.observed_at) <= Date.parse(o.ingested_at) + 60_000, {
    message: 'observed_at no puede ser posterior a ingested_at (tolerancia 60 s de reloj)',
    path: ['observed_at'],
  });

export type Observation = z.infer<typeof ObservationSchema>;

export const ObservationsSchema = z.array(ObservationSchema);

/** Metadatos que acompañan a cada dataset publicado en `data/`. */
export const DatasetMetaSchema = z.object({
  dataset: z.string().min(1),
  generated_at: IsoDateTimeSchema,
  /** Evento al que pertenece el dataset. Fijo para esta respuesta. */
  event_id: z.string().min(1),
  record_count: z.number().int().nonnegative(),
  sources: z.array(SourceSchema),
});
export type DatasetMeta = z.infer<typeof DatasetMetaSchema>;

/** Identificador del evento USGS de este desastre. */
export const EVENT_ID = 'us6000tjl2';
