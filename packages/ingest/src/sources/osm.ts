/**
 * Consulta a OpenStreetMap para ubicar sedes de ayuda. Las revisiones viven en
 * `../geocodificar.ts`; aquí solo está la parte que toca la red.
 *
 * ## Una sola fuente, y esa decisión se midió
 *
 * Se llegó a montar una segunda consulta contra Overpass —la base cruda de OSM— para
 * detectar homónimos. Se quitó por dos razones, en este orden:
 *
 * 1. **No aguanta.** Buscar por expresión regular en toda una ciudad devolvió `504` en un
 *    espejo y se pasó de 130 s en el otro; una consulta que sí respondió tardó 89 s. Eso
 *    no se puede poner en un cron cada 30 minutos.
 * 2. **No hacía falta.** El error que iba a atrapar —publicar la Ciudadela del Petronio a
 *    2 km— lo atrapa igual `nombreCoincide`, que no cuesta ninguna consulta.
 *
 * Queda Nominatim, que entiende «Estadio El Campín, Bogotá» y devuelve `place_rank`, con
 * el que se distingue un edificio de una calle.
 *
 * ## Se guarda en caché, y tampoco es por gusto
 *
 * El cron corre cada 30 minutos. Sin caché, cada corrida repetiría las mismas consultas
 * para siempre: son servicios gratuitos y con política de uso explícita, y eso sería
 * abusar de ellos. Un nombre ya resuelto no cambia de sitio, así que se resuelve una vez
 * y queda escrito. La caché es un archivo versionado — el historial también sirve para
 * ver cuándo se resolvió cada cosa.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  desdeNominatim,
  evaluar,
  type Candidato,
  type Veredicto,
} from '../geocodificar.js';
import { DATA_DIR } from '../paths.js';

/**
 * Nominatim exige identificarse con algo que permita contactar al responsable. Un
 * `User-Agent` genérico es motivo de bloqueo, y con razón.
 */
const UA = 'report-cali/0.1 (mapa de situacion terremoto Colombia; github.com/YesidAlmanzaGamba/report_cali)';

/** Su política pide un máximo de una consulta por segundo. Se deja margen. */
const PAUSA_MS = 1200;

/**
 * Cuántos nombres nuevos se resuelven por corrida.
 *
 * Con caché, lo normal es que una corrida no resuelva ninguno. El tope está para el día
 * que entren cincuenta titulares nuevos de golpe: mejor repartirlos en varias corridas
 * que soltarle una ráfaga a un servicio gratuito.
 *
 * Tres por corrida deja el paso en unos pocos segundos, y como el cron corre cada 30
 * minutos, una ráfaga de titulares se absorbe igual en un par de horas sin retrasar la
 * publicación del resto de los datos.
 */
const MAX_POR_CORRIDA = 3;

const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const CACHE_PATH = 'ayuda/geocodificados';

export interface EntradaCache extends Veredicto {
  consultado_en: string;
}

export type Cache = Record<string, EntradaCache>;

export async function leerCache(): Promise<Cache> {
  try {
    const crudo = await readFile(resolve(DATA_DIR, `${CACHE_PATH}.json`), 'utf8');
    const parsed: unknown = JSON.parse(crudo);
    return (parsed as { entradas?: Cache }).entradas ?? {};
  } catch {
    return {};
  }
}

async function pedir(url: string, cuerpo?: string, msEspera = 30_000): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    ...(cuerpo === undefined ? {} : { method: 'POST', body: cuerpo }),
    signal: AbortSignal.timeout(msEspera),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function nominatim(consulta: string): Promise<Candidato[]> {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format', 'json');
  u.searchParams.set('limit', '5');
  u.searchParams.set('countrycodes', 'co');
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('q', consulta);
  return desdeNominatim(await pedir(u.toString()));
}

export interface Pendiente {
  nombre: string;
  municipio: string;
  dentroDelMunicipio: (lon: number, lat: number) => boolean;
}

export interface ResultadoGeocodificacion {
  cache: Cache;
  resueltos: number;
  omitidos: number;
}

/**
 * Resuelve los nombres que aún no estén en caché, hasta el tope de la corrida.
 *
 * Un fallo de red **no tumba nada**: queda registrado como `sin_resultado` sin escribirse
 * en caché, así que la siguiente corrida lo reintenta. Lo que nunca pasa es que un error
 * de red se convierta en una coordenada.
 */
export async function geocodificarPendientes(
  pendientes: Pendiente[],
  cache: Cache,
): Promise<ResultadoGeocodificacion> {
  const nuevos = pendientes.filter((p) => cache[p.nombre] === undefined);
  const aResolver = nuevos.slice(0, MAX_POR_CORRIDA);
  let resueltos = 0;

  for (const p of aResolver) {
    try {
      const candidatos = await nominatim(`${p.nombre}, ${p.municipio}, Colombia`);
      await espera(PAUSA_MS);

      const v = evaluar(p.nombre, candidatos, p.dentroDelMunicipio);
      cache[p.nombre] = { ...v, consultado_en: new Date().toISOString() };
      resueltos += 1;
    } catch (error) {
      // Sin escribir en caché: que se reintente. Un 429 o un timeout no es un veredicto.
      console.error(`  · geocodificación de «${p.nombre}» falló: ${(error as Error).message}`);
    }
  }

  return { cache, resueltos, omitidos: Math.max(0, nuevos.length - aResolver.length) };
}
