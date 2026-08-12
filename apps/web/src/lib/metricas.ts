/**
 * Nombres en español de las métricas, y cómo se presenta cada cifra.
 *
 * El orden de `ORDEN_METRICAS` no es alfabético: va de lo más grave a lo más
 * logístico. En una emergencia, quien abre esta página busca primero cuánta gente está
 * en riesgo, no cuántos albergues hay abiertos.
 */
import type { Metric, Observation, SourceType } from '@report-cali/ingest/schema';

export const ETIQUETAS: Record<Metric, string> = {
  deaths_confirmed: 'Fallecidos',
  missing_reported: 'Desaparecidos reportados',
  injured: 'Heridos',
  people_affected: 'Personas afectadas',
  people_displaced: 'Personas desplazadas',
  buildings_collapsed: 'Edificaciones colapsadas',
  buildings_damaged: 'Viviendas averiadas',
  health_facilities_affected: 'Centros de salud afectados',
  roads_blocked: 'Vías afectadas',
  shelters_open: 'Albergues abiertos',
  shelter_capacity: 'Capacidad de albergues',
  power_outage_users: 'Usuarios sin energía',
  water_service_affected: 'Afectación de acueducto',
};

export const ORDEN_METRICAS: Metric[] = [
  'deaths_confirmed',
  'missing_reported',
  'injured',
  'people_affected',
  'people_displaced',
  'buildings_collapsed',
  'buildings_damaged',
  'health_facilities_affected',
  'roads_blocked',
  'shelters_open',
  'shelter_capacity',
  'power_outage_users',
  'water_service_affected',
];

/**
 * Cómo se nombra cada tipo de fuente en la interfaz.
 *
 * «Prensa» se dice tal cual, sin suavizarlo. Un medio serio sigue siendo prensa y no una
 * cifra oficial, y quien coordina una respuesta necesita esa diferencia a la vista.
 */
export const TIPOS_FUENTE: Record<SourceType, string> = {
  official: 'Oficial',
  humanitarian: 'Humanitaria',
  press: 'Prensa',
  unverified: 'Sin verificar',
};

export function ordenar(observaciones: Observation[]): Observation[] {
  return [...observaciones].sort((a, b) => {
    const porMetrica = ORDEN_METRICAS.indexOf(a.metric) - ORDEN_METRICAS.indexOf(b.metric);
    if (porMetrica !== 0) return porMetrica;
    return a.pcode.length - b.pcode.length || b.value - a.value;
  });
}

/** `CO` es el país entero; lo demás se resuelve contra los nombres de municipio. */
export function nombreDeLugar(pcode: string, municipios: Map<string, string>): string {
  if (pcode === 'CO') return 'Colombia';
  return municipios.get(pcode) ?? pcode;
}

export type Frescura = 'fresh' | 'aging' | 'stale';

interface Umbrales {
  /** Hasta aquí es `fresh`, en horas. */
  frescoHoras: number;
  /** Hasta aquí es `aging`; más allá, `stale`. */
  envejeceHoras: number;
}

const RAPIDO: Umbrales = { frescoHoras: 6, envejeceHoras: 24 };
const DIARIO: Umbrales = { frescoHoras: 24, envejeceHoras: 72 };
const LENTO: Umbrales = { frescoHoras: 48, envejeceHoras: 168 };

const UMBRALES: Record<Metric, Umbrales> = {
  deaths_confirmed: DIARIO,
  injured: DIARIO,
  missing_reported: DIARIO,
  people_affected: DIARIO,
  people_displaced: DIARIO,
  shelters_open: RAPIDO,
  shelter_capacity: RAPIDO,
  roads_blocked: RAPIDO,
  power_outage_users: RAPIDO,
  water_service_affected: RAPIDO,
  buildings_collapsed: LENTO,
  buildings_damaged: LENTO,
  health_facilities_affected: LENTO,
};

const HORA_MS = 3_600_000;

/**
 * Duplica `freshnessOf` de `@report-cali/ingest` en vez de importarla: ese paquete
 * arrastra zod y módulos de Node al bundle del navegador (mismo motivo que `bboxDe`
 * en `mapa.ts`). Los umbrales deben mantenerse iguales a los de `packages/ingest/src/freshness.ts`.
 */
export function frescuraDe(o: Observation, ahora: Date): Frescura {
  const u = UMBRALES[o.metric];
  const horas = (ahora.getTime() - Date.parse(o.observed_at)) / HORA_MS;
  if (horas <= u.frescoHoras) return 'fresh';
  if (horas <= u.envejeceHoras) return 'aging';
  return 'stale';
}
