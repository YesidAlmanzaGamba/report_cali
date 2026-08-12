/**
 * Secciones urbanas del DANE — geometría por debajo del municipio.
 *
 * Es la unidad oficial con la que Colombia divide el suelo urbano: Cali tiene 967
 * secciones agrupadas en 399 sectores. Sirve para ubicar un incidente **en qué parte de
 * la ciudad** en vez de solo «en Cali».
 *
 * ⚠️ **No trae nombres de barrio.** Todos los campos del MGN son códigos
 * (`secu_ccnct`, `setu_ccnct`); no hay ni un «Egipto» ni un «Medrano» en el archivo. Para
 * los nombres, el reporte de prensa se registra en el campo `barrio` del incidente. Esto
 * pone el dónde en el mapa; el cómo se llama lo pone la persona que lo registra.
 *
 * **No corre en el cron.** Son 48 MB y la geografía urbana no cambia por un terremoto.
 * Se ejecuta a mano con `npm run secciones`.
 *
 * Licencia: DANE, datos abiertos (Ley 1712 de 2014). Vía HDX `cod-ab-col`.
 */
import { unzipSync } from 'fflate';
import * as shapefile from 'shapefile';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

import { fetchBuffer } from '../http.js';
import { pcodeFromDivipola, type Source } from '../schema.js';

export const SECCIONES_SOURCE: Source = {
  name: 'DANE — Marco Geoestadístico Nacional (secciones urbanas)',
  url: 'https://data.humdata.org/dataset/cod-ab-col',
  type: 'official',
};

export const SECCIONES_ZIP_URL =
  'https://data.humdata.org/dataset/50ea7fee-f9af-45a7-8a52-abb9c790a0b6/resource/' +
  '86ec6413-73a7-402b-97ae-023f5d3bc861/download/mgn2024_urb_seccion.zip';

const BASE = 'MGN_URB_SECCION';

export interface SeccionProperties {
  /** Código completo de la sección urbana. */
  codigo: string;
  /** Sector urbano al que pertenece: la agrupación más cercana a la escala de barrio. */
  sector: string;
  /** P-code del municipio, para agrupar y servir por separado. */
  pcode: string;
  /** Área en m², útil para dar contexto de tamaño. */
  area_m2: number;
}

interface RawSeccion {
  mpio_cdpmp?: unknown;
  secu_ccnct?: unknown;
  setu_ccnct?: unknown;
  secu_narea?: unknown;
}

/** Normaliza un rasgo del MGN. Puro: sin red ni disco. */
export function toSeccion(
  raw: Feature<Geometry, unknown>,
): Feature<Geometry, SeccionProperties> | undefined {
  const p = (raw.properties ?? {}) as RawSeccion;

  const divipola = p.mpio_cdpmp;
  const codigo = p.secu_ccnct;
  if (typeof divipola !== 'string' || typeof codigo !== 'string') return undefined;

  let pcode: string;
  try {
    pcode = pcodeFromDivipola(divipola);
  } catch {
    return undefined;
  }

  return {
    type: 'Feature',
    geometry: raw.geometry,
    properties: {
      codigo,
      sector: typeof p.setu_ccnct === 'string' ? p.setu_ccnct : '',
      pcode,
      area_m2: typeof p.secu_narea === 'number' ? Math.round(p.secu_narea) : 0,
    },
  };
}

/**
 * Lee las secciones y devuelve solo las de los municipios pedidos.
 *
 * El filtro no es una optimización: son 30.520 secciones en todo el país y solo unas
 * decenas de municipios recibieron daño. Traerlas todas engordaría el repositorio con
 * geometría de ciudades donde no pasó nada.
 */
export async function fetchSecciones(
  pcodes: Set<string>,
  zip?: Uint8Array,
): Promise<Map<string, FeatureCollection<Geometry, SeccionProperties>>> {
  const archivo = zip ?? (await fetchBuffer(SECCIONES_ZIP_URL, { timeoutMs: 900_000 }));
  const archivos = unzipSync(archivo);

  const shp = archivos[`${BASE}.shp`];
  const dbf = archivos[`${BASE}.dbf`];
  if (!shp || !dbf) throw new Error(`El zip no contiene ${BASE}.shp/.dbf`);

  const coleccion = (await shapefile.read(shp as never, dbf as never, {
    encoding: 'utf8',
  })) as FeatureCollection<Geometry, unknown>;

  const porMunicipio = new Map<string, FeatureCollection<Geometry, SeccionProperties>>();

  for (const bruto of coleccion.features) {
    const seccion = toSeccion(bruto);
    if (!seccion || !pcodes.has(seccion.properties.pcode)) continue;

    const actual = porMunicipio.get(seccion.properties.pcode);
    if (actual) actual.features.push(seccion);
    else
      porMunicipio.set(seccion.properties.pcode, {
        type: 'FeatureCollection',
        features: [seccion],
      });
  }

  return porMunicipio;
}
