/**
 * Deslizamientos y licuefacción — producto `ground-failure` del USGS.
 *
 * En terreno montañoso —Chocó, Risaralda, Quindío— esta capa se lee como **riesgo de
 * acceso vial**: es lo más útil que hay para decidir por dónde entra un convoy. Un
 * municipio con daño moderado pero la vía cortada puede ser más urgente que uno con daño
 * mayor y carretera abierta.
 *
 * **El USGS solo publica esto como ráster** (`.tif`, `.hdf5`, `.kmz`): no hay vectores.
 * Pero también expone un PNG de superposición junto con sus límites geográficos, y eso sí
 * se puede montar en MapLibre como fuente de imagen, sin servidor de teselas.
 *
 * El PNG se **descarga y se guarda con nosotros** en vez de enlazarlo en caliente. Es el
 * mismo criterio de ADR-010: no queremos que el mapa dependa en tiempo real de un
 * servidor ajeno que puede caerse justo cuando más se consulta.
 *
 * Licencia: dominio público (obra del gobierno de EE. UU.).
 */
import { fetchBuffer } from '../http.js';
import type { EarthquakeEvent } from './usgs.js';
import { USGS_SOURCE } from './usgs.js';
import type { Observation, Source } from '../schema.js';

export const DESLIZAMIENTOS_SOURCE: Source = USGS_SOURCE;

/** Límites de la superposición, en el orden que espera MapLibre. */
export interface Superposicion {
  /** Ruta relativa dentro de `data/`. */
  imagen: string;
  /** Esquinas: superior-izq, superior-der, inferior-der, inferior-izq. */
  esquinas: [number, number][];
  /** Nivel de alerta PAGER para deslizamiento: green | yellow | orange | red. */
  alerta: string | null;
  /** Índice agregado de amenaza, tal como lo publica el USGS. */
  amenaza: number | null;
  /** Personas expuestas a deslizamiento, según el modelo del USGS. */
  poblacion_expuesta: number | null;
  modelo: string;
  fuente: Source;
}

interface RawProducto {
  properties?: Record<string, string>;
  contents?: Record<string, { url?: string }>;
}

function numero(valor: string | undefined): number | null {
  if (valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrae la superposición del producto `ground-failure`. Puro: sin red.
 *
 * Devuelve `undefined` si el evento no trae el producto —no todos los sismos lo tienen—
 * y eso no es un error: es un evento sin modelo de deslizamiento.
 */
export function parsearDeslizamientos(
  crudo: unknown,
): (Omit<Superposicion, 'imagen' | 'fuente'> & { url: string }) | undefined {
  const evento = crudo as { properties?: { products?: Record<string, RawProducto[]> } };
  const producto = evento.properties?.products?.['ground-failure']?.[0];
  if (!producto) return undefined;

  const p = producto.properties ?? {};
  const nombreImagen = p['landslide-overlay'];
  if (!nombreImagen) return undefined;

  const url = producto.contents?.[nombreImagen]?.url;
  if (!url) return undefined;

  const sur = numero(p['landslide-minimum-latitude']);
  const norte = numero(p['landslide-maximum-latitude']);
  const oeste = numero(p['landslide-minimum-longitude']);
  const este = numero(p['landslide-maximum-longitude']);

  if (sur === null || norte === null || oeste === null || este === null) return undefined;

  return {
    url,
    // MapLibre pide las cuatro esquinas en sentido horario desde la superior izquierda.
    esquinas: [
      [oeste, norte],
      [este, norte],
      [este, sur],
      [oeste, sur],
    ],
    alerta: p['landslide-alert'] ?? null,
    amenaza: numero(p['landslide-hazard-alert-value']),
    poblacion_expuesta: numero(p['landslide-population-alert-value']),
    modelo: nombreImagen.replace(/\.png$/, ''),
  };
}

/**
 * Convierte la alerta del modelo en observaciones con procedencia.
 *
 * Se marca como `official` porque viene directo del USGS, sin intermediarios — a
 * diferencia de las cifras de prensa, donde la cadena de custodia pasa por un medio.
 */
export function observacionesDeslizamiento(
  datos: { poblacion_expuesta: number | null; alerta: string | null },
  evento: EarthquakeEvent,
  ahora: Date = new Date(),
): Observation[] {
  if (datos.poblacion_expuesta === null) return [];

  return [
    {
      metric: 'people_affected',
      value: Math.round(datos.poblacion_expuesta),
      pcode: 'CO',
      source: DESLIZAMIENTOS_SOURCE,
      observed_at: evento.updatedAt,
      ingested_at: ahora.toISOString(),
      notes: `Personas expuestas a deslizamiento según el modelo del USGS. Alerta: ${
        datos.alerta ?? 'n/d'
      }.`,
    } as Observation,
  ];
}

/** Descarga la imagen de superposición. */
export async function fetchImagenDeslizamiento(url: string): Promise<Uint8Array> {
  return fetchBuffer(url, { timeoutMs: 120_000 });
}
