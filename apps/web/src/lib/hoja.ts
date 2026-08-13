/**
 * Interacción de la hoja inferior.
 *
 * Presupuesto: pequeño. Es lo único que se descarga antes del mapa, y el mapa ya pesa
 * lo suyo. Sin dependencias, sin framework.
 */

const ESTADOS = ['asomada', 'media', 'completa'] as const;
type Estado = (typeof ESTADOS)[number];

/** Píxeles de arrastre a partir de los cuales se considera gesto y no toque. */
const UMBRAL_GESTO = 8;

/**
 * Recoge la hoja a «asomada» desde fuera de este módulo.
 *
 * `mapa.ts` necesita recogerla cuando el mapa vuela a un municipio tocado desde la
 * tabla, para que la hoja no se quede tapándolo. Antes lo hacía escribiendo directo en
 * `hoja.dataset.estado`, sin limpiar un `style.transform` que pudiera haber quedado de
 * un arrastre — y el inline gana siempre sobre la regla CSS de `[data-estado]`, así que
 * la hoja se quedaba donde estaba. Esta función replica exactamente lo que hace
 * `fijar('asomada')` puertas adentro, como función de módulo independiente: no se
 * acopla al closure de `iniciarHoja()`, que puede no existir todavía cuando el mapa
 * (cargado aparte, más tarde) la necesita.
 */
export function colapsarHoja(): void {
  const hoja = document.getElementById('hoja');
  const asa = hoja?.querySelector<HTMLButtonElement>('.asa');
  if (!hoja || !asa) return;

  hoja.dataset['estado'] = 'asomada';
  hoja.style.transform = '';
  asa.setAttribute('aria-expanded', 'false');
}

export function iniciarHoja(): void {
  const hoja = document.getElementById('hoja');
  const asa = hoja?.querySelector<HTMLButtonElement>('.asa');
  if (!hoja || !asa) return;

  const alto = () => hoja.getBoundingClientRect().height;
  const asomadaPx = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--asomada')) * 16 || 104;

  const desplazamiento = (estado: Estado): number => {
    if (estado === 'completa') return 0;
    if (estado === 'media') return alto() * 0.45;
    return alto() - asomadaPx();
  };

  const estadoActual = (): Estado => (hoja.dataset['estado'] as Estado) ?? 'asomada';

  function fijar(estado: Estado): void {
    hoja!.dataset['estado'] = estado;
    hoja!.style.transform = '';
    asa!.setAttribute('aria-expanded', estado === 'asomada' ? 'false' : 'true');
  }

  // ── Toque: alterna entre asomada y completa ───────────────────────────────
  // Dos estados al tocar y tres al arrastrar. Un toque debería tener un resultado
  // predecible; el estado intermedio se alcanza con el gesto, que es donde la persona
  // ya está eligiendo una posición.
  asa.addEventListener('click', (e) => {
    if (arrastro) {
      // El click que sigue a un arrastre no debe además alternar el estado.
      e.preventDefault();
      arrastro = false;
      return;
    }
    fijar(estadoActual() === 'asomada' ? 'completa' : 'asomada');
  });

  // ── Arrastre ──────────────────────────────────────────────────────────────
  let inicioY = 0;
  let baseOffset = 0;
  let arrastro = false;

  asa.addEventListener('pointerdown', (e) => {
    inicioY = e.clientY;
    baseOffset = desplazamiento(estadoActual());
    arrastro = false;
    asa.setPointerCapture(e.pointerId);
  });

  asa.addEventListener('pointermove', (e) => {
    if (!asa.hasPointerCapture(e.pointerId)) return;

    const dy = e.clientY - inicioY;
    if (!arrastro && Math.abs(dy) < UMBRAL_GESTO) return;

    arrastro = true;
    hoja.dataset['arrastrando'] = '';

    const maximo = alto() - asomadaPx();
    const offset = Math.min(maximo, Math.max(0, baseOffset + dy));
    hoja.style.transform = `translateY(${offset}px)`;
  });

  function soltar(e: PointerEvent): void {
    if (!asa!.hasPointerCapture(e.pointerId)) return;
    asa!.releasePointerCapture(e.pointerId);
    delete hoja!.dataset['arrastrando'];

    if (!arrastro) return;

    // Se ancla al estado más cercano a donde quedó el dedo.
    const offset = baseOffset + (e.clientY - inicioY);
    const cercano = ESTADOS.reduce((mejor, estado) =>
      Math.abs(desplazamiento(estado) - offset) < Math.abs(desplazamiento(mejor) - offset)
        ? estado
        : mejor,
    );

    fijar(cercano);
  }

  asa.addEventListener('pointerup', soltar);
  asa.addEventListener('pointercancel', soltar);

  // ── Módulos ───────────────────────────────────────────────────────────────
  const pestanas = [...hoja.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const paneles = [...hoja.querySelectorAll<HTMLElement>('[role="tabpanel"]')];

  function activar(id: string, moverFoco = false): void {
    for (const p of pestanas) {
      const activa = p.dataset['modulo'] === id;
      p.setAttribute('aria-selected', activa ? 'true' : 'false');
      p.tabIndex = activa ? 0 : -1;
      if (activa && moverFoco) p.focus();
    }

    for (const panel of paneles) {
      if (panel.dataset['modulo'] === id) panel.setAttribute('data-activo', '');
      else panel.removeAttribute('data-activo');
    }

    // Al cambiar de módulo se vuelve arriba: quedarse a media altura del anterior
    // desorienta.
    hoja?.querySelector('.modulos')?.scrollTo({ top: 0 });
  }

  for (const pestana of pestanas) {
    pestana.addEventListener('click', () => {
      const id = pestana.dataset['modulo'];
      if (id) activar(id);
      if (estadoActual() === 'asomada') fijar('completa');
    });
  }

  // Flechas entre pestañas, como espera un lector de pantalla en un `tablist`.
  hoja.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
    const evento = e as KeyboardEvent;
    const paso = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (paso === 0) return;

    evento.preventDefault();
    const actual = pestanas.findIndex((p) => p.getAttribute('aria-selected') === 'true');
    const siguiente = pestanas[(actual + paso + pestanas.length) % pestanas.length];
    if (siguiente?.dataset['modulo']) activar(siguiente.dataset['modulo'], true);
  });

  // ── Atajos y enlaces externos ─────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && estadoActual() !== 'asomada') fijar('asomada');
  });

  /**
   * Enlaces que abren la hoja en un módulo concreto — el botón «¿Buscas a un familiar?»
   * del encabezado es el caso principal. Sin JavaScript son anclas normales que bajan
   * a la sección, así que el enlace sirve igual.
   *
   * Los propios paneles (`role="tabpanel"`) también llevan `data-modulo`, y sin excluirlos
   * aquí quedaban enganchados a este mismo bucle: un clic dentro del panel «Municipios»
   * —por ejemplo, una fila de la tabla— burbujea hasta el panel, dispara este handler y
   * fuerza `fijar('completa')`, deshaciendo cualquier `colapsarHoja()` que acabara de
   * correr. Era la causa real de que la hoja no se recogiera al tocar una fila (ronda 2,
   * tarea 3) — no un problema de límites entre módulos, sino este bucle atrapando clics
   * que no eran suyos.
   */
  for (const enlace of document.querySelectorAll<HTMLElement>('[data-modulo]')) {
    const rol = enlace.getAttribute('role');
    if (rol === 'tab' || rol === 'tabpanel') continue;

    enlace.addEventListener('click', (e) => {
      const id = enlace.dataset['modulo'];
      if (!id || !paneles.some((p) => p.dataset['modulo'] === id)) return;

      e.preventDefault();
      activar(id);
      fijar('completa');
    });
  }

  // El alto de la hoja se mide en píxeles al arrastrar; si la ventana cambia de
  // tamaño, esos píxeles ya no corresponden al anclaje.
  window.addEventListener('resize', () => fijar(estadoActual()));

  recorrerTira();
}

/**
 * La tira de cifras nacionales avanza sola, en bucle.
 *
 * Es la única franja que se ve sin desplegar la hoja, y no cabe entera: sin movimiento,
 * las últimas cifras —heridos, colapsos— no existían para quien no supiera que se puede
 * deslizar ahí.
 *
 * Se detiene al primer gesto y no vuelve. Quien está mirando una cifra concreta no
 * quiere que se le mueva: en el momento en que alguien toca, el automatismo ha dejado
 * de ser útil y pasa a estorbar.
 */
function recorrerTira(): void {
  const tira = document.getElementById('tiras');
  if (!tira) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const originales = [...tira.children] as HTMLElement[];
  if (originales.length === 0) return;

  /**
   * Se duplican las cifras para que el bucle no tenga costura.
   *
   * La versión anterior saltaba de una cifra a la siguiente cada 3,2 s con
   * `scrollTo({behavior:'smooth'})`, y al llegar al final volvía al principio de golpe.
   * Eso es exactamente lo que se siente «a pasos»: cinco tirones y un salto. Con la
   * lista repetida se puede desplazar de forma continua y, al pasar de la primera
   * copia, devolver el scroll al principio sin animación — la segunda copia está en el
   * mismo sitio, así que el ojo no ve el corte.
   */
  for (const nodo of originales) {
    const copia = nodo.cloneNode(true) as HTMLElement;
    copia.setAttribute('aria-hidden', 'true');
    tira.append(copia);
  }

  const marco = document.getElementById('tiras-marco');
  if (!marco) return;

  const VELOCIDAD = 16; // px por segundo; a esta escala se lee sin marear

  /** La animación es en `%`, así que la duración es lo que fija la velocidad real. */
  const acompasar = (): void => {
    const unaVuelta = tira.scrollWidth / 2;
    if (unaVuelta <= marco.clientWidth) {
      // Cabe entero: no hay nada que desfilar.
      tira.removeAttribute('data-desfile');
      return;
    }
    tira.style.setProperty('--desfile-duracion', `${Math.round(unaVuelta / VELOCIDAD)}s`);
    tira.setAttribute('data-desfile', '');
  };

  acompasar();
  // Las fuentes pueden llegar tarde y cambiar el ancho; entonces la duración calculada
  // ya no corresponde a 16 px/s.
  if ('ResizeObserver' in window) new ResizeObserver(acompasar).observe(tira);

  const detener = (): void => {
    tira.removeAttribute('data-desfile');
    tira.style.removeProperty('--desfile-duracion');
    // Se quitan las copias: si alguien va a desplazar a mano, que no vea cada cifra dos
    // veces.
    for (const nodo of [...tira.children].slice(originales.length)) nodo.remove();
  };

  for (const evento of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) {
    marco.addEventListener(evento, detener, { passive: true, once: true });
  }
}
