/**
 * Carga diferida del mapa.
 *
 * El mapa interactivo pesa ~570 KB comprimidos (MapLibre GL más la geometría de los
 * 1.122 municipios). Sobre un 3G malo —que es la conexión real de un socorrista en zona
 * de desastre— eso son unos 10 segundos.
 *
 * El resto de la página pesa 6 KB y ya trae la tabla y el resumen renderizados, así que
 * la información útil llega de inmediato. Por eso el mapa no se descarga solo:
 *
 *   · conexión buena  → se carga al acercarse a la vista, sin pedir nada;
 *   · conexión lenta o «ahorro de datos» → se pide confirmación primero, con el costo
 *     escrito, para que quien está racionando megas decida.
 */
const PESO_APROX = '≈570 KB';

interface ConexionDegradada {
  saveData?: boolean;
  effectiveType?: string;
}

/** ¿Conviene preguntar antes de gastarle los datos a alguien? */
function conexionLimitada(): boolean {
  const conexion = (navigator as Navigator & { connection?: ConexionDegradada }).connection;
  if (!conexion) return false;
  if (conexion.saveData) return true;

  return conexion.effectiveType === 'slow-2g' || conexion.effectiveType === '2g' || conexion.effectiveType === '3g';
}

async function arrancar(contenedor: HTMLElement): Promise<void> {
  contenedor.innerHTML = '<p class="mapa-estado">Cargando mapa…</p>';
  try {
    const { iniciarMapa } = await import('./mapa');
    contenedor.innerHTML = '';
    await iniciarMapa();
  } catch (error) {
    contenedor.innerHTML =
      '<p class="mapa-estado">No se pudo cargar el mapa. La información está en la tabla de abajo.</p>';
    console.error(error);
  }
}

function pedirConfirmacion(contenedor: HTMLElement): void {
  contenedor.innerHTML = `
    <div class="mapa-oferta">
      <p><strong>Mapa interactivo</strong></p>
      <p class="mapa-oferta-nota">
        Detectamos una conexión lenta o el ahorro de datos activado.
        Cargar el mapa descarga ${PESO_APROX}.
        Los mismos datos están en la tabla de abajo, sin costo adicional.
      </p>
      <button type="button" class="mapa-boton">Cargar el mapa (${PESO_APROX})</button>
    </div>`;

  contenedor.querySelector('button')?.addEventListener('click', () => void arrancar(contenedor));
}

export function prepararMapa(): void {
  const contenedor = document.getElementById('mapa');
  if (!contenedor) return;

  if (conexionLimitada()) {
    pedirConfirmacion(contenedor);
    return;
  }

  // Conexión razonable: se carga al asomarse a la vista, para no competir con el
  // renderizado inicial de la página.
  if (!('IntersectionObserver' in window)) {
    void arrancar(contenedor);
    return;
  }

  const observador = new IntersectionObserver(
    (entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      observador.disconnect();
      void arrancar(contenedor);
    },
    { rootMargin: '200px' },
  );

  observador.observe(contenedor);
}
