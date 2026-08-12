/**
 * Unión geográfica: intensidad MMI máxima por municipio.
 *
 * Es el cálculo central del mapa (ADR-005). La magnitud es un solo número para todo el
 * sismo — 7.4 en Quibdó y 7.4 en Bogotá — así que no dice nada de un municipio concreto.
 * El MMI es lo que cada lugar realmente sintió.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson';

import { axisValue, gridValueAt, nearestIndex, sampleMmi, type MmiGrid } from '../sources/usgs.js';
import type { MunicipioProperties } from '../sources/codab.js';

export interface MunicipioMmi {
  pcode: string;
  name: string;
  admin1_pcode: string;
  admin1_name: string;
  /** MMI máximo dentro del municipio, con un decimal. */
  mmi: number;
  /** Grado en números romanos, para mostrar (I–XII). */
  mmi_roman: string;
  /** `grid` si hubo celdas dentro del polígono; `centroid` si el municipio es más
   *  pequeño que una celda y hubo que muestrear en su centro. */
  method: 'grid' | 'centroid';
  /** Población proyectada 2025 (DANE/OCHA). Ausente si no se pudo cruzar. */
  poblacion?: number;
  /** Menores de 5 más mayores de 65: el grupo que prioriza una respuesta humanitaria. */
  poblacion_vulnerable?: number;
}

/** Umbral donde el sacudimiento empieza a causar daño. Define «gente expuesta». */
export const MMI_UMBRAL_DANINO = 6;

const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const;

/**
 * MMI a número romano. El MMI se reporta con decimales pero se comunica en grados
 * enteros: 7.6 es «VIII» en la escala de Mercalli, no «VII y algo».
 */
export function mmiToRoman(mmi: number): string {
  const degree = Math.min(12, Math.max(1, Math.round(mmi)));
  return ROMAN[degree - 1] ?? 'I';
}

/** Caja envolvente [minX, minY, maxX, maxY] de una geometría. */
export function bboxOf(geometry: Geometry): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return;
    }
    for (const child of coords) visit(child);
  };

  visit((geometry as { coordinates?: unknown }).coordinates);
  return [minX, minY, maxX, maxY];
}

/**
 * MMI máximo dentro de un polígono.
 *
 * Recorre solo las celdas de la malla que caen en la caja envolvente, y de esas se queda
 * con las que están de verdad dentro del polígono. Si ninguna celda cae adentro —pasa con
 * los municipios más pequeños que la celda de ~2 km— se muestrea en el centro de la caja.
 * El campo MMI varía suavemente, así que esa aproximación es buena; el método queda
 * registrado en la salida para que sea auditable.
 */
export function maxMmiInPolygon(
  grid: MmiGrid,
  geometry: Geometry,
): { mmi: number; method: 'grid' | 'centroid' } | undefined {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  if (!Number.isFinite(minX)) return undefined;

  const polygon = { type: 'Feature', properties: {}, geometry } as Feature<Polygon | MultiPolygon>;

  const xFrom = nearestIndex(grid.xStart, grid.xStop, grid.xNum, minX);
  const xTo = nearestIndex(grid.xStart, grid.xStop, grid.xNum, maxX);
  const yFrom = nearestIndex(grid.yStart, grid.yStop, grid.yNum, minY);
  const yTo = nearestIndex(grid.yStart, grid.yStop, grid.yNum, maxY);

  let max = -Infinity;

  for (let yi = yFrom; yi <= yTo; yi++) {
    const lat = axisValue(grid.yStart, grid.yStop, grid.yNum, yi);

    for (let xi = xFrom; xi <= xTo; xi++) {
      const value = gridValueAt(grid, xi, yi);
      if (value === undefined || value <= max) continue;

      const lon = axisValue(grid.xStart, grid.xStop, grid.xNum, xi);
      if (booleanPointInPolygon([lon, lat], polygon)) max = value;
    }
  }

  if (max > -Infinity) return { mmi: max, method: 'grid' };

  const centroid = sampleMmi(grid, (minX + maxX) / 2, (minY + maxY) / 2);
  return centroid === undefined ? undefined : { mmi: centroid, method: 'centroid' };
}

/**
 * Cruza la malla de MMI contra los municipios.
 * Los municipios fuera de la cobertura de la malla se omiten: la malla del ShakeMap no
 * cubre todo el país, y un cero inventado se leería como «aquí no se sintió nada».
 */
export function joinMmiToMunicipios(
  grid: MmiGrid,
  municipios: FeatureCollection<Geometry, MunicipioProperties>,
): MunicipioMmi[] {
  const result: MunicipioMmi[] = [];

  for (const municipio of municipios.features) {
    const sample = maxMmiInPolygon(grid, municipio.geometry);
    if (!sample) continue;

    const mmi = Math.round(sample.mmi * 10) / 10;

    result.push({
      pcode: municipio.properties.pcode,
      name: municipio.properties.name,
      admin1_pcode: municipio.properties.admin1_pcode,
      admin1_name: municipio.properties.admin1_name,
      mmi,
      mmi_roman: mmiToRoman(mmi),
      method: sample.method,
    });
  }

  return result.sort((a, b) => b.mmi - a.mmi || a.pcode.localeCompare(b.pcode));
}

/**
 * Añade la población a cada municipio.
 *
 * Se hace aparte del cruce con la malla para que un fallo de la fuente de población no
 * tumbe el mapa de intensidad, que es la capa principal. Sin población, el municipio
 * simplemente no aparece en el modo «Gente expuesta».
 */
export function conPoblacion(
  municipios: MunicipioMmi[],
  poblacion: { pcode: string; total: number; vulnerable: number }[],
): MunicipioMmi[] {
  const porPcode = new Map(poblacion.map((p) => [p.pcode, p]));

  return municipios.map((m) => {
    const p = porPcode.get(m.pcode);
    if (!p) return m;

    return { ...m, poblacion: p.total, poblacion_vulnerable: p.vulnerable };
  });
}

/**
 * Personas que vivieron un sacudimiento dañino, por municipio.
 *
 * No es un índice ni un modelo: es la población de los municipios donde el MMI llegó al
 * umbral de daño. Los que quedan por debajo se excluyen en vez de ponerles cero, porque
 * un cero se dibujaría como «aquí no hay nadie».
 */
export function genteExpuesta(municipios: MunicipioMmi[]): {
  total: number;
  vulnerable: number;
  municipios: number;
} {
  let total = 0;
  let vulnerable = 0;
  let contados = 0;

  for (const m of municipios) {
    if (m.mmi < MMI_UMBRAL_DANINO || m.poblacion === undefined) continue;
    total += m.poblacion;
    vulnerable += m.poblacion_vulnerable ?? 0;
    contados++;
  }

  return { total, vulnerable, municipios: contados };
}
