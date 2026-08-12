/**
 * Población por municipio — DANE vía HDX (`cod-ps-col`).
 *
 * Es lo que permite el segundo modo del mapa: no «dónde tembló más» sino **dónde hay más
 * gente que lo vivió**. Un MMI VIII en un páramo vacío no es lo mismo que un MMI VII en
 * Cali con más de dos millones de habitantes, y para decidir a dónde mandar un equipo la
 * segunda pregunta suele importar más.
 *
 * Deliberadamente **no calculamos un índice de daño**. Sería fácil multiplicar población
 * por un coeficiente según la intensidad y llamarlo «impacto estimado», pero esos
 * coeficientes serían inventados y quedarían escondidos dentro de un color. Lo que
 * publicamos es un conteo: cuánta gente vive donde el sacudimiento alcanzó cierto nivel.
 * Se explica en una frase y se puede defender ante cualquiera.
 *
 * Licencia: CC-BY-IGO. Atribución: «DANE / OCHA».
 */
import { fetchWithRetry } from '../http.js';
import type { Source } from '../schema.js';

export const POBLACION_SOURCE: Source = {
  name: 'DANE / OCHA — proyección de población 2025',
  url: 'https://data.humdata.org/dataset/cod-ps-col',
  type: 'humanitarian',
};

export const POBLACION_CSV_URL =
  'https://data.humdata.org/dataset/8520e386-9263-48c9-b1bf-b2349e019fbb/resource/' +
  '56f0ef9b-b1df-4d7f-b2e1-6cb27aaecdb4/download/copy-of-col_admpop_adm2_2025.csv';

export interface PoblacionMunicipio {
  pcode: string;
  /** Población total proyectada. */
  total: number;
  /**
   * Menores de 5 y mayores de 65. Es el grupo que una respuesta humanitaria prioriza:
   * son quienes peor toleran dormir a la intemperie y quienes más dependen de que
   * alguien llegue.
   */
  vulnerable: number;
}

/** Columnas de edad que suman el grupo vulnerable. */
const COLUMNAS_VULNERABLES = [
  'T_00_04',
  'T_65_69',
  'T_70_74',
  'T_75_79',
  'T_80_84',
  'T_85_89',
  'T_90_94',
  'T_95_99',
  'T_100Plus',
];

/**
 * Parte una línea CSV respetando las comillas.
 *
 * El archivo del DANE trae los nombres entrecomillados y algunos llevan coma
 * («Bogotá, D.C.»), así que partir por comas a secas corre todas las columnas.
 */
export function partirLineaCsv(linea: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let dentroDeComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];

    if (c === '"') {
      if (dentroDeComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        dentroDeComillas = !dentroDeComillas;
      }
      continue;
    }

    if (c === ',' && !dentroDeComillas) {
      celdas.push(actual);
      actual = '';
      continue;
    }

    actual += c;
  }

  celdas.push(actual);
  return celdas;
}

/** Parsea el CSV de población. Puro: sin red. */
export function parsearPoblacion(csv: string): PoblacionMunicipio[] {
  const lineas = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) throw new Error('Población: el CSV no trae filas');

  const encabezado = partirLineaCsv(lineas[0] ?? '').map((h) => h.replace(/"/g, '').trim());
  const indice = (nombre: string) => encabezado.indexOf(nombre);

  const iPcode = indice('ADM2_PCODE');
  const iTotal = indice('T_TL');
  if (iPcode === -1 || iTotal === -1) {
    throw new Error('Población: faltan las columnas ADM2_PCODE o T_TL');
  }

  const iVulnerables = COLUMNAS_VULNERABLES.map(indice).filter((i) => i !== -1);

  const salida: PoblacionMunicipio[] = [];

  for (const linea of lineas.slice(1)) {
    const celdas = partirLineaCsv(linea);
    const pcode = (celdas[iPcode] ?? '').replace(/"/g, '').trim();
    const total = Number(celdas[iTotal]);
    if (!pcode || !Number.isFinite(total)) continue;

    const vulnerable = iVulnerables.reduce((suma, i) => {
      const n = Number(celdas[i]);
      return suma + (Number.isFinite(n) ? n : 0);
    }, 0);

    salida.push({ pcode, total: Math.round(total), vulnerable: Math.round(vulnerable) });
  }

  if (salida.length === 0) throw new Error('Población: no se pudo leer ningún municipio');
  return salida;
}

export async function fetchPoblacion(): Promise<PoblacionMunicipio[]> {
  const respuesta = await fetchWithRetry(POBLACION_CSV_URL, { timeoutMs: 120_000 });
  return parsearPoblacion(await respuesta.text());
}
