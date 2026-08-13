/**
 * Nombres de municipio sobre el mapa.
 *
 * **Por qué marcadores HTML y no una capa `symbol`.** Lo cartográficamente normal sería
 * `type: 'symbol'` con `text-field`, que trae colisión automática, halo y tamaño por zoom.
 * No se puede: una capa de símbolos **no dibuja nada** sin una URL de `glyphs` desde donde
 * bajar los mapas de bits de la tipografía, el estilo de este mapa no tiene ninguna
 * (`estiloBase()` es solo un fondo), y ADR-010 prohíbe depender de un proveedor externo en
 * la ruta crítica. Autoalojar los glifos serían cientos de kilobytes y una herramienta de
 * compilación nueva, para un sitio cuyo compromiso es pesar poco.
 *
 * Con marcadores HTML: cero dependencias nuevas, el tema sale gratis de `tokens.css`
 * —las propiedades personalizadas heredan hasta dentro del marcador— y el texto es texto
 * de verdad, no píxeles en un lienzo. Lo que hay que escribir a mano es la colisión, que es
 * la mayor parte de este archivo.
 *
 * **No hay nombres de barrio.** Las secciones urbanas del DANE solo publican códigos
 * (`secu_ccnct`, `setu_ccnct`), así que lo que se puede rotular es el municipio. Poner
 * «Sector 1808» sería peor que no poner nada.
 */
import maplibregl from 'maplibre-gl';
import type { Geometry } from 'geojson';

import '../styles/etiquetas.css';
import { UMBRAL_DANINO } from './mmi';

/** Lo que hace falta de un municipio para decidir si se rotula y con cuánto énfasis. */
export interface PropsEtiqueta {
  pcode: string;
  name: string;
  admin1_pcode: string;
  poblacion?: number | null;
  mmi?: number | null;
}

export interface OpcionesEtiquetas {
  mapa: maplibregl.Map;
  municipios: { geometry: Geometry; properties: PropsEtiqueta }[];
}

export interface GestorEtiquetas {
  /** Recoloca en el próximo fotograma. Idempotente dentro del mismo fotograma. */
  programar(): void;
  /** Las apaga durante un vuelo de cámara; `moveend` las vuelve a colocar. */
  apagar(): void;
  /**
   * Marca el municipio abierto, que entra siempre y con el énfasis más fuerte.
   * `punto` es el centro del casco urbano, que en zoom cerrado es el único punto que se
   * garantiza en pantalla.
   */
  fijarAbierto(pcode: string | null, punto?: [number, number]): void;
}

type Nivel = 'normal' | 'principal' | 'abierto';

/**
 * Cundinamarca no tiene capital `…001`: la suya es Bogotá, que es entidad aparte
 * (`CO11001`). Sin esta excepción, «Agua de Dios» (`CO25001`, 14.324 hab.) se rotularía
 * como capital de departamento.
 */
const SIN_CAPITAL_PROPIA = new Set(['CO25001']);

/**
 * Capital de departamento ⇔ el pcode del municipio es el del departamento más `001`.
 *
 * Es una convención de DIVIPOLA, no una coincidencia: comprobado contra los datos reales,
 * la cumplen exactamente 33 municipios y hay exactamente 33 departamentos.
 *
 * **No se usa un mínimo de población para limpiarlo**, aunque sería más corto: las
 * capitales más pequeñas son Puerto Carreño (21.160), Inírida (36.587), Mitú (40.675) y
 * Leticia (56.015), así que cualquier umbral cómodo se come cuatro capitales de verdad.
 * Una excepción nombrada dice lo que pasa; un umbral lo esconde.
 */
function esCapital(p: PropsEtiqueta): boolean {
  return p.pcode === `${p.admin1_pcode}001` && !SIN_CAPITAL_PROPIA.has(p.pcode);
}

/**
 * Cuánto merece un nombre el sitio que ocupa.
 *
 * - **Población en `log10`**, la misma escala honesta que ya usa la rampa de «Gente
 *   expuesta»: entre un pueblo de mil y una ciudad de un millón hay tres puntos, no un
 *   factor de mil.
 * - **Capital, +1,2** ≈ multiplicar la población por 16. Son los nombres que la gente
 *   conoce y donde están el hospital, el aeropuerto y el puesto de mando.
 * - **Cruzar `UMBRAL_DANINO` es un escalón, no una pendiente**, y esto importa: con un
 *   premio lineal por MMI, **Barranquilla (MMI 4,5, a 800 km) le ganaba a Quibdó**, que es
 *   la capital del departamento del epicentro. En un mapa de un terremoto. Con el escalón
 *   el orden queda Manizales, Pereira, Cali, Armenia, Quibdó, Ibagué, Bogotá, Medellín.
 */
function importancia(p: PropsEtiqueta, capital: boolean): number {
  const gente = Math.log10(Math.max(1000, p.poblacion ?? 1000));
  const mmi = typeof p.mmi === 'number' ? p.mmi : null;
  const sacudida = mmi !== null && mmi >= UMBRAL_DANINO ? 1 + (mmi - UMBRAL_DANINO) * 0.6 : 0;
  return gente + (capital ? 1.2 : 0) + sacudida;
}

/**
 * Cuántos nombres y a partir de qué tamaño, por banda de zoom.
 *
 * El encuadre inicial **no** es el `zoom: 4.8` del constructor: `fitBounds` sobre los
 * municipios con MMI ≥ 5,5 con `maxZoom: 8` lo reemplaza antes del primer pintado, así que
 * la banda de arriba es la que se ve al abrir.
 *
 * Los topes pueden ser generosos porque **la colisión hace el trabajo de verdad**:
 * Manizales y Pereira están a 29 km, que en z7 son ~17 px, así que sobra con dejar que se
 * pisen y gane la más importante.
 */
const NIVELES: { hastaZoom: number; tope: number; minPoblacion: number; soloCapitales: boolean }[] =
  [
    // Solo capitales: a escala regional, un municipio de 200.000 pegado a Pereira no te
    // dice dónde estás, solo pone texto encima de la coropleta.
    { hastaZoom: 8, tope: 8, minPoblacion: 100_000, soloCapitales: true },
    { hastaZoom: 10, tope: 10, minPoblacion: 50_000, soloCapitales: false },
    { hastaZoom: 12, tope: 12, minPoblacion: 15_000, soloCapitales: false },
    { hastaZoom: Infinity, tope: 14, minPoblacion: 0, soloCapitales: false },
  ];

/** Holgura entre rectángulos, en píxeles. Dos nombres a tocarse se leen como uno. */
const HOLGURA = 4;

/** Paneles que no se pueden tapar. Se leen sus rectángulos, no se adivina su sitio. */
const IDS_OBSTACULO = ['controles-superiores', 'detalle', 'leyenda', 'leyenda-poblacion', 'hoja'];
const SELECTORES_OBSTACULO = ['.maplibregl-ctrl-top-left'];

interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

function chocan(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.ancho + HOLGURA &&
    b.x < a.x + a.ancho + HOLGURA &&
    a.y < b.y + b.alto + HOLGURA &&
    b.y < a.y + a.alto + HOLGURA
  );
}

/** Anillos exteriores de una geometría, sin los agujeros. */
function anillosExteriores(g: Geometry): [number, number][][] {
  if (g.type === 'Polygon') return [g.coordinates[0] as [number, number][]];
  if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p[0] as [number, number][]);
  return [];
}

function areaAbsoluta(anillo: [number, number][]): number {
  let suma = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const a = anillo[j];
    const b = anillo[i];
    if (!a || !b) continue;
    suma += (a[0] + b[0]) * (a[1] - b[1]);
  }
  return Math.abs(suma) / 2;
}

/**
 * Un punto **dentro** del municipio del que colgar el nombre.
 *
 * El centro de la caja envolvente no sirve, y el motivo es concreto: las etiquetas son
 * `pointer-events: none`, así que un toque sobre el nombre atraviesa y abre el municipio de
 * debajo — que es la respuesta a «¿debería poder tocarse la etiqueta?», gratis. Si el ancla
 * cae fuera de su propio polígono, tocar el nombre abre **el vecino**. Eso no es un detalle
 * estético, es abrir la ficha equivocada.
 *
 * «Polylabel» de pobre, sin dependencia y determinista: se toma el anillo de mayor área
 * —lo que evita que el ancla de un MultiPolygon caiga en el mar entre dos partes—, se corta
 * por su latitud media y se devuelve el centro del tramo interior más largo. Por la regla
 * de paridad, los cruces ordenados van por parejas dentro/fuera, así que el resultado está
 * dentro por construcción.
 */
function puntoRepresentativo(g: Geometry): [number, number] | undefined {
  const anillos = anillosExteriores(g);
  if (anillos.length === 0) return undefined;

  let anillo = anillos[0];
  let mejorArea = -1;
  for (const candidato of anillos) {
    const area = areaAbsoluta(candidato);
    if (area > mejorArea) {
      mejorArea = area;
      anillo = candidato;
    }
  }
  if (!anillo || anillo.length < 4) return undefined;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const punto of anillo) {
    if (punto[1] < minY) minY = punto[1];
    if (punto[1] > maxY) maxY = punto[1];
  }
  const y = (minY + maxY) / 2;

  const cruces: number[] = [];
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const a = anillo[j];
    const b = anillo[i];
    if (!a || !b) continue;
    const [x1, y1] = a;
    const [x2, y2] = b;
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      cruces.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  cruces.sort((a, b) => a - b);

  let mejorAncho = -1;
  let mejorX = 0;
  for (let i = 0; i + 1 < cruces.length; i += 2) {
    const izq = cruces[i] as number;
    const der = cruces[i + 1] as number;
    if (der - izq > mejorAncho) {
      mejorAncho = der - izq;
      mejorX = (izq + der) / 2;
    }
  }

  return mejorAncho < 0 ? undefined : [mejorX, y];
}

/** Trabajo para cuando el navegador esté libre; el primer pintado es más urgente. */
function enReposo(tarea: () => void): void {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(tarea);
  else setTimeout(tarea, 500);
}

interface Candidato {
  pcode: string;
  nombre: string;
  capital: boolean;
  poblacion: number;
  peso: number;
  geometria: Geometry;
  ancla?: [number, number] | null;
  el?: HTMLElement;
  marcador?: maplibregl.Marker;
  ancho: number;
  alto: number;
  medidaDe?: Nivel;
  puesta: boolean;
}

export function crearEtiquetas({ mapa, municipios }: OpcionesEtiquetas): GestorEtiquetas {
  /**
   * Universo de candidatos, calculado una vez y solo con propiedades — sin tocar geometría.
   * De 1.122 municipios quedan ~613: los que alguien podría querer ubicar. Ordenado una
   * vez, así que colocar nunca vuelve a ordenar.
   */
  const candidatos: Candidato[] = municipios
    .filter((f) => {
      const p = f.properties;
      const mmi = typeof p.mmi === 'number' ? p.mmi : null;
      return (p.poblacion ?? 0) >= 15_000 || esCapital(p) || (mmi !== null && mmi >= UMBRAL_DANINO);
    })
    .map((f) => {
      const capital = esCapital(f.properties);
      return {
        pcode: f.properties.pcode,
        nombre: f.properties.name,
        capital,
        poblacion: f.properties.poblacion ?? 0,
        peso: importancia(f.properties, capital),
        geometria: f.geometry,
        ancho: 0,
        alto: 0,
        puesta: false,
      };
    })
    .sort((a, b) => b.peso - a.peso);

  const porPcode = new Map(candidatos.map((c) => [c.pcode, c]));

  let pcodeAbierto: string | null = null;
  let puntoAbierto: [number, number] | undefined;
  let apagadas = false;
  let pedido = 0;

  // ── Medición del texto, sin tocar el diseño ──────────────────────────────
  //
  // `getBoundingClientRect()` por etiqueta forzaría un recálculo de diseño por etiqueta.
  // En vez de eso se mide una sonda por nivel **una sola vez** y luego se miden todos los
  // nombres con `measureText`, que no toca el DOM.
  const lienzo = document.createElement('canvas').getContext('2d');
  const metricas = new Map<Nivel, { fuente: string; alto: number }>();

  function metricaDe(nivel: Nivel): { fuente: string; alto: number } {
    const guardada = metricas.get(nivel);
    if (guardada) return guardada;

    const sonda = document.createElement('span');
    sonda.className = 'etiqueta-mapa';
    sonda.dataset['nivel'] = nivel;
    sonda.style.position = 'absolute';
    sonda.style.visibility = 'hidden';
    sonda.style.left = '-9999px';
    sonda.textContent = 'Hg';
    document.body.append(sonda);

    const estilo = getComputedStyle(sonda);
    // Se compone a mano en vez de leer el atajo `font`: en algunos motores el atajo
    // devuelve cadena vacía, y entonces `measureText` mediría con la fuente por defecto
    // del lienzo y todos los rectángulos saldrían mal.
    const medida = {
      fuente: `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`,
      alto: sonda.offsetHeight || 16,
    };
    sonda.remove();

    metricas.set(nivel, medida);
    return medida;
  }

  function medir(c: Candidato, nivel: Nivel): void {
    if (c.medidaDe === nivel) return;
    const { fuente, alto } = metricaDe(nivel);
    if (lienzo) {
      lienzo.font = fuente;
      // +2 por el sangrado del halo, que dibuja fuera de la caja del glifo.
      c.ancho = lienzo.measureText(c.nombre).width + 2;
    } else {
      c.ancho = c.nombre.length * 7;
    }
    c.alto = alto + 2;
    c.medidaDe = nivel;
  }

  // ── Anclas ──────────────────────────────────────────────────────────────
  function anclaDe(c: Candidato): [number, number] | undefined {
    if (c.ancla === undefined) c.ancla = puntoRepresentativo(c.geometria) ?? null;
    return c.ancla ?? undefined;
  }

  // Se precalculan en tiempo libre: si no, la primera colocación con zoom cerrado tendría
  // que recorrer cientos de geometrías de golpe para encontrar las que caen en pantalla.
  enReposo(() => {
    for (const c of candidatos) anclaDe(c);
  });

  // ── Obstáculos ──────────────────────────────────────────────────────────
  /**
   * Los rectángulos de los paneles visibles, **en coordenadas del contenedor del mapa**.
   *
   * `mapa.project()` devuelve píxeles relativos al contenedor y `getBoundingClientRect()`
   * los devuelve relativos a la ventana; entre los dos hay el alto del encabezado (52 px).
   * Restar el origen del contenedor es lo que hace que un nombre no acabe esquivando el
   * panel equivocado.
   *
   * Se leen los rectángulos en vez de restar `altoTapadoAbajo()` porque así también se
   * respetan la ficha de **escritorio** (que vive arriba a la derecha y no tapa nada de
   * abajo), la leyenda y la hoja asomada. Un rectángulo de tamaño cero cubre de una vez los
   * casos `hidden`, `display:none` y replegado.
   */
  function obstaculos(): { rects: Rect[]; ancho: number; alto: number } {
    const base = mapa.getContainer().getBoundingClientRect();
    const elementos: Element[] = [];

    for (const id of IDS_OBSTACULO) {
      const el = document.getElementById(id);
      if (el) elementos.push(el);
    }
    for (const selector of SELECTORES_OBSTACULO) {
      for (const el of document.querySelectorAll(selector)) elementos.push(el);
    }

    const rects: Rect[] = [];
    for (const el of elementos) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      rects.push({ x: r.left - base.left, y: r.top - base.top, ancho: r.width, alto: r.height });
    }
    return { rects, ancho: base.width, alto: base.height };
  }

  // ── Colocación ──────────────────────────────────────────────────────────
  function nivelDe(c: Candidato): Nivel {
    if (c.pcode === pcodeAbierto) return 'abierto';
    // «Principal» es capital o ciudad grande: es lo que un socorrista llamaría una ciudad
    // principal, y añade Buenaventura, Palmira o Dosquebradas al conjunto de las capitales.
    return c.capital || c.poblacion >= 250_000 ? 'principal' : 'normal';
  }

  function elementoDe(c: Candidato): HTMLElement {
    if (c.el) return c.el;

    const el = document.createElement('span');
    el.className = 'etiqueta-mapa';
    el.textContent = c.nombre;
    /**
     * Fuera del árbol de accesibilidad, y no por descuido.
     *
     * `Marker.addTo()` pone `role="button"` y `aria-label="Map marker"` —en inglés— a todo
     * elemento que no los traiga ya, así que sin esto un lector de pantalla encontraría
     * hasta catorce botones falsos en inglés en un sitio en español. `role="presentation"`
     * corta esa inyección en seco.
     *
     * Ocultarlas es además lo correcto: son decoración que duplica la tabla de municipios,
     * que ya lista todos con su intensidad, se recorre con el teclado, funciona sin
     * JavaScript y al pulsar una fila vuela el mapa al municipio.
     */
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('role', 'presentation');

    c.el = el;
    c.marcador = new maplibregl.Marker({ element: el, anchor: 'center' });
    return el;
  }

  function colocar(): void {
    if (apagadas) return;

    const zoom = mapa.getZoom();
    const nivel =
      NIVELES.find((n) => zoom < n.hastaZoom) ?? (NIVELES[NIVELES.length - 1] as (typeof NIVELES)[0]);

    const limites = mapa.getBounds();
    const oeste = limites.getWest();
    const este = limites.getEast();
    const sur = limites.getSouth();
    const norte = limites.getNorth();

    // 1. Preselección por propiedades y por encuadre. Recorre la lista ya ordenada y para
    //    al juntar material de sobra, así que no toca los 613 salvo en vistas muy vacías.
    const enJuego: Candidato[] = [];
    const techo = nivel.tope * 3;
    for (const c of candidatos) {
      if (enJuego.length >= techo) break;
      if (c.pcode === pcodeAbierto) continue; // va aparte, en cabeza
      if (nivel.soloCapitales && !c.capital) continue;
      if (c.poblacion < nivel.minPoblacion) continue;

      const ancla = anclaDe(c);
      if (!ancla) continue;
      if (ancla[0] < oeste || ancla[0] > este || ancla[1] < sur || ancla[1] > norte) continue;

      enJuego.push(c);
    }

    const abierto = pcodeAbierto ? porPcode.get(pcodeAbierto) : undefined;
    if (abierto) enJuego.unshift(abierto);

    // 2. Fase de lectura: los rectángulos de los paneles y el del contenedor, una sola vez.
    const { rects: ocupados, ancho: anchoMapa, alto: altoMapa } = obstaculos();

    // 3. Fase de decisión: aritmética, sin DOM. `project()` es una multiplicación de
    //    matrices.
    const aceptados: Candidato[] = [];
    for (const c of enJuego) {
      if (aceptados.length >= nivel.tope) break;

      const suNivel = nivelDe(c);
      const ancla =
        c.pcode === pcodeAbierto && puntoAbierto ? puntoAbierto : anclaDe(c);
      if (!ancla) continue;

      medir(c, suNivel);
      const punto = mapa.project(ancla);
      const rect: Rect = {
        x: punto.x - c.ancho / 2,
        y: punto.y - c.alto / 2,
        ancho: c.ancho,
        alto: c.alto,
      };

      /**
       * El rectángulo entero tiene que caber en el contenedor, no solo el ancla.
       *
       * Comprobar el ancla contra `getBounds()` **no basta**: un ancla justo dentro del
       * borde deja el nombre medio fuera del mapa, y lo de fuera se ve recortado o pisando
       * lo que haya al lado. Salió midiendo, no razonando: con Cali abierta, «Candelaria»
       * tenía el ancla dentro y la caja fuera.
       */
      if (
        rect.x < 0 ||
        rect.y < 0 ||
        rect.x + rect.ancho > anchoMapa ||
        rect.y + rect.alto > altoMapa
      ) {
        continue;
      }

      if (ocupados.some((o) => chocan(rect, o))) continue;

      ocupados.push(rect);
      aceptados.push(c);
      c.el ??= elementoDe(c);
      c.el.dataset['nivel'] = suNivel;
    }

    // 4. Fase de escritura.
    const aceptadosSet = new Set(aceptados);
    for (const c of candidatos) {
      if (aceptadosSet.has(c)) {
        const ancla =
          c.pcode === pcodeAbierto && puntoAbierto ? puntoAbierto : anclaDe(c);
        if (!ancla) continue;
        elementoDe(c);
        c.marcador?.setLngLat(ancla);
        // `addTo()` llama a `remove()` por dentro, así que llamarlo sobre un marcador ya
        // puesto lo re-inserta y reinicia la animación de entrada.
        if (!c.puesta) {
          c.marcador?.addTo(mapa);
          c.puesta = true;
        }
      } else if (c.puesta) {
        // Se quita en vez de esconderse con `display:none`: un marcador puesto proyecta y
        // escribe un `transform` **por fotograma**, así que dejar puestos los descartados
        // haría que el coste por fotograma creciera con todo lo que se haya visto alguna
        // vez. `remove()` desengancha sus escuchas.
        c.marcador?.remove();
        c.puesta = false;
      }
    }
  }

  function programar(): void {
    if (pedido) return;
    pedido = requestAnimationFrame(() => {
      pedido = 0;
      colocar();
    });
  }

  function apagar(): void {
    apagadas = true;
    for (const c of candidatos) {
      if (c.puesta) {
        c.marcador?.remove();
        c.puesta = false;
      }
    }
  }

  function fijarAbierto(pcode: string | null, punto?: [number, number]): void {
    pcodeAbierto = pcode;
    puntoAbierto = punto;
  }

  // `moveend` y no `render`: recolocar por fotograma fundiría un teléfono modesto. Durante
  // el gesto los marcadores ya siguen a la cámara solos; lo que hay que recalcular es el
  // *conjunto*, y eso solo cambia cuando la cámara se detiene.
  mapa.on('moveend', () => {
    apagadas = false;
    programar();
  });

  return {
    programar: () => {
      apagadas = false;
      programar();
    },
    apagar,
    fijarAbierto,
  };
}
