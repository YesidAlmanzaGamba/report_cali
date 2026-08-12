/**
 * Carrusel de la ficha de municipio (Impacto · Ayuda cercana).
 *
 * Sin física de arrastre propia: el desplazamiento táctil lo da gratis
 * `scroll-snap` (ver estilos de `.carrusel-pista` en `Mapa.astro`). Este módulo solo
 * sincroniza los puntos y los botones prev/next con la posición real del scroll, y
 * sirve de mejora — sin él, con `overflow-x:auto` a secas, el gesto de deslizar ya
 * funciona igual.
 */

const prefiereMenosMovimiento = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function iniciarUno(carrusel: HTMLElement): void {
  const pista = carrusel.querySelector<HTMLElement>('[data-carrusel-pista]');
  const slides = [...carrusel.querySelectorAll<HTMLElement>('[data-carrusel-slide]')];
  if (!pista || slides.length < 2) return;

  /**
   * Los controles no tienen por qué vivir dentro del carrusel.
   *
   * En la ficha del municipio están arriba, en la cabecera fija, para que se vean sin
   * desplazarse: es la única forma de que «Ayuda cercana» —la línea 123 y el WhatsApp de
   * la Cruz Roja— no quede escondida detrás de un gesto lateral bajo el pliegue. El
   * ámbito lo marca `[data-carrusel-ambito]`; si no hay ninguno, se busca dentro del
   * propio carrusel como antes.
   */
  const ambito = carrusel.closest<HTMLElement>('[data-carrusel-ambito]') ?? carrusel;
  const puntos = [...ambito.querySelectorAll<HTMLButtonElement>('[data-carrusel-punto]')];
  const anterior = ambito.querySelector<HTMLButtonElement>('[data-carrusel-prev]');
  const siguiente = ambito.querySelector<HTMLButtonElement>('[data-carrusel-next]');
  const etiqueta = ambito.querySelector<HTMLElement>('[data-carrusel-etiqueta]');

  /**
   * `clientWidth` es 0 mientras el carrusel está oculto — la ficha del municipio arranca
   * con `hidden`, y `iniciarCarruseles()` corre al cargar la página—, así que sin este
   * guardia la división da `NaN`: los botones nunca se desactivaban y el rótulo de la
   * cara salía vacío. Con 0 de ancho, la cara es la primera.
   */
  const indiceActual = (): number =>
    pista.clientWidth > 0 ? Math.round(pista.scrollLeft / pista.clientWidth) : 0;

  function irA(indice: number): void {
    const objetivo = Math.min(slides.length - 1, Math.max(0, indice));
    pista!.scrollTo({
      left: objetivo * pista!.clientWidth,
      behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth',
    });
  }

  /**
   * Trae el carrusel a la vista al cambiar de cara desde los controles de arriba.
   * Sin esto, tocar «›» en la cabecera cambia algo que puede estar fuera de pantalla:
   * la persona toca y no pasa nada visible.
   */
  function acercarCarrusel(): void {
    carrusel.scrollIntoView({
      block: 'nearest',
      behavior: prefiereMenosMovimiento() ? 'auto' : 'smooth',
    });
  }

  function sincronizar(): void {
    const indice = indiceActual();
    for (const [i, punto] of puntos.entries()) {
      punto.setAttribute('aria-current', i === indice ? 'true' : 'false');
    }
    if (anterior) anterior.disabled = indice === 0;
    if (siguiente) siguiente.disabled = indice === slides.length - 1;

    // El nombre de la cara dice a dónde llevan las flechas — más de lo que decía un
    // punto relleno. Sale del `aria-label` del slide, así que no hay una segunda lista
    // de rótulos que se pueda desincronizar del marcado.
    if (etiqueta) etiqueta.textContent = slides[indice]?.getAttribute('aria-label') ?? '';
  }

  puntos.forEach((punto, i) =>
    punto.addEventListener('click', () => {
      irA(i);
      acercarCarrusel();
    }),
  );
  anterior?.addEventListener('click', () => {
    irA(indiceActual() - 1);
    acercarCarrusel();
  });
  siguiente?.addEventListener('click', () => {
    irA(indiceActual() + 1);
    acercarCarrusel();
  });

  // El scroll dispara muchos eventos por gesto; solo interesa el estado al final de
  // cada fotograma, no cada píxel.
  let pendiente = false;
  pista.addEventListener('scroll', () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      sincronizar();
      pendiente = false;
    });
  });

  // Al rotar el celular `clientWidth` cambia, así que el scroll en píxeles ya no
  // corresponde a una diapositiva completa. Se reancla sin animación.
  window.addEventListener('resize', () => {
    pista.scrollTo({ left: indiceActual() * pista.clientWidth, behavior: 'auto' });
  });

  // Cuando la ficha se destapa, la pista pasa de 0 px de ancho a su ancho real: es el
  // momento en que las cuentas empiezan a valer algo, y nadie ha desplazado nada todavía
  // que dispare `sincronizar()`.
  if ('ResizeObserver' in window) {
    new ResizeObserver(sincronizar).observe(pista);
  }

  sincronizar();
}

export function iniciarCarruseles(): void {
  for (const carrusel of document.querySelectorAll<HTMLElement>('[data-carrusel]')) {
    iniciarUno(carrusel);
  }
}
