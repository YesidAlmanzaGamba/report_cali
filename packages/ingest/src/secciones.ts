/**
 * Construye la geometría urbana por municipio. Se ejecuta a mano, NO en el cron.
 *
 *   npm run secciones -w @report-cali/ingest
 *   npm run secciones -w @report-cali/ingest -- --zip ./urb.zip --mmi 5
 *
 * Son 48 MB de descarga y la geografía urbana no cambia por un terremoto, así que esto
 * se corre una vez y se versiona.
 *
 * ## Qué se guarda y qué no
 *
 * **Umbral por defecto: MMI ≥ 5** («fuerte»: lo siente casi todo el mundo y se mueven
 * los objetos). Debajo de eso el sismo no dejó nada que un mapa de situación pueda
 * mostrar, y la trama urbana de una ciudad donde no pasó nada es peso muerto.
 *
 * El recorrido de este umbral vale la pena contarlo, porque los dos extremos estuvieron
 * mal. Empezó en **6,5** y dejaba 111 municipios: tocar cualquiera de los otros 1.011 no
 * mostraba ningún casco, que fue lo que reportó `agente-ui`. Se regeneró con **0**, los
 * 1.122, y entonces sobraba lo contrario — Barranquilla, Cartagena y Cúcuta, a cientos
 * de kilómetros, ocupaban 506 KB entre las tres. En 5 caben los 440 municipios donde
 * de verdad se sintió, **incluidas Bogotá (5,7) y Medellín (5,8)**, que están lejos pero
 * concentran centros de acopio.
 *
 * Y se guarda igualmente, sin importar el MMI, **cualquier municipio con puntos de ayuda
 * o incidentes registrados**: si el mapa muestra algo ahí, la trama tiene que estar. Eso
 * evita que un centro de acopio en un municipio poco sacudido se quede sin contexto.
 */
import { readFile } from 'node:fs/promises';

import { cargarAyuda } from './ayuda.js';
import { cargarIncidentes } from './incidentes.js';
import { DATA_DIR } from './paths.js';
import { writeJson, writeTopoJson } from './persist.js';
import { simplifyPreservingTopology } from './sources/codab.js';
import { SECCIONES_SOURCE, fetchSecciones } from './sources/secciones.js';

/** Detalle suficiente para reconocer la trama urbana sin engordar el archivo. */
const RETENCION = 0.15;

/**
 * A partir de cuántas secciones se empieza a simplificar más fuerte, y hasta dónde.
 *
 * El coste de esta capa lo paga quien **toca** el municipio, uno a uno, así que lo que
 * importa no es el total sino el peor archivo. Con retención uniforme los extremos se
 * disparaban: **Bogotá 790 KB** (2.843 secciones) y Medellín 337 KB, contra una mediana
 * de 6 KB. Sobre el 3G malo que este proyecto pone como caso real, Bogotá eran más de
 * tres segundos de espera después de tocar.
 *
 * La retención baja en proporción a las secciones, así que el detalle se reparte: un
 * municipio con el triple de manzanas conserva un tercio de los puntos por manzana. El
 * suelo se pone en 0,04 para que la trama no se convierta en polígonos irreconocibles.
 */
const SECCIONES_COMODAS = 700;
const RETENCION_MINIMA = 0.04;

function retencionPara(secciones: number): number {
  if (secciones <= SECCIONES_COMODAS) return RETENCION;
  return Math.max(RETENCION_MINIMA, (RETENCION * SECCIONES_COMODAS) / secciones);
}

/**
 * Caja envolvente del suelo urbano de un municipio: `[oeste, sur, este, norte]`.
 *
 * Va en el índice a petición de `agente-ui`. Sirve para anclar el nombre del municipio
 * **sobre el casco** en vez de sobre el centro geométrico del término municipal, que en
 * los municipios grandes no es el pueblo: medido, en Quibdó el centro geométrico queda a
 * **37,4 km** de la ciudad. Con el `bbox` en el índice eso se arregla sin bajar el
 * topojson de cada municipio, que es lo que hoy lo hace imposible.
 *
 * Se calcula sobre la geometría **sin simplificar**: la simplificación puede mover un
 * vértice del borde, y aquí lo que importa es dónde está la mancha urbana, no su detalle.
 */
function cajaDe(coleccion: { features: { geometry: unknown }[] }): [number, number, number, number] {
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;

  const visitar = (nodo: unknown): void => {
    if (!Array.isArray(nodo)) return;
    // Una posición es [lon, lat] (a veces con altura): dos primeros números.
    if (typeof nodo[0] === 'number' && typeof nodo[1] === 'number') {
      const [lon, lat] = nodo as [number, number];
      if (lon < oeste) oeste = lon;
      if (lon > este) este = lon;
      if (lat < sur) sur = lat;
      if (lat > norte) norte = lat;
      return;
    }
    for (const hijo of nodo) visitar(hijo);
  };

  for (const f of coleccion.features) {
    visitar((f.geometry as { coordinates?: unknown }).coordinates);
  }

  /**
   * Cuatro decimales, ~11 m. Medido: con seis (~0,1 m) el índice pesa 176 KB y **29 KB
   * comprimidos**, y se descarga junto con el mapa. Para colocar un texto de 80 px de
   * ancho, once metros sobran; los otros dos decimales eran 9 KB de precisión que nadie
   * puede ver. El índice pasa a 1.121 entradas cuando se generan todos los municipios,
   * así que cada carácter por entrada se paga 1.121 veces.
   */
  const r = (n: number): number => Math.round(n * 1e4) / 1e4;
  return [r(oeste), r(sur), r(este), r(norte)];
}

/** Centroide del anillo exterior de mayor área de una geometría. */
function centroideDe(geom: { type?: string; coordinates?: unknown }): [number, number] | undefined {
  // Anillos exteriores: Polygon → coordinates[0]; MultiPolygon → cada parte[0].
  const anillos: number[][][] =
    geom.type === 'MultiPolygon'
      ? (geom.coordinates as number[][][][]).map((p) => p[0] ?? [])
      : [((geom.coordinates as number[][][]) ?? [])[0] ?? []];

  let mejorArea = -1;
  let mejor: [number, number] | undefined;

  for (const anillo of anillos) {
    if (anillo.length < 4) continue;

    // Fórmula del cordón de zapato: área y centroide en la misma pasada. Sin proyectar —
    // a escala de una sección urbana el error de trabajar en grados es irrelevante.
    let a2 = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [x1, y1] = anillo[j] as [number, number];
      const [x2, y2] = anillo[i] as [number, number];
      const cruz = x1 * y2 - x2 * y1;
      a2 += cruz;
      cx += (x1 + x2) * cruz;
      cy += (y1 + y2) * cruz;
    }

    const area = Math.abs(a2) / 2;
    if (area > mejorArea && a2 !== 0) {
      mejorArea = area;
      mejor = [cx / (3 * a2), cy / (3 * a2)];
    }
  }

  return mejor;
}

const mediana = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] as number) : (((s[m - 1] as number) + (s[m] as number)) / 2);
};

/**
 * Punto sobre el que colocar el nombre del municipio: **la mediana de los centroides de
 * sus secciones urbanas**.
 *
 * Existe porque el `bbox` que se pidió **no resuelve** el problema para el que se pidió, y
 * eso solo se vio midiendo. De los 1.121 municipios, **605 (el 54 %) tienen el suelo
 * urbano repartido en más de 15 km** —corregimientos y caseríos dispersos por el término—
 * y ahí el centro de la caja cae en el monte, entre poblados. La mediana de la diagonal es
 * 16,5 km; Cumaribo llega a 413.
 *
 * Se probaron tres reglas contra ocho cabeceras de coordenada conocida, y el resultado
 * decidió (error medio al pueblo):
 *
 * | regla | error medio |
 * |---|---|
 * | centro del `bbox` | 11,2 km |
 * | centro de la sección más grande | 7,9 km |
 * | **mediana de los centroides** | **3,1 km** |
 *
 * La sección más grande parecía la respuesta obvia y es **peor que el bbox en las ciudades
 * grandes**: en Cali erraba 14,2 km, porque el polígono de mayor área es un ensanche
 * periférico de baja densidad y no el centro. La mediana gana porque cae donde está la
 * *masa* de secciones —que es el casco— y los caseríos sueltos, al ser pocos, no la mueven.
 * Es la misma propiedad por la que una mediana resiste valores atípicos.
 *
 * El `bbox` se conserva igualmente: sirve para encuadrar, que es otra pregunta.
 */
function anclaDe(coleccion: { features: { geometry: unknown }[] }): [number, number] | undefined {
  const centros: [number, number][] = [];
  for (const f of coleccion.features) {
    const c = centroideDe(f.geometry as { type?: string; coordinates?: unknown });
    if (c) centros.push(c);
  }
  if (centros.length === 0) return undefined;

  const r = (n: number): number => Math.round(n * 1e4) / 1e4;
  return [r(mediana(centros.map((c) => c[0]))), r(mediana(centros.map((c) => c[1])))];
}

function argumento(bandera: string): string | undefined {
  const i = process.argv.indexOf(bandera);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const umbral = Number(argumento('--mmi') ?? 5);
  const zipPath = argumento('--zip');

  const mmi = JSON.parse(
    await readFile(`${DATA_DIR}/event/mmi-by-municipality.json`, 'utf8'),
  ) as { municipalities: { pcode: string; name: string; mmi: number }[] };

  /**
   * Municipios donde el mapa muestra algo aunque hayan temblado poco. Si hay un centro de
   * acopio en un municipio, su trama urbana tiene que estar: un punto sin contexto en un
   * polígono liso no le dice a nadie a dónde ir.
   */
  const conAlgoQueMostrar = new Set<string>();
  for (const p of await cargarAyuda().catch(() => [])) conAlgoQueMostrar.add(p.pcode);
  for (const i of await cargarIncidentes().catch(() => [])) conAlgoQueMostrar.add(i.pcode);

  const objetivo = mmi.municipalities.filter(
    (m) => m.mmi >= umbral || conAlgoQueMostrar.has(m.pcode),
  );
  const pcodes = new Set(objetivo.map((m) => m.pcode));

  const porAyuda = objetivo.filter((m) => m.mmi < umbral).length;
  console.log(
    `· ${objetivo.length} municipios: MMI ≥ ${umbral}` +
      (porAyuda > 0 ? `, más ${porAyuda} por tener ayuda o incidentes` : ''),
  );
  console.log(
    zipPath ? `· Usando zip local: ${zipPath}` : '· Descargando secciones urbanas (48 MB)…',
  );

  const zip = zipPath ? new Uint8Array(await readFile(zipPath)) : undefined;
  const porMunicipio = await fetchSecciones(pcodes, zip);

  console.log(`· ${porMunicipio.size} municipios tienen suelo urbano cartografiado`);
  console.log('· Simplificando…');

  const indice: {
    pcode: string;
    secciones: number;
    bbox: [number, number, number, number];
    ancla?: [number, number];
  }[] = [];
  let escritos = 0;

  for (const [pcode, coleccion] of porMunicipio) {
    // Los dos se toman ANTES de simplificar: interesa dónde está el casco, no su detalle.
    const bbox = cajaDe(coleccion);
    const ancla = anclaDe(coleccion);
    const topo = simplifyPreservingTopology(
      coleccion,
      retencionPara(coleccion.features.length),
    );

    /**
     * Fuera las propiedades de cada sección: **el 45 % del archivo de Bogotá eran los
     * atributos, no la geometría.**
     *
     * El DANE trae `codigo`, `sector`, `pcode` y `area_m2` por sección. La interfaz no lee
     * ninguno —dibuja relleno y borde, y su tipo es `FeatureCollection<Geometry, unknown>`—
     * y no puede: el MGN **no publica nombres de barrio**, solo códigos, así que rotular
     * «Sector 1808» sería peor que no rotular nada. `pcode` además es redundante, porque el
     * archivo entero es de un municipio.
     *
     * Bogotá: 694 KB → 384 KB sin tocar un solo vértice. Es mejor palanca que simplificar,
     * porque no cuesta fidelidad: lo que se borra no se dibujaba.
     */
    for (const objeto of Object.values(topo.objects as Record<string, unknown>)) {
      const geometrias = (objeto as { geometries?: { properties?: unknown }[] }).geometries ?? [];
      for (const g of geometrias) delete g.properties;
    }

    const resultado = await writeTopoJson(DATA_DIR, `secciones/${pcode}`, topo);

    if (resultado.changed) escritos++;
    indice.push({ pcode, secciones: coleccion.features.length, bbox, ...(ancla ? { ancla } : {}) });
  }

  indice.sort((a, b) => b.secciones - a.secciones);

  await writeJson(DATA_DIR, 'secciones/index', {
    generado: new Date().toISOString(),
    fuente: SECCIONES_SOURCE,
    nota: 'Secciones urbanas del DANE. NO traen nombre de barrio: el MGN solo publica códigos.',
    bbox_nota:
      'bbox = [oeste, sur, este, norte] del suelo urbano. Sirve para anclar una etiqueta ' +
      'sobre el casco en vez del centro geométrico del municipio, que en los grandes no es ' +
      'el pueblo (en Quibdó, 37,4 km de diferencia).',
    umbral_mmi: umbral,
    municipios: indice,
  });

  console.log(
    `✓ ${indice.length} municipios (${escritos} escritos). Mayor: ${indice[0]?.pcode} con ${indice[0]?.secciones} secciones.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
