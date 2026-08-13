/**
 * Adaptador USGS — sismicidad e intensidad.
 *
 * El parseo va separado de la descarga a propósito: lo que se puede equivocar es la
 * interpretación de la malla y de los productos, y eso debe poder probarse sin red
 * (ver CONTRIBUTING.md → "Reglas de las pruebas").
 *
 * Licencia de la fuente: dominio público (obra del gobierno de EE. UU.).
 */
import { fetchJson } from '../http.js';
import { EVENT_ID, type Source } from '../schema.js';

/**
 * Página del evento en el USGS. Se declara aparte de `USGS_SOURCE` porque `Source.url`
 * pasó a ser opcional —solo las fuentes `unverified` pueden omitirlo, ver ADR-013— y
 * desde el tipo ya no se puede afirmar que esta la tiene. La constante sí.
 */
export const USGS_EVENT_PAGE = `https://earthquake.usgs.gov/earthquakes/eventpage/${EVENT_ID}`;

export const USGS_SOURCE: Source = {
  name: 'USGS',
  url: USGS_EVENT_PAGE,
  type: 'official',
};

const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

export const EVENT_URL = `${FDSN}?eventid=${EVENT_ID}&format=geojson`;

// ─────────────────────────────────────────────────────────────────────────────
// Evento principal
// ─────────────────────────────────────────────────────────────────────────────

export interface EarthquakeEvent {
  id: string;
  magnitude: number;
  /** Profundidad en km. 110 km es la razón de que se sintiera en 34 millones de personas. */
  depthKm: number;
  longitude: number;
  latitude: number;
  place: string;
  /** Nivel PAGER: green | yellow | orange | red. */
  alert: string | null;
  originTime: string;
  updatedAt: string;
  url: string;
  /** Base de descarga del producto ShakeMap, con su timestamp de versión. */
  shakemapBaseUrl: string | null;
  maxMmi: number | null;
}

interface RawProductContent {
  url?: string;
}

interface RawProduct {
  updateTime?: number;
  properties?: Record<string, string>;
  contents?: Record<string, RawProductContent>;
}

interface RawEvent {
  id?: string;
  geometry?: { coordinates?: unknown };
  properties?: {
    mag?: unknown;
    place?: unknown;
    time?: unknown;
    updated?: unknown;
    alert?: unknown;
    url?: unknown;
    products?: Record<string, RawProduct[]>;
  };
}

function expectNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`USGS: se esperaba un número en "${field}", llegó ${JSON.stringify(value)}`);
  }
  return value;
}

/** Parsea la respuesta FDSN del evento. Puro: sin red. */
export function parseEvent(raw: unknown): EarthquakeEvent {
  const event = raw as RawEvent;
  const properties = event.properties;
  if (!properties) throw new Error('USGS: la respuesta no trae `properties`');

  const coordinates = event.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    throw new Error('USGS: se esperaba geometry.coordinates con [lon, lat, depth]');
  }

  const shakemap = properties.products?.['shakemap']?.[0];
  const contMi = shakemap?.contents?.['download/cont_mi.json']?.url;
  // La URL del producto lleva un timestamp de versión que cambia con cada revisión
  // del ShakeMap; hay que leerla del propio producto y nunca construirla a mano.
  const shakemapBaseUrl = contMi ? contMi.replace(/\/cont_mi\.json$/, '') : null;

  const maxMmiRaw = shakemap?.properties?.['maxmmi'];
  const maxMmi = maxMmiRaw === undefined ? null : Number(maxMmiRaw);

  return {
    id: event.id ?? EVENT_ID,
    magnitude: expectNumber(properties.mag, 'properties.mag'),
    longitude: expectNumber(coordinates[0], 'geometry.coordinates[0]'),
    latitude: expectNumber(coordinates[1], 'geometry.coordinates[1]'),
    depthKm: expectNumber(coordinates[2], 'geometry.coordinates[2]'),
    place: typeof properties.place === 'string' ? properties.place : '',
    alert: typeof properties.alert === 'string' ? properties.alert : null,
    originTime: new Date(expectNumber(properties.time, 'properties.time')).toISOString(),
    updatedAt: new Date(expectNumber(properties.updated, 'properties.updated')).toISOString(),
    url: typeof properties.url === 'string' ? properties.url : USGS_EVENT_PAGE,
    shakemapBaseUrl,
    maxMmi: maxMmi !== null && Number.isFinite(maxMmi) ? maxMmi : null,
  };
}

export async function fetchEvent(): Promise<EarthquakeEvent> {
  return parseEvent(await fetchJson(EVENT_URL));
}

// ─────────────────────────────────────────────────────────────────────────────
// Malla de intensidad (MMI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Malla regular de intensidad Mercalli Modificada, en CoverageJSON.
 *
 * Usamos la malla y no las curvas de nivel (`cont_mi.json`): las curvas son
 * MultiLineString y responder "cuál fue el MMI máximo en este municipio" con líneas
 * obliga a reconstruir polígonos. Con una malla regular es una consulta directa.
 */
export interface MmiGrid {
  xStart: number;
  xStop: number;
  xNum: number;
  yStart: number;
  yStop: number;
  yNum: number;
  /** Fila mayor: índice = yi * xNum + xi. */
  values: number[];
}

interface RawCoverage {
  domain?: { axes?: Record<string, { start?: unknown; stop?: unknown; num?: unknown }> };
  ranges?: Record<string, { shape?: unknown; values?: unknown; axisNames?: unknown }>;
}

/** Parsea CoverageJSON de MMI. Puro: sin red. */
export function parseMmiGrid(raw: unknown): MmiGrid {
  const coverage = raw as RawCoverage;
  const x = coverage.domain?.axes?.['x'];
  const y = coverage.domain?.axes?.['y'];
  const range = coverage.ranges?.['MMI'];

  if (!x || !y || !range) {
    throw new Error('USGS: CoverageJSON sin ejes x/y o sin rango MMI');
  }

  const xNum = expectNumber(x.num, 'domain.axes.x.num');
  const yNum = expectNumber(y.num, 'domain.axes.y.num');
  const values = range.values;

  if (!Array.isArray(values)) throw new Error('USGS: ranges.MMI.values no es un arreglo');
  if (values.length !== xNum * yNum) {
    throw new Error(
      `USGS: la malla MMI no cuadra — se esperaban ${xNum * yNum} valores y llegaron ${values.length}`,
    );
  }

  // El orden de ejes declarado debe ser [y, x]; si USGS lo cambiara, el índice
  // quedaría transpuesto en silencio y el mapa saldría mal sin fallar.
  const axisNames = range.axisNames;
  if (Array.isArray(axisNames) && (axisNames[0] !== 'y' || axisNames[1] !== 'x')) {
    throw new Error(`USGS: orden de ejes inesperado en la malla MMI: ${JSON.stringify(axisNames)}`);
  }

  return {
    xStart: expectNumber(x.start, 'domain.axes.x.start'),
    xStop: expectNumber(x.stop, 'domain.axes.x.stop'),
    xNum,
    yStart: expectNumber(y.start, 'domain.axes.y.start'),
    yStop: expectNumber(y.stop, 'domain.axes.y.stop'),
    yNum,
    values: values as number[],
  };
}

export async function fetchMmiGrid(event: EarthquakeEvent): Promise<MmiGrid> {
  if (!event.shakemapBaseUrl) {
    throw new Error('USGS: el evento no trae producto ShakeMap; no hay malla de intensidad');
  }
  return parseMmiGrid(
    await fetchJson(`${event.shakemapBaseUrl}/coverage_mmi_high_res.covjson`, {
      timeoutMs: 120_000,
    }),
  );
}

/** Coordenada del centro de la celda `i` sobre un eje regular. */
export function axisValue(start: number, stop: number, num: number, index: number): number {
  if (num <= 1) return start;
  return start + ((stop - start) * index) / (num - 1);
}

/** Valor MMI en una celda concreta. Devuelve `undefined` fuera de rango. */
export function gridValueAt(grid: MmiGrid, xi: number, yi: number): number | undefined {
  if (xi < 0 || yi < 0 || xi >= grid.xNum || yi >= grid.yNum) return undefined;
  return grid.values[yi * grid.xNum + xi];
}

/** Índice de celda más cercano a una coordenada, saturado al borde de la malla. */
export function nearestIndex(start: number, stop: number, num: number, value: number): number {
  if (num <= 1) return 0;
  const step = (stop - start) / (num - 1);
  const raw = Math.round((value - start) / step);
  return Math.min(num - 1, Math.max(0, raw));
}

/** MMI en un punto, por vecino más cercano. */
export function sampleMmi(grid: MmiGrid, longitude: number, latitude: number): number | undefined {
  const xi = nearestIndex(grid.xStart, grid.xStop, grid.xNum, longitude);
  const yi = nearestIndex(grid.yStart, grid.yStop, grid.yNum, latitude);
  return gridValueAt(grid, xi, yi);
}

// ─────────────────────────────────────────────────────────────────────────────
// Réplicas
// ─────────────────────────────────────────────────────────────────────────────

export interface Aftershock {
  id: string;
  magnitude: number;
  depthKm: number;
  longitude: number;
  latitude: number;
  place: string;
  time: string;
}

/** Parsea la colección FDSN de réplicas. Puro: sin red. */
export function parseAftershocks(raw: unknown, mainEventId: string): Aftershock[] {
  const collection = raw as { features?: unknown };
  if (!Array.isArray(collection.features)) {
    throw new Error('USGS: la respuesta de réplicas no trae `features`');
  }

  return collection.features
    .map((feature) => {
      const f = feature as RawEvent;
      const coordinates = f.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 3) return undefined;
      if (typeof f.properties?.mag !== 'number') return undefined;

      return {
        id: f.id ?? '',
        magnitude: f.properties.mag,
        longitude: Number(coordinates[0]),
        latitude: Number(coordinates[1]),
        depthKm: Number(coordinates[2]),
        place: typeof f.properties.place === 'string' ? f.properties.place : '',
        time: new Date(expectNumber(f.properties.time, 'properties.time')).toISOString(),
      } satisfies Aftershock;
    })
    .filter((a): a is Aftershock => a !== undefined && a.id !== mainEventId)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

/**
 * Réplicas dentro de un radio del epicentro desde el sismo principal.
 * 400 km cubre la secuencia de un evento de subducción profundo como este.
 */
export async function fetchAftershocks(event: EarthquakeEvent): Promise<Aftershock[]> {
  const url =
    `${FDSN}?format=geojson` +
    `&starttime=${encodeURIComponent(event.originTime)}` +
    `&latitude=${event.latitude}&longitude=${event.longitude}` +
    `&maxradiuskm=400&minmagnitude=3&orderby=time-asc`;

  return parseAftershocks(await fetchJson(url, { timeoutMs: 60_000 }), event.id);
}
