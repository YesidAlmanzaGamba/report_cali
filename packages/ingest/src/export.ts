/**
 * Exportación en CSV con etiquetas HXL.
 *
 * Es lo que convierte el sitio en herramienta de trabajo en vez de solo una página para
 * mirar: un coordinador se lleva la tabla a su propio análisis sin copiar nada a mano.
 *
 * **HXL** (Humanitarian Exchange Language) es el estándar de etiquetado de OCHA: una
 * segunda fila de encabezado con etiquetas como `#affected+killed`. Se ve rara si abres
 * el archivo en Excel, pero es lo que permite que las herramientas del ecosistema
 * humanitario —HDX incluido— entiendan las columnas sin que nadie las mapee a mano.
 * Cuesta una fila y ahorra una reunión.
 */
import type { Cobertura } from './cobertura.js';
import type { Metric, Observation } from './schema.js';
import type { MunicipioMmi } from './join/mmi.js';

/**
 * Etiquetas HXL por métrica. Las de `#affected` son estándar; para infraestructura no
 * hay un vocabulario tan cerrado, así que se usan atributos descriptivos.
 */
const HXL_POR_METRICA: Record<Metric, string> = {
  deaths_confirmed: '#affected+killed',
  injured: '#affected+injured',
  missing_reported: '#affected+missing',
  people_trapped: '#affected+trapped',
  people_rescued: '#affected+rescued',
  people_affected: '#affected+total',
  people_displaced: '#affected+displaced',
  buildings_collapsed: '#infra+housing+destroyed',
  buildings_partially_collapsed: '#infra+housing+collapsed+partial',
  buildings_damaged: '#infra+housing+damaged',
  health_facilities_affected: '#infra+health+damaged',
  schools_affected: '#infra+education+damaged',
  roads_blocked: '#infra+road+damaged',
  shelters_open: '#infra+shelter+num',
  shelter_capacity: '#capacity+shelter+num',
  power_outage_users: '#infra+energy+affected',
  water_service_affected: '#infra+water+affected',
};

/** Comillas solo cuando hacen falta, y dobles comillas escapadas según RFC 4180. */
function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(rows: (string | number | undefined)[][]): string {
  // CRLF: es lo que pide RFC 4180 y lo que Excel espera en Windows, que es donde va a
  // abrirse este archivo en la mayoría de alcaldías.
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export interface ExportOptions {
  /** P-code → nombre legible, para que el CSV se entienda sin cruzarlo con otra tabla. */
  nombres: Map<string, string>;
}

/**
 * Observaciones en formato largo: una fila por dato.
 *
 * Largo y no ancho a propósito. Una tabla ancha (una columna por métrica) obliga a
 * inventar celdas vacías y no tiene dónde poner la fuente de cada cifra — y aquí cada
 * cifra tiene su propia fuente y su propia hora de corte.
 */
export function observacionesToCsv(
  observaciones: Observation[],
  { nombres }: ExportOptions,
): string {
  const encabezado = [
    'pcode',
    'lugar',
    'metrica',
    'etiqueta_hxl',
    'valor',
    'observado_en',
    'fuente',
    'tipo_de_fuente',
    'url_fuente',
    'notas',
  ];

  // En formato largo, la etiqueta del valor no puede variar por fila, así que `valor`
  // lleva `#indicator+num` genérico. La etiqueta específica de cada métrica va en su
  // propia columna, para que quien pivote la tabla la recupere sin volver a mapear nada.
  const hxl = [
    '#loc+code',
    '#loc+name',
    '#indicator+name',
    '#meta+tag',
    '#indicator+num',
    '#date+observed',
    '#meta+source',
    '#meta+source+type',
    '#meta+url',
    '#description',
  ];

  const filas = observaciones.map((o) => [
    o.pcode,
    nombres.get(o.pcode) ?? (o.pcode === 'CO' ? 'Colombia' : ''),
    o.metric,
    HXL_POR_METRICA[o.metric],
    o.value,
    o.observed_at,
    o.source.name,
    o.source.type,
    o.source.url,
    o.notes,
  ]);

  return csvRows([encabezado, hxl, ...filas]);
}

/** Intensidad por municipio, para cruzar contra cualquier otra tabla por P-code. */
export function mmiToCsv(municipios: MunicipioMmi[]): string {
  const encabezado = [
    'pcode',
    'municipio',
    'pcode_departamento',
    'departamento',
    'mmi',
    'grado_mercalli',
    'metodo',
  ];

  const hxl = ['#adm2+code', '#adm2+name', '#adm1+code', '#adm1+name', '#severity+mmi+num', '#severity+mmi+code', '#meta+method'];

  const filas = municipios.map((m) => [
    m.pcode,
    m.name,
    m.admin1_pcode,
    m.admin1_name,
    m.mmi,
    m.mmi_roman,
    m.method === 'grid' ? 'malla' : 'centroide',
  ]);

  return csvRows([encabezado, hxl, ...filas]);
}

/**
 * Cobertura periodística por municipio — y su reverso.
 *
 * La columna que hace útil este archivo es `sin_cobertura`: filtrar por «sí» en una hoja
 * de cálculo da, en un clic, la lista de municipios golpeados de los que no informa
 * nadie. Es la pregunta que un coordinador quiere cruzar contra sus propios datos, y en
 * el JSON obliga a recorrer un arreglo.
 *
 * `medios` va como texto separado por «·» y no como columnas: cuántos medios cubren un
 * municipio varía de cero a diez, y una tabla con diez columnas de medio estaría vacía
 * casi entera.
 */
export function coberturaToCsv(cobertura: Cobertura): string {
  const encabezado = [
    'pcode',
    'municipio',
    'departamento',
    'mmi',
    'poblacion',
    'notas',
    'medios',
    'ultima_nota',
    'sin_cobertura',
  ];

  const hxl = [
    '#adm2+code',
    '#adm2+name',
    '#adm1+name',
    '#severity+mmi+num',
    '#population+total+num',
    '#meta+count+num',
    '#meta+source+list',
    '#date+latest',
    '#status+coverage',
  ];

  const filas = cobertura.municipios.map((m) => [
    m.pcode,
    m.nombre,
    m.departamento,
    m.mmi ?? undefined,
    m.poblacion ?? undefined,
    m.notas,
    m.medios.map((x) => `${x.nombre} (${x.notas})`).join(' · '),
    m.ultima,
    m.notas === 0 ? 'sí' : 'no',
  ]);

  return csvRows([encabezado, hxl, ...filas]);
}

/** La etiqueta HXL de una métrica, para quien quiera construir otra exportación. */
export function hxlTagFor(metric: Metric): string {
  return HXL_POR_METRICA[metric];
}
