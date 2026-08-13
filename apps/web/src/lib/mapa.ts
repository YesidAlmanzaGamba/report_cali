/**
 * Mapa de intensidad.
 *
 * **Sin mapa base externo, a propósito.** Lo normal sería poner teselas de un proveedor,
 * pero eso mete una dependencia de terceros en la ruta crítica justo cuando el sitio más
 * importa: si ese proveedor se cae o limita el tráfico, nos quedamos sin mapa en plena
 * emergencia. Nuestros propios polígonos municipales SON el mapa. Además evita descargar
 * teselas sobre una conexión mala, y funciona igual dentro de una red degradada.
 */
import maplibregl, { type ExpressionSpecification, type StyleSpecification } from 'maplibre-gl';
/**
 * La hoja de estilos de MapLibre, como URL y NO como `import` normal.
 *
 * Sin ella el lienzo no queda posicionado y los controles se dibujan como texto suelto
 * encima del mapa, así que hace falta — pero solo cuando el mapa existe.
 *
 * **Aquí había un `import 'maplibre-gl/dist/maplibre-gl.css'` con un comentario que decía
 * que «viaja en el mismo trozo que MapLibre y no en la carga inicial». Era falso.** Astro
 * sube el CSS de todo el grafo de módulos de la página —importaciones dinámicas incluidas—
 * a un `<link>` que bloquea el pintado. Medido en `dist/index.html`: eran **9.946 B
 * comprimidos bloqueando**, el 63 % de todo el CSS de la página, en el sitio cuyo
 * compromiso central es pesar poco sobre una conexión mala. Y la receta de medición del
 * tablero solo miraba `index.*.css`, así que llevaba rondas sin verlo.
 *
 * Con `?url` Vite emite el archivo y **no** inyecta el `<link>`; lo pide `cargarHoja()` en
 * tiempo de ejecución. `?url` respeta `base`, así que el espejo de GitHub Pages sigue bien.
 */
import urlHojaMapLibre from 'maplibre-gl/dist/maplibre-gl.css?url';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';

import {
  levelFor,
  mmiColorStops,
  poblacionColorStops,
  RAMPA_POBLACION,
  UMBRAL_DANINO,
} from './mmi';
import { ETIQUETAS, TIPOS_FUENTE, frescuraDe, ordenar } from './metricas';
import { colapsarHoja } from './hoja';
import { crearEtiquetas, type GestorEtiquetas, type PropsEtiqueta } from './etiquetas';

interface MunicipioProps {
  pcode: string;
  name: string;
  admin1_pcode: string;
  admin1_name: string;
}

interface MunicipioMmi {
  pcode: string;
  name: string;
  admin1_name: string;
  mmi: number;
  mmi_roman: string;
  method: 'grid' | 'centroid';
  /** Ausente si no se pudo cruzar con la proyección del DANE. */
  poblacion?: number;
  /** Menores de 5 más mayores de 65. Ausente en las mismas condiciones que `poblacion`. */
  poblacion_vulnerable?: number;
}

/** Lo que el mapa necesita de una observación. El tipo completo vive en el paquete de ingesta. */
type ObservacionLigera = import('@report-cali/ingest/schema').Observation;

/** Propiedades de un incidente publicado, ver `packages/ingest/src/incidentes.ts#aGeoJson`. */
interface IncidenteProps {
  tipo: string;
  descripcion: string;
  precision: 'exacta' | 'rejilla-100m';
  fuente: string;
  fuente_url: string;
  fuente_tipo: string;
  observado: string;
}
type ColeccionIncidentes = FeatureCollection<Point, IncidenteProps>;

/**
 * Una fila de `fuentes/cobertura.json`. Solo lo que la ficha necesita: el archivo trae
 * además mmi y población, que aquí ya vienen de las propiedades del municipio.
 */
interface CoberturaMunicipio {
  pcode: string;
  notas: number;
  ultima?: string;
  medios: { nombre: string; notas: number }[];
}

/** Solo estos dos tipos de incidente son "ayuda cercana"; el resto son daño y solo se
 *  dibujan como puntos en el mapa, sin listarse como tarjetas en la ficha. */
const TIPOS_AYUDA = new Set(['albergue', 'centro_acopio']);
const ETIQUETAS_INCIDENTE: Record<string, string> = {
  edificacion_colapsada: 'Edificación colapsada',
  edificacion_danada: 'Edificación dañada',
  via_bloqueada: 'Vía bloqueada',
  albergue: 'Albergue',
  centro_acopio: 'Centro de acopio',
  centro_salud_afectado: 'Centro de salud afectado',
};

/**
 * Un solo color por tipo de incidente, compartido entre la capa del mapa y la leyenda
 * de la ficha: así no pueden desincronizarse si alguien cambia uno y olvida el otro.
 */
const COLOR_INCIDENTE: Record<string, string> = {
  edificacion_colapsada: '#a52020',
  edificacion_danada: '#d97706',
  via_bloqueada: '#7c3aed',
  albergue: '#1f8a4c',
  centro_acopio: '#1b4d8f',
  centro_salud_afectado: '#be185d',
};
const COLOR_INCIDENTE_SIN_TIPO = '#666';

/**
 * Origen de los datos.
 *
 * Por defecto, el propio sitio (`/data`), que es lo que hace funcionar `npm run dev` sin
 * configurar nada. En producción se apunta a un bucket de R2 con `PUBLIC_DATA_URL`.
 *
 * El motivo es de cuota, no de rendimiento: Cloudflare Pages da 500 compilaciones al mes
 * en el plan gratuito, y si los datos viajan dentro del sitio, cada actualización del
 * cron gasta una. En emergencia activa eso son 600–1.500 al mes y los despliegues se
 * detienen. Sirviendo los datos aparte, solo el código dispara compilaciones.
 * Ver docs/DESPLIEGUE.md.
 */
/** Quien pidió menos animación no debería recibir un vuelo de cámara de 700 ms. */
const prefiereMenosMovimiento =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * El tema, como consulta viva y no como una lectura suelta.
 *
 * Se guarda la `MediaQueryList` en vez de solo `.matches` para poder escuchar el cambio:
 * los colores del mapa se fijan en JavaScript (no son CSS, van dentro del lienzo), así que
 * sin escuchar, cambiar el tema del sistema con la página abierta dejaba el fondo del mapa
 * en claro debajo de una interfaz oscura.
 */
const modoOscuro =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : ({ matches: false, addEventListener: () => {} } as unknown as MediaQueryList);

const DATA =
  (import.meta.env['PUBLIC_DATA_URL'] as string | undefined)?.replace(/\/$/, '') ??
  // `BASE_URL` ya trae la barra final. En el espejo de GitHub Pages vale
  // '/report_cali/', así que la ruta queda '/report_cali/data'.
  `${import.meta.env.BASE_URL}data`.replace(/\/{2,}/g, '/');

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DATA}/${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${response.status})`);
  return (await response.json()) as T;
}

function topoToGeo<P>(topo: unknown, layer: string): FeatureCollection<Geometry, P> {
  const t = topo as { objects: Record<string, unknown> };
  return feature(t as never, t.objects[layer] as never) as unknown as FeatureCollection<Geometry, P>;
}

/**
 * Caja envolvente de una geometría.
 *
 * `@report-cali/ingest` ya tiene un `bboxOf` idéntico, pero importarlo arrastraría zod y
 * módulos de Node al paquete del navegador. Quince líneas duplicadas cuestan menos que
 * eso.
 */
function bboxDe(geometry: Geometry): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visitar = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = coords as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return;
    }
    for (const hijo of coords) visitar(hijo);
  };

  visitar((geometry as { coordinates?: unknown }).coordinates);
  return [minX, minY, maxX, maxY];
}

/**
 * Pide una hoja de estilos y espera a que esté aplicada.
 *
 * Se resuelve con `load`, con `error` **o** al vencer un plazo, y nunca rechaza: una hoja
 * que no llega tiene que degradar a un mapa feo, jamás a ningún mapa. El plazo existe
 * porque en una conexión a medias `load` puede no llegar nunca y el mapa se quedaría sin
 * construir esperándolo.
 */
async function cargarHoja(url: string): Promise<void> {
  if (document.querySelector(`link[rel="stylesheet"][href="${url}"]`)) return;

  await new Promise<void>((resolve) => {
    const enlace = document.createElement('link');
    enlace.rel = 'stylesheet';
    enlace.href = url;

    let resuelto = false;
    const terminar = (): void => {
      if (resuelto) return;
      resuelto = true;
      resolve();
    };

    enlace.addEventListener('load', terminar, { once: true });
    enlace.addEventListener('error', terminar, { once: true });
    setTimeout(terminar, 3000);

    document.head.append(enlace);
  });
}

/** El color del fondo del mapa. Un solo sitio, porque ahora lo piden dos. */
function fondoDelMapa(oscuro: boolean): string {
  return oscuro ? '#0c0e12' : '#eef0f4';
}

/** Estilo mínimo: solo un fondo. Las capas de datos se añaden al cargar. */
function estiloBase(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'fondo',
        type: 'background',
        paint: { 'background-color': fondoDelMapa(modoOscuro.matches) },
      },
    ],
  };
}

/**
 * Tinta legible para la trama urbana sobre lo que hay debajo.
 *
 * **La decisión no es del tema de la página, es de lo que tapa.** Donde hay MMI, debajo
 * del casco hay un color del USGS que es **el mismo en modo claro y en oscuro** (ADR-009),
 * así que mirar `prefers-color-scheme` daría negro sobre amarillo brillante en modo claro
 * y blanco sobre el mismo amarillo en oscuro — mal las dos veces. `levelFor().ink` ya
 * resuelve exactamente esta pregunta para la insignia de grado de la ficha, y se reutiliza
 * para que las dos no puedan discrepar.
 *
 * Sin MMI el municipio se pinta con `fill-opacity: 0.25`, así que lo que se ve es el fondo
 * del mapa: ahí sí manda el tema.
 */
function tintaSobreMunicipio(mmi: number | null, oscuro: boolean): string {
  if (mmi === null) return oscuro ? '#eef0f3' : '#14161a';
  return levelFor(mmi).ink;
}

export async function iniciarMapa(): Promise<void> {
  const contenedor = document.getElementById('mapa');
  if (!contenedor) return;

  // Se arranca ya, sin esperarla, para que descargue a la vez que los datos de abajo.
  const hojaMapLibre = cargarHoja(urlHojaMapLibre);

  let municipiosTopo: unknown;
  let departamentosTopo: unknown;
  let mmiPorMunicipio: { municipalities: MunicipioMmi[] };
  let evento: { longitude: number; latitude: number; magnitude: number };
  let replicas: FeatureCollection<Geometry, { magnitude: number; place: string; time: string }>;
  let afectacion: { observations: ObservacionLigera[] };

  try {
    [municipiosTopo, departamentosTopo, mmiPorMunicipio, evento, replicas, afectacion] =
      await Promise.all([
        getJson('boundaries/municipios.topojson'),
        getJson('boundaries/departamentos.topojson'),
        getJson<{ municipalities: MunicipioMmi[] }>('event/mmi-by-municipality.json'),
        getJson<{ longitude: number; latitude: number; magnitude: number }>('event/event.json'),
        getJson<FeatureCollection<Geometry, { magnitude: number; place: string; time: string }>>(
          'event/aftershocks.geojson',
        ),
        // Las cifras son opcionales: si aún no hay ninguna, el mapa funciona igual.
        getJson<{ observations: ObservacionLigera[] }>('observations/afectacion.json').catch(
          () => ({ observations: [] }),
        ),
      ]);
  } catch (error) {
    // La tabla ya está renderizada en el HTML, así que la página sigue siendo útil.
    contenedor.innerHTML =
      '<p class="error-mapa">No se pudo cargar el mapa. La información está en la tabla de abajo.</p>';
    console.error(error);
    return;
  }

  const municipios = topoToGeo<MunicipioProps>(municipiosTopo, 'municipios');
  const departamentos = topoToGeo<{ pcode: string; name: string }>(departamentosTopo, 'municipios');

  const porPcode = new Map(mmiPorMunicipio.municipalities.map((m) => [m.pcode, m]));

  // El MMI se une a la geometría aquí y no en el pipeline para no duplicar la geometría
  // en disco: un archivo de límites, otro de intensidad, y se cruzan al vuelo.
  for (const f of municipios.features) {
    const datos = porPcode.get(f.properties.pcode);
    Object.assign(f.properties, {
      mmi: datos?.mmi ?? null,
      mmi_roman: datos?.mmi_roman ?? null,
      method: datos?.method ?? null,
      // `null` y no 0: un cero se pintaría como «aquí no vive nadie», que es una
      // afirmación distinta a «no tenemos el dato».
      poblacion: datos?.poblacion ?? null,
      poblacion_vulnerable: datos?.poblacion_vulnerable ?? null,
    });
  }

  // Se pidió antes de los datos y se espera aquí: para cuando los seis `fetch` terminan,
  // la hoja ya viajó en paralelo con ellos, así que esperarla cuesta ~0. Lo que no puede
  // pasar es construir el mapa sin ella.
  await hojaMapLibre;

  const mapa = new maplibregl.Map({
    container: contenedor,
    style: estiloBase(),
    // Encuadre provisional; abajo se ajusta a la zona afectada según el tamaño real de
    // la pantalla, que es lo que hace que sirva igual en un celular y en un monitor.
    center: [evento.longitude + 0.8, evento.latitude + 0.4],
    zoom: 4.8,
    attributionControl: false,
    // Un socorrista en un celular no necesita rotar el mapa, y desactivarlo evita
    // desorientarse por un gesto accidental.
    pitchWithRotate: false,
    dragRotate: false,
    touchZoomRotate: true,
  });

  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  mapa.touchZoomRotate.disableRotation();

  // La atribución va como texto fijo debajo del mapa (ver index.astro), no como control
  // flotante: en pantalla de celular el control se encimaba con la leyenda, y de todos
  // modos un crédito que hay que desplegar para leerlo cumple mal su función.

  await new Promise<void>((resolve) => mapa.on('load', () => resolve()));

  mapa.addSource('municipios', { type: 'geojson', data: municipios });
  mapa.addSource('departamentos', { type: 'geojson', data: departamentos });

  const colorPorMmi: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['get', 'mmi'],
    ...mmiColorStops(),
  ] as ExpressionSpecification;

  mapa.addLayer({
    id: 'municipios-relleno',
    type: 'fill',
    source: 'municipios',
    paint: {
      // Sin dato de intensidad se pinta gris neutro. Un cero se leería como
      // «aquí no se sintió nada», que es una afirmación que no podemos hacer.
      'fill-color': ['case', ['==', ['get', 'mmi'], null], '#9aa0aa', colorPorMmi],
      'fill-opacity': ['case', ['==', ['get', 'mmi'], null], 0.25, 0.9],
    },
  });

  mapa.addLayer({
    id: 'municipios-borde',
    type: 'line',
    source: 'municipios',
    paint: { 'line-color': '#00000022', 'line-width': 0.4 },
  });

  mapa.addLayer({
    id: 'departamentos-borde',
    type: 'line',
    source: 'departamentos',
    paint: { 'line-color': '#00000066', 'line-width': 1.1 },
  });

  mapa.addLayer({
    id: 'municipio-seleccionado',
    type: 'line',
    source: 'municipios',
    paint: { 'line-color': '#000', 'line-width': 2.5 },
    filter: ['==', ['get', 'pcode'], ''],
  });

  // ── Réplicas y epicentro ────────────────────────────────────────────────
  mapa.addSource('replicas', { type: 'geojson', data: replicas });
  mapa.addLayer({
    id: 'replicas',
    type: 'circle',
    source: 'replicas',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 3, 4, 7, 12],
      'circle-color': '#ffffff',
      'circle-opacity': 0.55,
      'circle-stroke-color': '#1a1a1a',
      'circle-stroke-width': 1.2,
    },
  });

  mapa.addSource('epicentro', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { magnitude: evento.magnitude },
          geometry: { type: 'Point', coordinates: [evento.longitude, evento.latitude] },
        },
      ],
    },
  });

  // Anillo + centro: se distingue del ruido de réplicas sin necesidad de una etiqueta
  // de texto (que obligaría a descargar glifos de un servidor externo).
  mapa.addLayer({
    id: 'epicentro-halo',
    type: 'circle',
    source: 'epicentro',
    paint: {
      'circle-radius': 16,
      'circle-color': 'transparent',
      'circle-stroke-color': '#1a1a1a',
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.75,
    },
  });
  mapa.addLayer({
    id: 'epicentro',
    type: 'circle',
    source: 'epicentro',
    paint: {
      'circle-radius': 5,
      'circle-color': '#1a1a1a',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });

  // ── Deslizamientos ──────────────────────────────────────────────────────
  //
  // El USGS solo publica esto como ráster, así que va como fuente de imagen con las
  // esquinas que él mismo declara. En terreno montañoso se lee como riesgo de acceso
  // vial: dónde puede estar cortada la carretera.
  const deslizamientos = await getJson<{
    imagen: string;
    esquinas: [number, number][];
    alerta: string | null;
  }>('event/deslizamientos.json').catch(() => undefined);

  // MapLibre exige exactamente cuatro esquinas. Se comprueba en vez de forzar el tipo:
  // si el USGS cambiara el formato, preferimos quedarnos sin capa a montar una imagen
  // deformada sobre el mapa, que sería peor que no tenerla.
  if (deslizamientos && deslizamientos.esquinas.length === 4) {
    const esquinas = deslizamientos.esquinas as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ];

    mapa.addSource('deslizamientos', {
      type: 'image',
      url: `${DATA}/${deslizamientos.imagen}`,
      coordinates: esquinas,
    });

    mapa.addLayer(
      {
        id: 'deslizamientos',
        type: 'raster',
        source: 'deslizamientos',
        paint: { 'raster-opacity': 0.55 },
        layout: { visibility: 'none' },
      },
      // Debajo de los bordes para no tapar los límites municipales.
      'municipios-borde',
    );

    const boton = document.getElementById('capa-deslizamientos');
    boton?.removeAttribute('hidden');
    boton?.addEventListener('click', () => {
      const visible = mapa.getLayoutProperty('deslizamientos', 'visibility') === 'visible';
      mapa.setLayoutProperty('deslizamientos', 'visibility', visible ? 'none' : 'visible');
      boton.setAttribute('aria-pressed', visible ? 'false' : 'true');

      /**
       * Al encender la capa se atenúa la coropleta.
       *
       * El modelo del USGS es casi transparente: la probabilidad alta se concentra en
       * una franja pequeña de montaña y el resto no pinta nada. Sobre una coropleta
       * saturada, esa franja sencillamente no se ve. Bajarle opacidad al color de fondo
       * es lo que hace que la capa sirva para algo.
       */
      mapa.setPaintProperty('municipios-relleno', 'fill-opacity', visible ? 0.9 : 0.2);
      mapa.setPaintProperty('deslizamientos', 'raster-opacity', 0.95);

      if (!visible) {
        avisar(
          'capa:deslizamientos',
          'Probabilidad de deslizamiento — dónde puede estar cortada la vía',
        );
      }
    });
  }

  /**
   * Mide el alto real de `.controles-superiores` (conmutador de modo + interruptor de
   * deslizamientos, si está) y se lo pasa a `--ficha-top` en CSS.
   *
   * Reemplaza un `top` fijo en rem que dos rondas seguidas quedó desactualizado en
   * cuanto se agregó un control nuevo ahí arriba: la ficha lo tapaba porque nadie
   * recordaba subir el número. Midiendo en vez de adivinar, un control de más o de
   * menos ya no puede volver a romperlo.
   */
  function ajustarControlesSuperiores(): void {
    const controles = document.getElementById('controles-superiores');
    const marco = document.querySelector<HTMLElement>('.marco');
    if (!controles || !marco) return;

    const alto = controles.getBoundingClientRect().height;
    // 0.6rem de brecha antes de la ficha, la misma que separa los controles del borde.
    const separacion = 0.6 * 16;
    marco.style.setProperty('--ficha-top', `${Math.round(alto + separacion)}px`);
  }

  ajustarControlesSuperiores();
  window.addEventListener('resize', () => {
    ajustarControlesSuperiores();
    etiquetas?.programar();
  });

  // ── Modos de color ──────────────────────────────────────────────────────
  //
  // Dos preguntas distintas sobre el mismo mapa:
  //   · Sacudimiento  → qué tan fuerte tembló (MMI del USGS)
  //   · Gente expuesta → cuánta gente vive donde tembló fuerte
  //
  // El segundo NO es un índice de daño con coeficientes inventados: es la población de
  // los municipios que llegaron al umbral. Los que no llegan quedan grises, no en cero,
  // porque un cero se dibujaría como «aquí no vive nadie».
  const colorPorPoblacion: ExpressionSpecification = [
    'interpolate',
    ['linear'],
    ['log10', ['max', 1, ['coalesce', ['get', 'poblacion'], 1]]],
    ...poblacionColorStops(),
  ] as ExpressionSpecification;

  const SIN_DATO = '#9aa0aa';

  /**
   * Qué modo está activo ahora mismo, para que la ficha sepa qué destacar arriba
   * (tarea 4) sin tener que volver a preguntárselo al conmutador cada vez.
   */
  let modoActual: 'sacudimiento' | 'expuesta' = 'sacudimiento';

  function aplicarModo(modo: 'sacudimiento' | 'expuesta'): void {
    modoActual = modo;
    document.getElementById('detalle-metricas')?.setAttribute('data-modo', modo);

    if (modo === 'expuesta') {
      mapa.setPaintProperty('municipios-relleno', 'fill-color', [
        'case',
        ['any', ['==', ['get', 'poblacion'], null], ['<', ['get', 'mmi'], UMBRAL_DANINO]],
        SIN_DATO,
        colorPorPoblacion,
      ] as never);
      mapa.setPaintProperty('municipios-relleno', 'fill-opacity', [
        'case',
        ['any', ['==', ['get', 'poblacion'], null], ['<', ['get', 'mmi'], UMBRAL_DANINO]],
        0.18,
        0.88,
      ] as never);
    } else {
      mapa.setPaintProperty('municipios-relleno', 'fill-color', [
        'case',
        ['==', ['get', 'mmi'], null],
        SIN_DATO,
        colorPorMmi,
      ] as never);
      mapa.setPaintProperty('municipios-relleno', 'fill-opacity', [
        'case',
        ['==', ['get', 'mmi'], null],
        0.25,
        0.9,
      ] as never);
    }

    document.getElementById('leyenda')?.toggleAttribute('hidden', modo !== 'sacudimiento');
    document.getElementById('leyenda-poblacion')?.toggleAttribute('hidden', modo === 'sacudimiento');

    for (const b of document.querySelectorAll<HTMLElement>('.modos button')) {
      b.setAttribute('aria-pressed', b.dataset['modo'] === modo ? 'true' : 'false');
    }

    avisar(
      `modo:${modo}`,
      modo === 'expuesta'
        ? 'Color = cuánta gente vive donde el temblor fue dañino'
        : 'Color = qué tan fuerte tembló el suelo',
    );
  }

  /** Aviso breve que explica qué significa el color ahora, y se va solo — o al tocarlo. */
  let temporizadorAviso: ReturnType<typeof setTimeout> | undefined;

  /**
   * Avisos ya mostrados, por clave. Cada explicación sale **una vez por sesión**, no en
   * cada toque: quien alterna entre los dos modos comparando ya leyó qué significa el
   * color, y repetírselo cada vez es ruido encima del mapa.
   *
   * Es una vez por *clave*, no una vez en total, y esa diferencia importa: cada modo y
   * cada capa pintan el color con otro significado, así que si «Gente expuesta» no ha
   * salido nunca, tiene que salir — si no, quedaría una escala de color sin explicar, y
   * eso es la regla que este proyecto repite en todas partes.
   */
  const avisosMostrados = new Set<string>();

  function cerrarAviso(el: HTMLElement): void {
    clearTimeout(temporizadorAviso);
    el.setAttribute('data-yendose', '');
    setTimeout(
      () => {
        el.setAttribute('hidden', '');
        // El aviso ocupa una fila de `.controles-superiores`; al irse, la ficha y
        // «← Ver toda la zona» recuperan ese alto.
        ajustarControlesSuperiores();
      },
      prefiereMenosMovimiento ? 0 : 250,
    );
  }

  function avisar(clave: string, texto: string): void {
    const el = document.getElementById('aviso-modo');
    if (!el || avisosMostrados.has(clave)) return;
    avisosMostrados.add(clave);

    clearTimeout(temporizadorAviso);
    el.textContent = texto;
    el.removeAttribute('data-yendose');
    el.removeAttribute('hidden');
    // Acaba de aparecer una fila nueva aquí arriba: lo que va debajo se corre.
    ajustarControlesSuperiores();

    temporizadorAviso = setTimeout(() => cerrarAviso(el), 6000);
  }

  document.getElementById('aviso-modo')?.addEventListener('click', (e) => {
    cerrarAviso(e.currentTarget as HTMLElement);
  });

  // Escala del segundo modo, construida desde la misma rampa que pinta el mapa para que
  // no puedan desincronizarse.
  const escala = document.getElementById('escala-poblacion');
  if (escala) {
    for (const paso of RAMPA_POBLACION) {
      const li = document.createElement('li');
      const muestra = document.createElement('span');
      muestra.className = 'muestra';
      muestra.style.background = paso.color;
      const texto = document.createElement('span');
      texto.className = 'desc';
      texto.textContent = paso.etiqueta;
      li.append(muestra, texto);
      escala.append(li);
    }
  }

  for (const boton of document.querySelectorAll<HTMLElement>('.modos button')) {
    boton.addEventListener('click', () => {
      const modo = boton.dataset['modo'];
      if (modo === 'expuesta' || modo === 'sacudimiento') aplicarModo(modo);
    });
  }

  // ── Interacción ─────────────────────────────────────────────────────────
  const panel = document.getElementById('detalle');
  const set = (id: string, texto: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
  };

  // Cifras agrupadas por municipio, para poder mostrarlas al tocar uno.
  const cifrasPorPcode = new Map<string, ObservacionLigera[]>();
  for (const o of afectacion.observations) {
    const lista = cifrasPorPcode.get(o.pcode);
    if (lista) lista.push(o);
    else cifrasPorPcode.set(o.pcode, [o]);
  }

  /**
   * Pinta las cifras del municipio como tarjetas grandes dentro del slide «Impacto».
   *
   * Se construye con `textContent` y `createElement`, nunca con `innerHTML`: el nombre de
   * la fuente y las notas vienen de un archivo que edita gente por pull request, y aunque
   * pase por revisión, no es lugar para confiar en que nadie escriba una etiqueta.
   */
  /** «hace 40 min», «hace 6 h», «hace 3 días». Suficiente para situar una nota. */
  function haceCuanto(iso: string, ahora: Date = new Date()): string {
    const minutos = Math.max(0, Math.round((ahora.getTime() - Date.parse(iso)) / 60_000));
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 48) return `hace ${horas} h`;
    return `hace ${Math.round(horas / 24)} días`;
  }

  /**
   * Quién está informando de este municipio — o que no informa nadie.
   *
   * Las dos ramas dicen cosas distintas, y por eso esto se puede publicar donde el aviso
   * anterior no se podía: aquel salía idéntico en los 1.122 municipios y dejó de
   * informar. Si el municipio no está en el registro (apenas tembló y nadie lo mencionó),
   * el bloque no aparece: callar es mejor que decir una obviedad.
   */
  function pintarCobertura(pcode: string): void {
    const bloque = document.getElementById('detalle-cobertura');
    const texto = document.getElementById('cobertura-texto');
    const medios = document.getElementById('cobertura-medios');
    if (!bloque || !texto || !medios) return;

    const dato = coberturaPorPcode.get(pcode);
    if (!dato) {
      bloque.setAttribute('hidden', '');
      return;
    }

    bloque.removeAttribute('hidden');

    if (dato.notas === 0) {
      bloque.dataset['estado'] = 'sin';
      texto.textContent =
        'Ningún medio ha publicado sobre este municipio desde el sismo. Que no haya reportes no significa que no haya daños: significa que no tenemos información de aquí.';
      medios.textContent = '';
      return;
    }

    bloque.dataset['estado'] = 'con';
    const plural = dato.notas === 1 ? 'nota' : 'notas';
    texto.textContent = `${dato.notas} ${plural} recogidas${
      dato.ultima ? `, la más reciente ${haceCuanto(dato.ultima)}` : ''
    }.`;
    medios.textContent = dato.medios
      .slice(0, 4)
      .map((m) => `${m.nombre} (${m.notas})`)
      .join(' · ');
  }

  function pintarCifras(pcode: string): void {
    const contenedor = document.getElementById('detalle-cifras');
    if (!contenedor) return;

    const cifras = ordenar(cifrasPorPcode.get(pcode) ?? []);
    contenedor.replaceChildren();

    if (cifras.length === 0) {
      const p = document.createElement('p');
      p.className = 'vacio';
      p.textContent = 'Sin cifras registradas todavía para este municipio.';
      contenedor.append(p);
      return;
    }

    const ahora = new Date();
    for (const o of cifras) {
      const tarjeta = document.createElement('div');
      tarjeta.className = `cifra-grande ${frescuraDe(o, ahora)}`;

      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = o.value.toLocaleString('es-CO');

      const q = document.createElement('span');
      q.className = 'q';
      q.textContent = ETIQUETAS[o.metric];

      const f = document.createElement('span');
      f.className = 'f';
      f.textContent = `${TIPOS_FUENTE[o.source.type]} · `;

      const a = document.createElement('a');
      a.href = o.source.url;
      a.rel = 'noopener';
      a.textContent = o.source.name;
      f.append(a);

      tarjeta.append(n, q, f);
      contenedor.append(tarjeta);
    }
  }

  /**
   * Pinta los puntos de ayuda (albergues, centros de acopio) del slide «Ayuda cercana».
   *
   * Solo lista lo que de verdad está cartografiado (`packages/ingest/src/incidentes.ts`);
   * no hay teléfono en ese esquema, así que no se inventa uno. Cada punto lleva su fuente y
   * dice si la ubicación es exacta o recortada a la rejilla de 100 m (ADR-012).
   */
  function pintarAyuda(features: Feature<Point, IncidenteProps>[]): void {
    const contenedor = document.getElementById('detalle-ayuda');
    if (!contenedor) return;

    contenedor.replaceChildren();
    const puntos = features.filter((f) => TIPOS_AYUDA.has(f.properties.tipo));

    if (puntos.length === 0) {
      const p = document.createElement('p');
      p.className = 'vacio';
      p.textContent =
        'Sin albergues ni centros de acopio cartografiados en este municipio todavía. No significa que no los haya: significa que nadie los ha registrado aún.';
      contenedor.append(p);
      return;
    }

    for (const f of puntos) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'punto-ayuda';

      const tipo = document.createElement('span');
      tipo.className = 'tipo';
      tipo.textContent = ETIQUETAS_INCIDENTE[f.properties.tipo] ?? f.properties.tipo;

      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = f.properties.descripcion;

      const meta = document.createElement('span');
      meta.className = 'meta';
      const precisionTexto =
        f.properties.precision === 'exacta' ? 'ubicación verificada' : 'ubicación aproximada (~100 m)';
      meta.textContent = `${f.properties.fuente} · ${precisionTexto}`;

      boton.append(tipo, desc, meta);
      boton.addEventListener('click', () => {
        const [lon, lat] = f.geometry.coordinates;
        mapa.flyTo({ center: [lon, lat], zoom: 13, duration: prefiereMenosMovimiento ? 0 : 700 });
      });

      contenedor.append(boton);
    }
  }

  /**
   * Población del municipio, para el bloque que acompaña al de MMI en la ficha (tarea 4).
   * Se oculta entera si no hay dato — pasa en 1 de 1122 municipios— en vez de mostrar un
   * cero, por la misma razón que el mapa no pinta un cero de población.
   */
  function pintarPoblacion(props: Record<string, unknown>): void {
    const bloque = document.getElementById('detalle-poblacion');
    if (!bloque) return;

    const poblacion = typeof props['poblacion'] === 'number' ? props['poblacion'] : null;
    if (poblacion === null) {
      bloque.setAttribute('hidden', '');
      return;
    }

    bloque.removeAttribute('hidden');
    set('detalle-pob-total', `${poblacion.toLocaleString('es-CO')} habitantes`);

    const vulnerable =
      typeof props['poblacion_vulnerable'] === 'number' ? props['poblacion_vulnerable'] : null;
    set(
      'detalle-pob-vulnerable',
      vulnerable === null
        ? ''
        : `${vulnerable.toLocaleString('es-CO')} en edades vulnerables (menores de 5 o mayores de 65)`,
    );
  }

  /**
   * Municipio con la ficha abierta ahora mismo, o `null`. Sirve para dos cosas: que
   * tocar el mismo municipio dos veces la cierre en vez de repintarla, y que
   * `mapa.on('click', ...)` sepa si un toque fuera de cualquier polígono debe cerrarla.
   */
  let pcodeAbierto: string | null = null;

  /**
   * Los nombres de municipio sobre el mapa. Se construyen más abajo, cuando ya existen las
   * capas que no deben tapar, así que hasta entonces las funciones de aquí arriba lo tocan
   * con `?.`.
   */
  let etiquetas: GestorEtiquetas | undefined;

  /**
   * Marca el documento mientras hay una ficha abierta.
   *
   * Va en `<html>` y no en `.marco` porque la hoja inferior es un componente aparte, que
   * en el DOM no es descendiente ni hermano del mapa: desde `.marco` no hay selector CSS
   * que la alcance. Con la marca en la raíz, cualquier parte de la página puede
   * reaccionar sin que haya que cablear nada entre componentes.
   *
   * En celular el CSS usa esto para dejar la pantalla partida en dos: mapa arriba, ficha
   * abajo. Se van el conmutador de modo, la capa y las leyendas —son ajustes de la vista
   * general— y se retira la hoja, que si no le suma sus 104 px a la ficha y entre las dos
   * dejan el mapa en un tercio. «← Ver todo» se queda: es la salida.
   *
   * `colapsarHoja()` antes de marcar, para que la hoja no se quede con un `transform` en
   * línea de un arrastre previo — el estilo en línea le gana a la regla CSS que la
   * retira, y se quedaría a medio camino tapando la ficha.
   */
  function marcarFichaAbierta(abierta: boolean): void {
    if (abierta) {
      colapsarHoja();
      document.documentElement.dataset['ficha'] = '';
    } else {
      delete document.documentElement.dataset['ficha'];
    }

    // La fila de arriba acaba de cambiar de alto y `--ficha-top` manda sobre lo de abajo.
    ajustarControlesSuperiores();

    // Abrir o cerrar la ficha cambia qué parte del mapa está tapada sin mover la cámara,
    // así que no hay `moveend` que dispare la recolocación de los nombres. Aquí sí.
    etiquetas?.programar();
  }

  /**
   * Cuánto de la parte de abajo está tapado ahora mismo, para que la cámara encuadre el
   * municipio en lo que **se ve** y no detrás de un panel.
   *
   * Se mide, no se supone: con la ficha abierta tapa media pantalla, y con la ficha
   * cerrada tapa solo el asa de la hoja. Antes se restaba siempre `--asomada`, así que al
   * abrir la ficha el casco urbano quedaba centrado justo debajo de ella.
   */
  function altoTapadoAbajo(): number {
    const ficha = document.getElementById('detalle');
    const marco = document.querySelector('.marco');

    if (ficha && marco && !ficha.hasAttribute('hidden')) {
      const caja = ficha.getBoundingClientRect();
      const borde = marco.getBoundingClientRect();
      /**
       * Solo cuenta si **de verdad** llega al borde de abajo. En celular la ficha ocupa
       * la mitad inferior y hay que descontarla entera; en escritorio vive arriba a la
       * derecha y no tapa nada de abajo, así que restarle su alto encuadraría el
       * municipio demasiado arriba. Se comprueba con el rectángulo en vez de con un
       * `matchMedia`: si algún día cambia el punto de quiebre, esto sigue siendo cierto.
       */
      if (caja.height > 0 && caja.bottom >= borde.bottom - 2) return caja.height;
    }

    return (
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--asomada')) * 16 ||
      104
    );
  }

  /**
   * Enciende el degradado del borde inferior mientras quede contenido por debajo.
   *
   * La barra de desplazamiento se dejó siempre visible, pero no basta: en móvil muchos
   * navegadores la dibujan superpuesta y solo mientras el dedo arrastra, así que la
   * pista llega cuando la persona ya decidió que no había nada más. El degradado sí se
   * ve sin tocar nada, y se apaga al llegar al final para no mentir.
   */
  function actualizarPistaDeMas(): void {
    if (!panel) return;

    const desborde = panel.scrollHeight - panel.clientHeight;
    panel.toggleAttribute('data-mas', desborde - panel.scrollTop > 4);

    /**
     * Barra de desplazamiento propia, solo donde la del navegador no se ve.
     *
     * En celular la barra nativa va **superpuesta**: aparece mientras el dedo arrastra y
     * se va, así que la pista de que hay más contenido no está cuando hace falta. Ni
     * `scrollbar-width` ni `::-webkit-scrollbar` la vuelven clásica ahí. Se dibuja a
     * mano, y se enciende solo si la nativa **no reserva ancho** — si lo reserva, como
     * en escritorio, ya se ve y poner otra sería tener dos.
     */
    const pulgar = document.getElementById('ficha-pulgar');
    /**
     * `offsetWidth - clientWidth` **no** es el ancho de la barra: incluye los bordes de
     * la ficha. Medido, daba 2 px con la barra superpuesta —los dos bordes de 1 px— y el
     * dibujo propio no se encendía nunca, que era justo el caso para el que existe. Hay
     * que descontarlos para saber si el navegador reserva sitio o no.
     */
    const estilo = getComputedStyle(panel);
    const bordes =
      parseFloat(estilo.borderLeftWidth || '0') + parseFloat(estilo.borderRightWidth || '0');
    const barraNativa = panel.offsetWidth - panel.clientWidth - bordes;
    const dibujarla = barraNativa < 1 && desborde > 4;
    panel.toggleAttribute('data-barra', dibujarla);
    if (!pulgar || !dibujarla) return;

    const visible = panel.clientHeight;
    const alto = Math.max(28, (visible * visible) / panel.scrollHeight);
    const recorrido = visible - alto;
    pulgar.style.height = `${Math.round(alto)}px`;
    pulgar.style.transform = `translateY(${Math.round((panel.scrollTop / desborde) * recorrido)}px)`;
  }

  function cerrarFicha(): void {
    panel?.setAttribute('hidden', '');
    mapa.setFilter('municipio-seleccionado', ['==', ['get', 'pcode'], '']);
    pcodeAbierto = null;
    marcarFichaAbierta(false);
    // Cerrar la ficha por cualquier vía retira también la trama y los incidentes: eran del
    // municipio que se acaba de cerrar. Antes solo lo hacía «← Ver todo».
    limpiarCapasDeMunicipio();
    etiquetas?.fijarAbierto(null);
  }

  function mostrar(props: Record<string, unknown>): void {
    // Antes de mostrar cualquier cosa nueva, se repliegan las leyendas si están
    // abiertas. Dos paneles flotantes a la vez (la ficha y una leyenda desplegada)
    // se sienten como que la interfaz no sabe qué es lo importante ahora mismo.
    document.getElementById('leyenda')?.removeAttribute('open');
    document.getElementById('leyenda-poblacion')?.removeAttribute('open');

    pcodeAbierto = String(props['pcode'] ?? '') || null;
    marcarFichaAbierta(true);

    const mmi = typeof props['mmi'] === 'number' ? props['mmi'] : null;

    set('detalle-nombre', String(props['name'] ?? ''));

    const departamento = String(props['admin1_name'] ?? '');
    const grado = document.getElementById('detalle-grado');

    if (mmi === null) {
      // Sin insignia: `:empty` la esconde, y así la cabecera no reserva un hueco de
      // color para un dato que no existe.
      set('detalle-grado', '');
      set('detalle-depto', [departamento, 'sin cobertura del ShakeMap'].filter(Boolean).join(' · '));
      set('detalle-label', 'Sin medición de intensidad aquí');
      set('detalle-metodo', '');
      if (grado) grado.style.cssText = '';
    } else {
      const nivel = levelFor(mmi);
      set('detalle-grado', nivel.roman);
      // Departamento y grado numérico en la misma línea: son las dos coordenadas que
      // sitúan la ficha, y ninguna necesita un renglón propio.
      set('detalle-depto', [departamento, `MMI ${mmi}`].filter(Boolean).join(' · '));
      set('detalle-label', nivel.label);
      set(
        'detalle-metodo',
        props['method'] === 'centroid'
          ? 'Muestreado en el centro: el municipio es más pequeño que una celda de la malla.'
          : 'Máximo de las celdas de la malla dentro del municipio.',
      );
      if (grado) {
        grado.style.background = nivel.color;
        grado.style.color = nivel.ink;
      }
    }

    pintarPoblacion(props);
    document.getElementById('detalle-metricas')?.setAttribute('data-modo', modoActual);

    const pcode = String(props['pcode'] ?? '');
    pintarCobertura(pcode);
    pintarCifras(pcode);
    void mostrarIncidentes(pcode);
    void mostrarSecciones(pcode);
    // Sin punto: `acercarA()` lo afina con el centro del casco en cuanto vuela. Se marca
    // aquí igual para el caso en que la ficha se abra sin mover la cámara.
    etiquetas?.fijarAbierto(pcode);

    panel?.removeAttribute('hidden');
    // Cada municipio empieza por arriba. Sin esto, quien había bajado a leer las cifras
    // de uno abría el siguiente ya desplazado, sin ver ni el nombre.
    if (panel) panel.scrollTop = 0;
    actualizarPistaDeMas();
    mapa.setFilter('municipio-seleccionado', ['==', ['get', 'pcode'], props['pcode'] as string]);
  }

  /**
   * Acerca el mapa al municipio.
   *
   * `maxZoom` evita que un municipio diminuto deje la pantalla llena de un solo polígono
   * sin referencias alrededor: al no haber mapa base, quedarse sin vecinos a la vista es
   * quedarse sin saber dónde se está.
   */
  async function acercarA(feature: (typeof municipios.features)[number]): Promise<void> {
    const pcode = feature.properties.pcode;

    /**
     * Encuadra el **casco urbano**, no el municipio entero.
     *
     * Un municipio colombiano es mayoritariamente rural: encuadrar sus límites deja el
     * pueblo como un punto diminuto en una esquina, rodeado de monte. Y donde vive la
     * gente —y donde se caen los edificios— es en el casco.
     *
     * Las secciones urbanas del DANE son exactamente el suelo urbano, así que su caja
     * envolvente ES el casco. Si el municipio no tiene suelo urbano cartografiado, se
     * cae de vuelta a los límites municipales.
     */
    const urbano = await bboxUrbano(pcode);
    const caja = urbano ?? bboxDe(feature.geometry);
    if (!Number.isFinite(caja[0])) return;

    /**
     * El nombre del municipio abierto se cuelga del centro del encuadre, no de su punto
     * representativo.
     *
     * Con el casco llenando la pantalla, el punto representativo del municipio entero
     * —que es rural y mucho más grande— puede quedar fuera de cuadro, así que el nombre
     * del municipio que se está mirando sería justo el que desaparece. El centro de esta
     * caja está en pantalla por construcción: es donde la cámara acaba de volar.
     */
    etiquetas?.fijarAbierto(pcode, [(caja[0] + caja[2]) / 2, (caja[1] + caja[3]) / 2]);
    // Se apagan durante el vuelo: si no, cruzan la pantalla deslizándose y pueden acabar
    // detrás de la ficha. `moveend` las vuelve a colocar al aterrizar.
    etiquetas?.apagar();

    mapa.fitBounds(
      [
        [caja[0], caja[1]],
        [caja[2], caja[3]],
      ],
      {
        padding: { top: 40, right: 40, bottom: Math.round(altoTapadoAbajo()) + 24, left: 40 },
        // Más cerca cuando encuadramos el casco: ahí sí tiene sentido ver manzanas.
        maxZoom: urbano ? 14 : 11,
        duration: prefiereMenosMovimiento ? 0 : 500,
      },
    );
  }

  /** Caja del suelo urbano del municipio, si está cartografiado. */
  async function bboxUrbano(pcode: string): Promise<[number, number, number, number] | undefined> {
    const secciones = await cargarSecciones(pcode);
    if (!secciones || secciones.features.length === 0) return undefined;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const f of secciones.features) {
      const [a, b, c, d] = bboxDe(f.geometry);
      if (a < minX) minX = a;
      if (b < minY) minY = b;
      if (c > maxX) maxX = c;
      if (d > maxY) maxY = d;
    }

    return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : undefined;
  }

  mapa.on('click', 'municipios-relleno', (e) => {
    const props = e.features?.[0]?.properties;
    if (!props) return;

    // Tocar el municipio que ya está abierto lo cierra, en vez de repintar la misma
    // ficha: es el gesto que se espera de un panel que se abrió al tocar.
    if (props['pcode'] === pcodeAbierto) {
      cerrarFicha();
      return;
    }

    mostrar(props);

    const f = municipios.features.find((x) => x.properties.pcode === props['pcode']);
    if (f) {
      acercarA(f);
      volver?.removeAttribute('hidden');
    }
  });

  // Tocar el mapa fuera de cualquier municipio también cierra la ficha — el otro gesto
  // esperado. `queryRenderedFeatures` dice si el punto tocado cayó sobre un polígono;
  // si cayó, el handler de arriba ya se encargó y este no debe hacer nada más.
  mapa.on('click', (e) => {
    if (!pcodeAbierto) return;
    const tocoMunicipio = mapa.queryRenderedFeatures(e.point, { layers: ['municipios-relleno'] }).length > 0;
    if (!tocoMunicipio) cerrarFicha();
  });

  mapa.on('mouseenter', 'municipios-relleno', () => {
    mapa.getCanvas().style.cursor = 'pointer';
  });
  mapa.on('mouseleave', 'municipios-relleno', () => {
    mapa.getCanvas().style.cursor = '';
  });

  document.getElementById('cerrar-detalle')?.addEventListener('click', cerrarFicha);

  panel?.addEventListener('scroll', actualizarPistaDeMas, { passive: true });

  // El contenido cambia de alto sin que nadie desplace nada: las cifras del municipio
  // llegan después de pintarlo y la leyenda de puntos aparece o no. Se observa
  // `.ficha-cuerpo` y no la ficha: en celular la ficha mide media pantalla siempre, así
  // que su caja nunca cambia y el observador no dispararía ni una vez.
  const cuerpo = panel?.querySelector('.ficha-cuerpo');
  if (cuerpo && 'ResizeObserver' in window) {
    new ResizeObserver(actualizarPistaDeMas).observe(cuerpo);
  }

  // En móvil la leyenda pasa a flujo normal dentro del marco, así que el alto del
  // contenedor cambia después de inicializar el mapa. MapLibre no se entera solo y
  // el lienzo queda con el tamaño viejo — en blanco, en la práctica.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => mapa.resize()).observe(contenedor);
  }
  mapa.resize();

  // La leyenda se abre sola solo donde sobra espacio.
  if (window.matchMedia('(min-width: 40rem)').matches) {
    document.querySelector('.leyenda')?.setAttribute('open', '');
  }

  /**
   * Encuadra la zona que de verdad se sacudió, en vez de fijar un zoom.
   *
   * Un zoom fijo se ve bien en la pantalla donde se eligió y mal en todas las demás: en
   * un celular vertical recortaba media zona afectada. Encuadrando por los límites, el
   * mapa se adapta a cualquier proporción.
   *
   * El relleno inferior deja libre la hoja asomada, para que no tape los municipios más
   * golpeados justo al abrir.
   */
  // `mmi` se le añadió a las propiedades más arriba, al cruzar la intensidad con la
  // geometría, así que el tipo declarado de MunicipioProps ya no lo describe del todo.
  const afectados = municipios.features.filter((f) => {
    const mmi = (f.properties as unknown as { mmi?: number }).mmi;
    return typeof mmi === 'number' && mmi >= 5.5;
  });

  const alturaAsomada =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--asomada')) * 16 || 104;

  let vistaGeneral: maplibregl.LngLatBounds | undefined;

  if (afectados.length > 0) {
    vistaGeneral = new maplibregl.LngLatBounds();
    for (const f of afectados) {
      const [minX, minY, maxX, maxY] = bboxDe(f.geometry);
      vistaGeneral.extend([minX, minY]);
      vistaGeneral.extend([maxX, maxY]);
    }

    mapa.fitBounds(vistaGeneral, {
      padding: { top: 24, right: 24, bottom: Math.round(alturaAsomada) + 16, left: 24 },
      duration: 0,
      maxZoom: 8,
    });
  }

  // ── Incidentes por municipio ────────────────────────────────────────────
  //
  // Se descargan solo al abrir un municipio. El índice dice cuáles tienen registro; los
  // que no aparecen **no tienen cartografía**, que no es lo mismo que no tener daños, y
  // la interfaz tiene que decir esa diferencia en voz alta.
  const indiceIncidentes = await getJson<{ municipios: string[] }>('incidentes/index.json').catch(
    () => ({ municipios: [] as string[] }),
  );
  const conIncidentes = new Set(indiceIncidentes.municipios);
  const incidentesCargados = new Map<string, ColeccionIncidentes>();

  /**
   * Cobertura periodística por municipio.
   *
   * Solo trae los municipios que el registro considera —los que superan el umbral de daño
   * o tienen alguna nota—, y eso es justo lo que hace publicable el mensaje: en un
   * municipio que apenas tembló no se dice nada, en vez de decir una obviedad en 1.122
   * fichas. Ese fue el error del aviso anterior.
   */
  const cobertura = await getJson<{ municipios: CoberturaMunicipio[] }>(
    'fuentes/cobertura.json',
  ).catch(() => ({ municipios: [] as CoberturaMunicipio[] }));
  const coberturaPorPcode = new Map(cobertura.municipios.map((m) => [m.pcode, m]));

  // ── Trama urbana ────────────────────────────────────────────────────────
  //
  // Secciones urbanas del DANE: la geografía oficial por debajo del municipio. Se
  // dibujan al acercarse, para que un incidente se lea «en esta parte de la ciudad» y
  // no solo «en Cali». No traen nombre de barrio —el MGN solo publica códigos—; el
  // nombre lo aporta el reporte, en el campo `barrio` del incidente.
  const indiceSecciones = await getJson<{ municipios: { pcode: string }[] }>(
    'secciones/index.json',
  ).catch(() => ({ municipios: [] as { pcode: string }[] }));

  const conSecciones = new Set(indiceSecciones.municipios.map((m) => m.pcode));
  const seccionesCargadas = new Map<string, unknown>();

  mapa.addSource('secciones', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  /**
   * ⚠️ **El alfa se expresa en UN solo sitio: la propiedad `*-opacity`.** Los colores van
   * en hex opaco.
   *
   * Esto no es estilo, es la corrección de un fallo que dejó la capa invisible durante
   * rondas. Estaba así: `line-color: '#00000055'` (alfa 0x55/255 = 0,33) **y** además
   * `line-opacity` con tope 0,4. MapLibre los **multiplica**:
   *
   *     0,33 × 0,4 = 0,133 de opacidad efectiva, sobre una línea de 0,6 px
   *
   * o sea un pelo por debajo del píxel que el antialiasing convertía en una mancha gris.
   * La rampa de zoom se agregó después sin quitarle el alfa al color.
   *
   * Las capas hermanas usan la convención contraria —`municipios-borde` es `#00000022` sin
   * `line-opacity`, `departamentos-borde` es `#00000066`— y también es válida. Lo que no
   * vale es **las dos a la vez**. Aquí hace falta rampa por zoom, así que el alfa vive en
   * la opacidad y el color queda opaco.
   *
   * ⚠️ **El orden importa y es posicional, no declarativo.** Las dos capas van con
   * `beforeId: 'municipios-borde'`, así que quedan por encima del ráster de deslizamientos
   * (que se inserta más arriba en este archivo) y por debajo de los límites, del epicentro
   * y de las réplicas. Sin mapa base (ADR-010) los límites son el esqueleto del mapa y no
   * se pueden velar; un relleno sobre el anillo del epicentro lo lavaría. Si algún día se
   * mueve uno de los dos bloques, esto se rompe en silencio.
   */
  mapa.addLayer(
    {
      id: 'secciones-relleno',
      type: 'fill',
      source: 'secciones',
      paint: {
        // Se fija por municipio en `mostrarSecciones()`; este es solo el valor de arranque.
        'fill-color': tintaSobreMunicipio(null, modoOscuro.matches),
        /**
         * La **masa** del casco: lo que se ve de un vistazo y lo que contesta a «no se
         * puede ver». Un contorno de manzanas no dice «aquí está lo construido»; un salto
         * de luminosidad en el borde del casco, sí.
         *
         * 0 por debajo de z8 —a escala regional un casco son unos pocos píxeles—, pico de
         * 0,16 entre z9,5 y z13 (la banda por la que pasa la cámara, y donde aterriza
         * `acercarA` cuando el municipio **no** tiene casco: `maxZoom: 11`), y baja a 0,10
         * en z13. Al llenar el casco la pantalla, un velo sobre *todo* ya no es una pista
         * de forma: solo le cuesta fidelidad a la coropleta, así que el relleno se retira
         * y toman el relevo las líneas.
         *
         * 0,16 mueve la luminosidad del color del USGS sin tocarle el tono, así que las
         * bandas de intensidad siguen distinguiéndose (ADR-009).
         */
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 9.5, 0.16, 13, 0.1],
      },
    },
    'municipios-borde',
  );

  mapa.addLayer(
    {
      id: 'secciones-borde',
      type: 'line',
      source: 'secciones',
      // Las 967 secciones de Cali producen miters astillados a 2 px de ancho.
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': tintaSobreMunicipio(null, modoOscuro.matches),
        // 1,4 px en z13 y 2 px en z15, que es donde de verdad aterriza `acercarA`
        // (`maxZoom: 14` con casco) y donde alguien hace pinza para ver un barrio.
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 13, 1.4, 15, 2],
        // Opacidad efectiva, ahora que el color es opaco. Contra los 0,133 de antes:
        // **6× la opacidad y 2,3× el ancho** al mismo zoom.
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0, 12, 0.55, 14, 0.8],
      },
    },
    'municipios-borde',
  );

  /** Carga (y cachea) las secciones urbanas de un municipio. */
  async function cargarSecciones(
    pcode: string,
  ): Promise<FeatureCollection<Geometry, unknown> | undefined> {
    if (!conSecciones.has(pcode)) return undefined;

    if (!seccionesCargadas.has(pcode)) {
      try {
        const topo = await getJson(`secciones/${pcode}.topojson`);
        seccionesCargadas.set(pcode, topoToGeo(topo, 'municipios'));
      } catch {
        return undefined;
      }
    }

    return seccionesCargadas.get(pcode) as FeatureCollection<Geometry, unknown> | undefined;
  }

  /**
   * Fija la tinta de la trama según el MMI del municipio abierto.
   *
   * Se guarda el último pcode para poder recalcularla si cambia el tema sin que haya
   * cambiado el municipio.
   */
  let pcodeTrama: string | null = null;

  function pintarTrama(): void {
    const mmi = pcodeTrama ? porPcode.get(pcodeTrama)?.mmi ?? null : null;
    const tinta = tintaSobreMunicipio(mmi, modoOscuro.matches);
    mapa.setPaintProperty('secciones-relleno', 'fill-color', tinta);
    mapa.setPaintProperty('secciones-borde', 'line-color', tinta);
  }

  async function mostrarSecciones(pcode: string): Promise<void> {
    const fuente = mapa.getSource('secciones') as maplibregl.GeoJSONSource | undefined;
    if (!fuente) return;

    pcodeTrama = pcode;
    pintarTrama();

    const secciones = await cargarSecciones(pcode);
    fuente.setData((secciones ?? { type: 'FeatureCollection', features: [] }) as never);
  }

  /**
   * Vacía lo que solo tiene sentido con un municipio abierto.
   *
   * Vivía suelto dentro del botón «← Ver todo», así que **cerrar la ficha de cualquier
   * otra forma dejaba la trama y los incidentes del municipio anterior pintados encima del
   * mapa**: tocar el mismo municipio otra vez, o tocar fuera de todo polígono. Se notaba
   * poco mientras la trama era invisible; ahora que se ve 6× más y además tiene relleno,
   * se notaría mucho. Lo llaman los dos sitios para que no puedan volver a discrepar.
   */
  function limpiarCapasDeMunicipio(): void {
    for (const capa of ['incidentes', 'secciones']) {
      (mapa.getSource(capa) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
    pcodeTrama = null;
  }

  // El tema no es CSS aquí dentro: los colores del lienzo se fijan en JavaScript, así que
  // hay que repintarlos a mano cuando cambia. Sin esto, cambiar el tema del sistema con la
  // página abierta dejaba el fondo del mapa en claro bajo una interfaz oscura.
  modoOscuro.addEventListener('change', () => {
    mapa.setPaintProperty('fondo', 'background-color', fondoDelMapa(modoOscuro.matches));
    pintarTrama();
  });

  // ── Nombres de municipio ────────────────────────────────────────────────
  //
  // Se crean aquí, ya con todas las capas puestas. Los nombres son lo que permite ubicarse
  // a quien no se sabe la geografía de memoria: sin mapa base (ADR-010) el país es un
  // mosaico de polígonos de colores y nada dice cuál es cuál.
  etiquetas = crearEtiquetas({
    mapa,
    municipios: municipios.features as unknown as {
      geometry: Geometry;
      properties: PropsEtiqueta;
    }[],
  });
  etiquetas.programar();

  mapa.addSource('incidentes', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  mapa.addLayer({
    id: 'incidentes',
    type: 'circle',
    source: 'incidentes',
    paint: {
      'circle-radius': 7,
      'circle-color': [
        'match',
        ['get', 'tipo'],
        ...Object.entries(COLOR_INCIDENTE).flat(),
        COLOR_INCIDENTE_SIN_TIPO,
      ] as unknown as ExpressionSpecification,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
      // Lo recortado a la rejilla se dibuja más difuso: el punto no es la ubicación
      // real y el mapa no debería sugerir que sí.
      'circle-opacity': ['case', ['==', ['get', 'precision'], 'exacta'], 0.95, 0.6],
    },
  });

  /**
   * Leyenda de los puntos de incidentes (tarea 1): solo los tipos presentes en la
   * colección del municipio abierto, más la nota de sólido/difuso. Vive en la ficha,
   * no como caja flotante nueva, porque los incidentes solo se pintan mientras una
   * ficha está abierta — no compite por espacio con `.modos` ni con las leyendas de MMI
   * o población.
   */
  function pintarLeyendaIncidentes(features: Feature<Point, IncidenteProps>[]): void {
    const contenedor = document.getElementById('detalle-leyenda-incidentes');
    const lista = document.getElementById('leyenda-incidentes-lista');
    if (!contenedor || !lista) return;

    lista.replaceChildren();

    const tipos = [...new Set(features.map((f) => f.properties.tipo))];
    if (tipos.length === 0) {
      contenedor.setAttribute('hidden', '');
      return;
    }

    for (const tipo of tipos) {
      const li = document.createElement('li');

      const muestra = document.createElement('span');
      muestra.className = 'muestra';
      muestra.style.background = COLOR_INCIDENTE[tipo] ?? COLOR_INCIDENTE_SIN_TIPO;

      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = ETIQUETAS_INCIDENTE[tipo] ?? tipo;

      li.append(muestra, desc);
      lista.append(li);
    }

    contenedor.removeAttribute('hidden');
  }

  async function mostrarIncidentes(pcode: string): Promise<void> {
    const fuente = mapa.getSource('incidentes') as maplibregl.GeoJSONSource | undefined;

    if (!conIncidentes.has(pcode)) {
      fuente?.setData({ type: 'FeatureCollection', features: [] });
      pintarAyuda([]);
      pintarLeyendaIncidentes([]);
      return;
    }

    if (!incidentesCargados.has(pcode)) {
      try {
        incidentesCargados.set(pcode, await getJson<ColeccionIncidentes>(`incidentes/${pcode}.geojson`));
      } catch {
        pintarAyuda([]);
        pintarLeyendaIncidentes([]);
        return;
      }
    }

    const coleccion = incidentesCargados.get(pcode) as ColeccionIncidentes;
    fuente?.setData(coleccion as never);
    pintarAyuda(coleccion.features);
    pintarLeyendaIncidentes(coleccion.features);
  }

  /**
   * Aquí estaba `pintarCobertura()`, que escribía en cada ficha si el municipio tenía
   * cartografía de incidentes. Se retiró a pedido del responsable del proyecto.
   *
   * El motivo es bueno: **salía en los 1.122 municipios**, porque hoy no hay ni un
   * incidente curado en producción. Un aviso que aparece siempre deja de informar —
   * nadie lee la advertencia que sale en todas las pantallas— y encima ocupaba, en
   * rojo, el sitio donde debería estar lo que sí cambia de un municipio a otro.
   *
   * La regla que lo motivaba sigue siendo cierta y sigue en `CLAUDE.md`: «sin dato» no
   * es «sin daño», y confundirlas manda equipos al lugar equivocado. Lo que cambia es
   * dónde se dice: **una vez**, en la leyenda o en «Sobre esto», y no repetida en cada
   * ficha. Cuando haya incidentes curados, la leyenda de puntos —que sí aparece solo
   * cuando hay algo que explicar— vuelve a cubrir el caso contrario.
   */

  // Botón para volver a la vista general. Sin mapa base, alguien que se acercó a un
  // municipio pequeño puede perder por completo la referencia de dónde está.
  const volver = document.getElementById('volver-vista');
  volver?.addEventListener('click', () => {
    volver.setAttribute('hidden', '');
    cerrarFicha();
    etiquetas?.apagar();

    if (vistaGeneral) {
      mapa.fitBounds(vistaGeneral, {
        padding: { top: 24, right: 24, bottom: Math.round(alturaAsomada) + 16, left: 24 },
        duration: prefiereMenosMovimiento ? 0 : 450,
        maxZoom: 8,
      });
    }
  });

  // Desde la tabla se puede saltar al mapa: es la ruta natural para alguien que
  // busca un municipio concreto y no quiere cazarlo con el dedo.
  for (const fila of document.querySelectorAll<HTMLElement>('tbody tr')) {
    const nombre = fila.querySelector('th')?.textContent?.trim();
    if (!nombre) continue;

    fila.style.cursor = 'pointer';
    fila.addEventListener('click', () => {
      const f = municipios.features.find((x) => x.properties.name === nombre);
      if (!f) return;

      mostrar(f.properties as unknown as Record<string, unknown>);
      acercarA(f);
      volver?.removeAttribute('hidden');

      // En móvil la hoja tapa el mapa; se recoge para que se vea a dónde voló.
      colapsarHoja();
    });
  }

  /**
   * Asa para verificar desde la consola, **solo en desarrollo**.
   *
   * La regla de este proyecto es que un cambio de interfaz no está verificado hasta que se
   * mide el rectángulo en el navegador. Para las capas eso significa preguntarle al
   * renderizador (`queryRenderedFeatures`) y no a la fuente de datos, y sin un asa no hay
   * forma de preguntárselo. `import.meta.env.DEV` la elimina de la compilación de
   * producción.
   */
  if (import.meta.env.DEV) {
    (window as unknown as { __mapa?: maplibregl.Map }).__mapa = mapa;
  }
}
