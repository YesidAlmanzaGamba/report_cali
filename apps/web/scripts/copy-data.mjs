/**
 * Copia `data/` a `apps/web/public/data/` antes de compilar o servir.
 *
 * El sitio consume los datos por fetch en tiempo de ejecución y no los empaqueta en el
 * JavaScript: así el HTML llega y se pinta de inmediato, y la geometría —que es lo
 * pesado— se descarga aparte y la cachea el navegador entre visitas.
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../data');
const target = resolve(here, '../public/data');

await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

console.log(`· data/ copiado a ${target}`);
