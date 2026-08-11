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
// Sin esta hoja de estilos el lienzo no queda posicionado y los controles se
// dibujan como texto suelto encima del mapa. Va aquí, dentro del módulo diferido,
// para que viaje en el mismo trozo que MapLibre y no en la carga inicial.
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';

import { levelFor, mmiColorStops } from './mmi';
import { ETIQUETAS, TIPOS_FUENTE, ordenar } from './metricas';

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
}

/** Lo que el mapa necesita de una observación. El tipo completo vive en el paquete de ingesta. */
type ObservacionLigera = import('@report-cali/ingest/schema').Observation;

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

/** Estilo mínimo: solo un fondo. Las capas de datos se añaden al cargar. */
function estiloBase(): StyleSpecification {
  const oscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'fondo',
        type: 'background',
        paint: { 'background-color': oscuro ? '#0c0e12' : '#eef0f4' },
      },
    ],
  };
}

export async function iniciarMapa(): Promise<void> {
  const contenedor = document.getElementById('mapa');
  if (!contenedor) return;

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
    });
  }

  const mapa = new maplibregl.Map({
    container: contenedor,
    style: estiloBase(),
    center: [evento.longitude + 0.8, evento.latitude + 0.4],
    zoom: 5.6,
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
   * Pinta las cifras del municipio dentro de la ficha.
   *
   * Se construye con `textContent` y `createElement`, nunca con `innerHTML`: el nombre de
   * la fuente y las notas vienen de un archivo que edita gente por pull request, y aunque
   * pase por revisión, no es lugar para confiar en que nadie escriba una etiqueta.
   */
  function pintarCifras(pcode: string): void {
    const contenedor = document.getElementById('detalle-cifras');
    const lista = document.getElementById('detalle-lista');
    if (!contenedor || !lista) return;

    const cifras = ordenar(cifrasPorPcode.get(pcode) ?? []);
    lista.replaceChildren();

    if (cifras.length === 0) {
      contenedor.setAttribute('hidden', '');
      return;
    }

    for (const o of cifras) {
      const li = document.createElement('li');

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

      q.append(f);
      li.append(n, q);
      lista.append(li);
    }

    contenedor.removeAttribute('hidden');
  }

  function mostrar(props: Record<string, unknown>): void {
    const mmi = typeof props['mmi'] === 'number' ? props['mmi'] : null;

    set('detalle-nombre', String(props['name'] ?? ''));
    set('detalle-depto', String(props['admin1_name'] ?? ''));

    const grado = document.getElementById('detalle-grado');
    if (mmi === null) {
      set('detalle-grado', '—');
      set('detalle-valor', 'sin cobertura del ShakeMap');
      set('detalle-label', '');
      set('detalle-metodo', '');
      if (grado) grado.style.cssText = '';
    } else {
      const nivel = levelFor(mmi);
      set('detalle-grado', nivel.roman);
      set('detalle-valor', `MMI ${mmi}`);
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

    pintarCifras(String(props['pcode'] ?? ''));

    panel?.removeAttribute('hidden');
    mapa.setFilter('municipio-seleccionado', ['==', ['get', 'pcode'], props['pcode'] as string]);
  }

  mapa.on('click', 'municipios-relleno', (e) => {
    const props = e.features?.[0]?.properties;
    if (props) mostrar(props);
  });

  mapa.on('mouseenter', 'municipios-relleno', () => {
    mapa.getCanvas().style.cursor = 'pointer';
  });
  mapa.on('mouseleave', 'municipios-relleno', () => {
    mapa.getCanvas().style.cursor = '';
  });

  document.getElementById('cerrar-detalle')?.addEventListener('click', () => {
    panel?.setAttribute('hidden', '');
    mapa.setFilter('municipio-seleccionado', ['==', ['get', 'pcode'], '']);
  });

  // En móvil la leyenda pasa a flujo normal dentro del marco, así que el alto del
  // contenedor cambia después de inicializar el mapa. MapLibre no se entera solo y
  // el lienzo queda con el tamaño viejo — en blanco, en la práctica.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => mapa.resize()).observe(contenedor);
  }
  mapa.resize();

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
      document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}
