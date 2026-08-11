import { defineConfig } from 'astro/config';

/**
 * El sitio se publica en dos orígenes con forma distinta:
 *
 *   Cloudflare Pages  →  raíz del dominio        →  base '/'
 *   GitHub Pages      →  /report_cali/ (espejo)  →  base '/report_cali/'
 *
 * Sin `base` correcto, el espejo carga el HTML pero ningún dato: las rutas absolutas
 * apuntarían a la raíz del dominio de GitHub, donde no hay nada.
 */
const base = process.env['PUBLIC_BASE'] ?? '/';
const site = process.env['PUBLIC_SITE'] ?? 'https://report-cali.pages.dev';

export default defineConfig({
  site,
  base,
  // Sitio 100 % estático: se sirve desde CDN sin base de datos en la ruta de
  // lectura (ADR-004). Un sitio de desastre recibe su pico de tráfico justo
  // cuando más importa.
  output: 'static',
  build: {
    // 'auto', no 'always': con 'always' la hoja de MapLibre (~40 KB) se incrustaba en
    // el HTML y entraba en la carga inicial, que es justo lo que la carga diferida del
    // mapa intenta evitar. Así solo se incrusta el CSS propio de la página, que es
    // pequeño, y el de MapLibre viaja con su trozo diferido.
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      // Los socorristas entran desde un celular con 3G malo. Vale la pena el
      // tiempo extra de compresión con tal de mandar menos bytes.
      cssMinify: 'lightningcss',
      chunkSizeWarningLimit: 900,
    },
  },
});
