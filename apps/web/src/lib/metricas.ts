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
  people_trapped: 'Personas atrapadas',
  injured: 'Heridos',
  people_rescued: 'Personas rescatadas',
  people_affected: 'Personas afectadas',
  people_displaced: 'Personas desplazadas',
  buildings_collapsed: 'Edificaciones colapsadas',
  buildings_partially_collapsed: 'Colapso parcial',
  buildings_damaged: 'Viviendas averiadas',
  health_facilities_affected: 'Centros de salud afectados',
  schools_affected: 'Centros educativos afectados',
  roads_blocked: 'Vías afectadas',
  shelters_open: 'Albergues abiertos',
  shelter_capacity: 'Capacidad de albergues',
  power_outage_users: 'Usuarios sin energía',
  water_service_affected: 'Afectación de acueducto',
};

// De lo más urgente a lo más logístico. «Atrapadas» va arriba porque mientras haya
// búsqueda activa es la cifra que decide a dónde va el siguiente equipo.
export const ORDEN_METRICAS: Metric[] = [
  'deaths_confirmed',
  'people_trapped',
  'missing_reported',
  'injured',
  'people_rescued',
  'people_affected',
  'people_displaced',
  'buildings_collapsed',
  'buildings_partially_collapsed',
  'buildings_damaged',
  'health_facilities_affected',
  'schools_affected',
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
