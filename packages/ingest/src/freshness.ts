/**
 * Obsolescencia de las observaciones (ADR-003).
 *
 * La interfaz degrada visualmente lo viejo en vez de seguir presentándolo como fresco.
 * Los umbrales dependen de la métrica: la ocupación de un albergue cambia cada hora,
 * el conteo de edificios colapsados no. Un solo umbral para todo marcaría como obsoleto
 * un censo de daños perfectamente válido, o presentaría como vigente una cifra de
 * albergues de hace dos días.
 */
import type { Metric, Observation } from './schema.js';

export type Freshness = 'fresh' | 'aging' | 'stale';

interface Thresholds {
  /** Hasta aquí es `fresh`, en horas. */
  readonly freshHours: number;
  /** Hasta aquí es `aging`; más allá, `stale`. */
  readonly agingHours: number;
}

/** Cambia rápido: situación operativa en terreno. */
const FAST: Thresholds = { freshHours: 6, agingHours: 24 };
/** Cambia a diario: balance de víctimas y afectación. */
const DAILY: Thresholds = { freshHours: 24, agingHours: 72 };
/** Cambia lento: censo de daño estructural. */
const SLOW: Thresholds = { freshHours: 48, agingHours: 168 };

const THRESHOLDS: Record<Metric, Thresholds> = {
  deaths_confirmed: DAILY,
  injured: DAILY,
  missing_reported: DAILY,
  people_affected: DAILY,
  people_displaced: DAILY,

  shelters_open: FAST,
  shelter_capacity: FAST,
  roads_blocked: FAST,
  power_outage_users: FAST,
  water_service_affected: FAST,
  // Mientras hay búsqueda activa, estas dos cambian por hora. Una cifra de atrapados
  // de ayer no solo está vieja: puede mandar un equipo a un sitio ya despejado.
  people_trapped: FAST,
  people_rescued: FAST,

  buildings_collapsed: SLOW,
  buildings_partially_collapsed: SLOW,
  buildings_damaged: SLOW,
  health_facilities_affected: SLOW,
  schools_affected: SLOW,
};

const HOUR_MS = 3_600_000;

/**
 * Antigüedad respecto a `observed_at` — cuándo la fuente dice que el dato era cierto —
 * y no respecto a `ingested_at`. Una fuente que republica sin cambios cada hora tiene
 * `ingested_at` fresco y un dato viejo; medir por `ingested_at` la haría parecer al día.
 */
export function ageHours(observation: Observation, now: Date = new Date()): number {
  return (now.getTime() - Date.parse(observation.observed_at)) / HOUR_MS;
}

export function freshnessOf(observation: Observation, now: Date = new Date()): Freshness {
  const thresholds = THRESHOLDS[observation.metric];
  const age = ageHours(observation, now);

  if (age <= thresholds.freshHours) return 'fresh';
  if (age <= thresholds.agingHours) return 'aging';
  return 'stale';
}

export function thresholdsFor(metric: Metric): Thresholds {
  return THRESHOLDS[metric];
}

/**
 * Texto relativo en español para la interfaz ("hace 3 horas").
 * Se calcula en el pipeline y no en el navegador para que la página estática
 * no dependa del reloj del dispositivo, que en campo suele estar mal.
 */
export function relativeAgeEs(observation: Observation, now: Date = new Date()): string {
  const hours = ageHours(observation, now);

  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }
  if (hours < 24) {
    const rounded = Math.round(hours);
    return `hace ${rounded} ${rounded === 1 ? 'hora' : 'horas'}`;
  }

  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
