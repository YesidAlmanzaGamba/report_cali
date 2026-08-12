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
  const puntos = [...carrusel.querySelectorAll<HTMLButtonElement>('[data-carrusel-punto]')];
  const anterior = carrusel.querySelector<HTMLButtonElement>('[data-carrusel-prev]');
  const siguiente = carrusel.querySelector<HTMLButtonElement>('[data-carrusel-next]');
  if (!pista || slides.length < 2) return;

  const indiceActual = (): number =>
    Math.round(pista.scrollLeft / pista.clientWidth);

  function irA(indice: number): void {
    const objetivo = Math.min(slides.length - 1, Math.max(0, indice));
    pista!.scrollTo({
      left: objetivo * pista!.clientWidth,
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
  }

  puntos.forEach((punto, i) => punto.addEventListener('click', () => irA(i)));
  anterior?.addEventListener('click', () => irA(indiceActual() - 1));
  siguiente?.addEventListener('click', () => irA(indiceActual() + 1));

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

  sincronizar();
}

export function iniciarCarruseles(): void {
  for (const carrusel of document.querySelectorAll<HTMLElement>('[data-carrusel]')) {
    iniciarUno(carrusel);
  }
}
