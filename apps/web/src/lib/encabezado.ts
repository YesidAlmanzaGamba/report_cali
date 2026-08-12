/**
 * Ocultar/mostrar el encabezado durante la interacción con el mapa.
 *
 * Vive aparte de `Encabezado.astro` (que no sabe nada del mapa) porque quien decide
 * cuándo ocultarlo es `mapa.ts`, al escuchar los eventos de MapLibre — mismo patrón que
 * `colapsarHoja()` en `hoja.ts`: una función exportada en vez de que otro módulo le
 * toque el DOM a mano.
 */
export function ocultarEncabezado(): void {
  document.querySelector('.encabezado')?.setAttribute('data-oculto', '');
}

export function mostrarEncabezado(): void {
  document.querySelector('.encabezado')?.removeAttribute('data-oculto');
}
