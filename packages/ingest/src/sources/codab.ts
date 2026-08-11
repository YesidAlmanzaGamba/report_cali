/**
 * Adaptador COD-AB — límites administrativos de Colombia (ADR-006).
 *
 * Fuente: HDX `cod-ab-col`, datos del DANE normalizados por ITOS. Los P-codes
 * (`CO05002`) equivalen a DIVIPOLA, así que sirven de llave tanto con datos
 * nacionales como con el resto del ecosistema humanitario.
 *
 * **Esto NO corre en el cron de 15 minutos.** Los límites municipales no cambian durante
 * un desastre, y la descarga son 117 MB. Se ejecuta a mano con `npm run boundaries`
 * cuando haga falta actualizarlos.
 *
 * Licencia de la fuente: CC-BY-IGO 3.0. Atribución: «OCHA / DANE».
 */
import { unzipSync } from 'fflate';
import * as shapefile from 'shapefile';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import { feature, quantize } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

import { fetchBuffer } from '../http.js';
import type { Source } from '../schema.js';

export const CODAB_SOURCE: Source = {
  name: 'COD-AB (OCHA / DANE)',
  url: 'https://data.humdata.org/dataset/cod-ab-col',
  type: 'humanitarian',
};

export const CODAB_ZIP_URL =
  'https://data.humdata.org/dataset/50ea7fee-f9af-45a7-8a52-abb9c790a0b6/resource/' +
  '32fba556-0109-4d1c-84cb-c8abddf7775b/download/col-administrative-divisions-shapefiles.zip';

/** Nombres base de los shapefiles dentro del zip. */
const ADM1_BASE = 'col_admbnda_adm1_mgn_20200416';
const ADM2_BASE = 'col_admbnda_adm2_mgn_20200416';

/** Propiedades que conservamos. Todo lo demás se descarta para bajar el peso. */
export interface MunicipioProperties {
  /** P-code admin2, ej. `CO76001`. */
  pcode: string;
  /** Nombre del municipio, ej. `Cali`. */
  name: string;
  /** P-code del departamento, ej. `CO76`. */
  admin1_pcode: string;
  /** Nombre del departamento, ej. `Valle del Cauca`. */
  admin1_name: string;
}

export interface DepartamentoProperties {
  pcode: string;
  name: string;
}

interface RawAdminProperties {
  ADM2_PCODE?: unknown;
  ADM2_ES?: unknown;
  ADM1_PCODE?: unknown;
  ADM1_ES?: unknown;
}

function requireString(value: unknown, field: string, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`COD-AB: falta "${field}" en ${context}`);
  }
  return value;
}

/**
 * Normaliza un rasgo admin2 quedándose solo con lo que usamos.
 * Puro: sin red ni disco.
 */
export function toMunicipio(raw: Feature<Geometry, unknown>): Feature<Geometry, MunicipioProperties> {
  const p = (raw.properties ?? {}) as RawAdminProperties;
  const pcode = requireString(p.ADM2_PCODE, 'ADM2_PCODE', 'un rasgo admin2');

  return {
    type: 'Feature',
    geometry: raw.geometry,
    properties: {
      pcode,
      name: requireString(p.ADM2_ES, 'ADM2_ES', `el municipio ${pcode}`),
      admin1_pcode: requireString(p.ADM1_PCODE, 'ADM1_PCODE', `el municipio ${pcode}`),
      admin1_name: requireString(p.ADM1_ES, 'ADM1_ES', `el municipio ${pcode}`),
    },
  };
}

export function toDepartamento(
  raw: Feature<Geometry, unknown>,
): Feature<Geometry, DepartamentoProperties> {
  const p = (raw.properties ?? {}) as RawAdminProperties;
  const pcode = requireString(p.ADM1_PCODE, 'ADM1_PCODE', 'un rasgo admin1');

  return {
    type: 'Feature',
    geometry: raw.geometry,
    properties: { pcode, name: requireString(p.ADM1_ES, 'ADM1_ES', `el departamento ${pcode}`) },
  };
}

/**
 * Topología simplificada, lista para servir al navegador.
 *
 * Dos razones para quedarnos en TopoJSON en vez de volver a GeoJSON:
 *
 * 1. **Peso.** Los 1.122 municipios en GeoJSON simplificado pesan 1,1 MB comprimidos y
 *    revientan el presupuesto de 300 KB. En TopoJSON las fronteras compartidas se
 *    guardan una sola vez y las coordenadas van cuantizadas: baja alrededor de 5×.
 * 2. **Costuras.** Simplificar cada polígono por separado abre grietas entre municipios
 *    vecinos, porque los puntos de la frontera compartida se descartan distinto a cada
 *    lado. En TopoJSON esa frontera es un único arco y se simplifica una sola vez.
 *
 * @param retention proporción de puntos a conservar (0.04 ≈ 4 %).
 */
export type SimplifiedTopology = { type: 'Topology'; objects: Record<string, unknown> };

export function simplifyPreservingTopology<P>(
  collection: FeatureCollection<Geometry, P>,
  retention: number,
  quantization = 1e4,
): SimplifiedTopology {
  // El orden importa y es contraintuitivo: **primero simplificar, después cuantizar.**
  //
  // Cuantizar de entrada ancla los puntos a una rejilla, y el simplificador ya no puede
  // medir bien qué punto aporta poco; además deja coordenadas más largas en el archivo
  // final. Cuantizar al final, sobre una geometría que ya tiene pocos puntos, es lo que
  // de verdad achica el archivo: las coordenadas quedan como enteros pequeños y delta-
  // codificados.
  //
  // (`@types/topojson-server` y `@types/topojson-simplify` declaran cotas genéricas
  // distintas para Topology, así que no encadenan sin ayuda. Los tipos reales sí son
  // compatibles en ejecución; aislamos el desacuerdo aquí.)
  const topo = topology({ municipios: collection as never }) as never;
  const presimplified = presimplify(topo);
  const weight = quantile(presimplified, retention);
  const simplified = simplify(presimplified, weight);

  return quantize(simplified as never, quantization) as unknown as SimplifiedTopology;
}

/** Convierte la topología de vuelta a GeoJSON (lo usa el pipeline para el cruce). */
export function topologyToFeatures<P>(
  topo: SimplifiedTopology,
  layer = 'municipios',
): FeatureCollection<Geometry, P> {
  return feature(topo as never, topo.objects[layer] as never) as unknown as FeatureCollection<
    Geometry,
    P
  >;
}

/** Lee un shapefile desde buffers en memoria. */
async function readShapefile(shp: Uint8Array, dbf: Uint8Array): Promise<Feature<Geometry, unknown>[]> {
  const collection = (await shapefile.read(shp as never, dbf as never, {
    encoding: 'utf8',
  })) as FeatureCollection<Geometry, unknown>;

  return collection.features;
}

export interface Boundaries {
  municipios: FeatureCollection<Geometry, MunicipioProperties>;
  departamentos: FeatureCollection<Geometry, DepartamentoProperties>;
}

/**
 * Descarga y procesa los límites. Devuelve geometría a resolución completa;
 * simplificar es responsabilidad de quien llama.
 */
export async function fetchBoundaries(zip?: Uint8Array): Promise<Boundaries> {
  const archive = zip ?? (await fetchBuffer(CODAB_ZIP_URL, { timeoutMs: 900_000 }));
  const files = unzipSync(archive);

  const read = async (base: string) => {
    const shp = files[`${base}.shp`];
    const dbf = files[`${base}.dbf`];
    if (!shp || !dbf) throw new Error(`COD-AB: el zip no contiene ${base}.shp/.dbf`);
    return readShapefile(shp, dbf);
  };

  const [adm2, adm1] = await Promise.all([read(ADM2_BASE), read(ADM1_BASE)]);

  return {
    municipios: { type: 'FeatureCollection', features: adm2.map(toMunicipio) },
    departamentos: { type: 'FeatureCollection', features: adm1.map(toDepartamento) },
  };
}
