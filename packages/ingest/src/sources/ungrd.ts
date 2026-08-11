/**
 * Adaptador UNGRD — cifras oficiales de afectación, vía datos abiertos (Socrata).
 *
 * ⚠️ **Hoy este adaptador no devuelve datos del terremoto del 10 de agosto de 2026, y no
 * es un error.** Los datos abiertos de la UNGRD llegan hasta el 31 de diciembre de 2024:
 * publican con más de un año de rezago. El adaptador queda construido y consultando, así
 * que el día que la UNGRD publique 2026 el mapa se llena solo. Mientras tanto, las cifras
 * de esta emergencia entran por `curated/observaciones.json` (ver `curated.ts`).
 *
 * Los IDs de dataset están resueltos consultando el catálogo de Socrata, no adivinados
 * —un ID supuesto devolvió 404 durante la planeación—:
 *
 *   https://api.us.socrata.com/api/catalog/v1?search_context=www.datos.gov.co&q=UNGRD
 *
 * Licencia de la fuente: datos abiertos del Estado colombiano (Ley 1712 de 2014).
 */
import { fetchJson } from '../http.js';
import { pcodeFromDivipola, type Metric, type Observation, type Source } from '../schema.js';

export const UNGRD_SOURCE: Source = {
  name: 'UNGRD',
  url: 'https://www.datos.gov.co/d/rgre-6ak4',
  type: 'official',
};

const SOCRATA = 'https://www.datos.gov.co/resource';

/** Datasets de emergencias publicados por la UNGRD, del más reciente al más antiguo. */
export const UNGRD_DATASETS = [
  { id: 'rgre-6ak4', desde: '2023-01-01', hasta: '2024-12-31', divipolaField: 'codificaci_n_segun_divipola' },
  { id: '4t8v-ywmw', desde: '2020-01-01', hasta: '2020-12-31', divipolaField: 'divipola' },
  { id: '4fd8-ptcr', desde: '2019-01-01', hasta: '2019-12-31', divipolaField: 'divipola' },
] as const;

/** Eventos de la UNGRD que corresponden a un sismo. */
export const SEISMIC_EVENTS = ['SISMO', 'TERREMOTO'] as const;

/**
 * Columnas de la UNGRD → métricas nuestras.
 *
 * Deliberadamente parcial: la UNGRD publica decenas de columnas de ayuda entregada
 * (kits de aseo, colchonetas, valor del apoyo). No las traemos porque el mapa responde
 * «qué pasó y dónde», no «cuánto se gastó»; agregarlas sería ruido para quien coordina
 * una respuesta.
 */
const FIELD_TO_METRIC: Record<string, Metric> = {
  fallecidos: 'deaths_confirmed',
  heridos: 'injured',
  desaparecidos: 'missing_reported',
  personas: 'people_affected',
  viviendas_destruidas: 'buildings_collapsed',
  viviendas_averiadas: 'buildings_damaged',
  centros_de_salud: 'health_facilities_affected',
  vias_averiadas: 'roads_blocked',
};

interface RawRow {
  fecha?: unknown;
  evento?: unknown;
  municipio?: unknown;
  departamento?: unknown;
  [key: string]: unknown;
}

/** Los conteos vienen como texto y a veces con separadores de miles. */
function toCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  const n = Number(String(value).replace(/[.,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Convierte filas de la UNGRD en observaciones. Puro: sin red.
 *
 * Una fila de la UNGRD es un evento en un municipio con muchas columnas; nosotros
 * emitimos una observación por cada métrica con valor. Los ceros **se descartan**: la
 * UNGRD rellena con 0 lo que no aplica, y publicar «0 fallecidos» con la misma fuerza que
 * un 0 verificado afirmaría algo que el dato no respalda.
 */
export function parseUngrdRows(
  rows: unknown,
  options: { divipolaField: string; datasetId: string; now?: Date },
): Observation[] {
  if (!Array.isArray(rows)) throw new Error('UNGRD: se esperaba un arreglo de filas');

  const ingestedAt = (options.now ?? new Date()).toISOString();
  const source: Source = { ...UNGRD_SOURCE, url: `https://www.datos.gov.co/d/${options.datasetId}` };
  const observations: Observation[] = [];

  for (const raw of rows as RawRow[]) {
    const divipola = raw[options.divipolaField];
    const fecha = raw['fecha'];
    if (divipola === undefined || typeof fecha !== 'string') continue;

    let pcode: string;
    try {
      pcode = pcodeFromDivipola(divipola as string);
    } catch {
      continue; // Fila sin código utilizable: se omite en vez de inventar una ubicación.
    }

    // Las fechas de la UNGRD vienen sin zona horaria y son fechas de Colombia (UTC-5).
    // Interpretarlas como UTC correría el evento cinco horas.
    const observedAt = new Date(`${fecha.slice(0, 19)}-05:00`).toISOString();

    for (const [field, metric] of Object.entries(FIELD_TO_METRIC)) {
      const value = toCount(raw[field]);
      if (value === undefined || value === 0) continue;

      observations.push({
        metric,
        value,
        pcode,
        source,
        observed_at: observedAt,
        ingested_at: ingestedAt,
        notes: typeof raw['evento'] === 'string' ? `Evento UNGRD: ${raw['evento']}` : undefined,
      } as Observation);
    }
  }

  return observations;
}

/**
 * Consulta los eventos sísmicos posteriores a una fecha.
 *
 * `sinceIso` filtra por fecha del evento. Para esta emergencia se pasa el 2026-08-10; hoy
 * eso devuelve cero filas porque los datos abiertos llegan hasta 2024, y esa respuesta
 * vacía es correcta, no un fallo.
 */
export async function fetchUngrdSeismic(sinceIso: string, now?: Date): Promise<Observation[]> {
  const all: Observation[] = [];

  for (const dataset of UNGRD_DATASETS) {
    const eventos = SEISMIC_EVENTS.map((e) => `'${e}'`).join(',');
    const where = encodeURIComponent(`evento in(${eventos}) AND fecha >= '${sinceIso.slice(0, 10)}'`);
    const url = `${SOCRATA}/${dataset.id}.json?$where=${where}&$limit=5000`;

    const rows = await fetchJson(url, { timeoutMs: 60_000 });
    all.push(
      ...parseUngrdRows(rows, {
        divipolaField: dataset.divipolaField,
        datasetId: dataset.id,
        ...(now ? { now } : {}),
      }),
    );
  }

  return all;
}
