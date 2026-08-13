/**
 * Alcaldías: el boletín oficial de cada municipio, por la API que ya tienen todos.
 *
 * ## El hallazgo
 *
 * Los sitios `www.<municipio>-<departamento>.gov.co` devuelven a `curl` una cáscara de
 * 2.905 bytes titulada «Territoriales»: son aplicaciones Angular. Por eso el rastreo por
 * HTML no encontraba nada y el patrón `/rss` no se generalizaba — no hay HTML que leer.
 *
 * Mirando qué pide el navegador aparece la respuesta: **todos cuelgan de una misma
 * plataforma del MinTIC, MiColombiaDigital, con una API REST pública por municipio.**
 *
 * ```
 * https://<alias>.micolombiadigital.gov.co/api/v1/contents?orderBy=recent&pageSize=25
 * https://<alias>.micolombiadigital.gov.co/api/v1/contents/<contentID>   ← cuerpo completo
 * ```
 *
 * El `alias` se deriva del nombre: `Roldanillo` + `Valle del Cauca` →
 * `roldanillovalledelcauca` (sin tildes, sin espacios, en minúscula).
 *
 * ## Por qué importa tanto
 *
 * `data/fuentes/cobertura.json` medía el techo del mapa: de 228 municipios golpeados,
 * **179 no tenían ni una sola nota de prensa**. Esta fuente ataca justo ese hueco. Medido
 * sobre los 440 municipios con MMI ≥ 5:
 *
 * | | |
 * |---|---|
 * | en la plataforma | **317** |
 * | publicaron algo desde el sismo | **207** |
 * | publicaciones recogidas | **1.127** |
 * | hablan del sismo | 203, en **98 municipios** |
 * | **municipios que antes no tenían ninguna fuente** | **54** |
 *
 * Y la distribución es complementaria a la prensa, no redundante: los que fallan son las
 * ciudades grandes —Manizales, Pereira, Armenia, Buenaventura, Quibdó— que tienen sitio
 * propio *y* cobertura de prensa. Los que responden son los municipios pequeños, que es
 * exactamente donde no llegaba nadie.
 *
 * Lo que aparece ahí no es relleno. Medio San Juan (Chocó, MMI 7) publicó un EDAN con
 * «3 viviendas totalmente destruidas, 15 parcialmente destruidas e inhabitables,
 * afectaciones en la farmacia del Hospital»; Lloró, 140 viviendas afectadas; Bagadó, 240
 * familias. Son municipios a un paso del epicentro sobre los que no había absolutamente
 * nada.
 *
 * ## Dos cosas que este módulo NO hace, y ninguna es descuido
 *
 * 1. **No publica cifras.** Igual que `prensa-regional.ts` (ver su cabecera): sacar
 *    números de prosa con patrones confunde totales con parciales. Aquí sí se *proponen*
 *    —son actos oficiales, no rumores— pero van a un archivo de sugerencias para que una
 *    persona las registre en `curated/observaciones.json`. La máquina rastrea, la persona
 *    registra.
 *
 * 2. **No ingiere notificaciones personales.** Esta es la trampa seria de esta fuente y
 *    es una violación directa de ADR-001. Entre las 1.127 publicaciones hay **55 avisos
 *    administrativos con nombre propio**: «Aviso de Publicación de Edicto - Pedro Chala
 *    Calderón», «NOTIFICACION POR AVISO COBRO PERSUASIVO». Son notificaciones a personas
 *    concretas por multas y cobros — nada que ver con el sismo, y datos personales de
 *    ciudadanos identificables. `esAvisoPersonal()` los descarta antes de nada más.
 */
import { fetchWithRetry, USER_AGENT } from '../http.js';
import type { MunicipioRef } from './noticias.js';

const BASE = 'micolombiadigital.gov.co';

/** Publicaciones a pedir por municipio. 25 cubre de sobra los días desde el sismo. */
const POR_MUNICIPIO = 25;

export interface PublicacionAlcaldia {
  pcode: string;
  municipio: string;
  departamento: string;
  alias: string;
  titulo: string;
  /** Acto administrativo (`Document`), nota (`Article`), evento (`Event`)… */
  tipo: string;
  url: string;
  publicado: string;
  resumen: string;
  /** Solo si se pidió el cuerpo completo. */
  texto?: string;
}

/** Una cifra vista en el texto. **Propuesta, no publicada.** */
export interface CifraPropuesta {
  pcode: string;
  municipio: string;
  valor: number;
  /** La unidad tal como la escribe el municipio: «viviendas», «familias»… */
  unidad: string;
  /** La frase de la que sale, para que quien revise juzgue sin abrir el enlace. */
  frase: string;
  url: string;
  publicado: string;
}

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const babel = (s: string) => sinTildes(s).replace(/[^a-z0-9]/g, '');

/**
 * Formas de alias observadas, en orden de acierto. La primera resuelve la gran mayoría;
 * las otras tres recuperan un puñado y cuestan una petición fallida cada una.
 */
export function aliasCandidatos(nombre: string, departamento: string): string[] {
  const n = babel(nombre);
  const d = babel(departamento);
  const corto = d.replace(/^valledelcauca$/, 'valle').replace(/^nortedesantander$/, 'nsantander');
  return [...new Set([n + d, n, n + corto, `alcaldia${n}`])];
}

/**
 * URL pública citable. La forma con alias **redirige** al dominio oficial del municipio
 * (comprobado en el navegador: `lavictoriavalledelcauca.micolombiadigital.gov.co/noticias/…`
 * termina en `www.lavictoria-valle.gov.co/noticias/…` con la nota renderizada). Se usa
 * esta porque es la única derivable: el dominio propio no se deduce del nombre.
 */
export const urlPublica = (alias: string, slug: string) => `https://${alias}.${BASE}/noticias/${slug}`;

/**
 * ADR-001. Actos administrativos que notifican a UNA persona: traen nombre completo y a
 * veces cédula. Nunca entran, ni siquiera como enlace.
 */
export function esAvisoPersonal(texto: string): boolean {
  return /notificaci[oó]n\s+por\s+aviso|aviso\s+de\s+notificaci|aviso\s+de\s+publicaci[oó]n\s+de\s+edicto|cobro\s+persuasivo|cobro\s+coactivo|mandamiento(s)?\s+de\s+pago|emplazamiento|citaci[oó]n\s+para\s+notificaci|\bedicto\b/i.test(
    texto,
  );
}

/** ¿Habla del sismo? Estos son boletines generales: traen ferias y contratación. */
export function hablaDelSismo(texto: string): boolean {
  return /sismo|terremoto|calamidad|temblor|damnificad|afectacio|emergencia|r[eé]plica|colaps|edan|gesti[oó]n del riesgo/i.test(
    texto,
  );
}

/** El cuerpo llega como HTML de editor. Se quiere texto plano legible. */
export function limpiarHtml(html: string): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Unidades que se aceptan. Deliberadamente **no** incluye fallecidos ni heridos: esas dos
 * se registran solo desde boletín oficial de la UNGRD o de la gobernación, a mano. Una
 * cifra de muertos mal extraída de prosa hace daño real y no la arregla una corrección
 * posterior.
 */
const UNIDADES =
  /(viviendas?|casas?|predios?|inmuebles?|familias?|personas\s+damnificadas|hogares?|albergues?|sedes?\s+educativas?|instituciones\s+educativas?)/i;

/**
 * En español el punto es separador de miles: «1.000 viviendas» son mil, no cero.
 * Sin esto la extracción devolvía «000».
 */
function aNumero(bruto: string): number | undefined {
  const limpio = bruto.replace(/\.(?=\d{3}\b)/g, '').replace(/\s/g, '');
  const n = Number.parseInt(limpio, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Cifras candidatas. **Propuestas, no observaciones**: van a un archivo de revisión.
 *
 * Se descartan las que van pegadas a una fecha («10 de agosto»), que es el falso positivo
 * más frecuente en estos textos.
 */
export function cifrasDe(texto: string): Omit<CifraPropuesta, 'pcode' | 'municipio' | 'url' | 'publicado'>[] {
  const fuera: ReturnType<typeof cifrasDe> = [];
  const re = new RegExp(`(\\d{1,3}(?:\\.\\d{3})+|\\d{1,6})\\s+${UNIDADES.source}`, 'gi');

  for (const m of texto.matchAll(re)) {
    const bruto = m[1];
    const unidad = m[2];
    if (bruto === undefined || unidad === undefined) continue;

    const valor = aNumero(bruto);
    if (valor === undefined) continue;

    const desde = Math.max(0, m.index - 90);
    const hasta = Math.min(texto.length, m.index + m[0].length + 90);
    fuera.push({
      valor,
      unidad: unidad.toLowerCase(),
      frase: texto.slice(desde, hasta).replace(/\s+/g, ' ').trim(),
    });
  }
  return fuera;
}

interface RespuestaLista {
  meta?: { totalCount?: number };
  results?: {
    contentID: number;
    name: string;
    friendlyName: string;
    contentType: string;
    metaDescription?: string | null;
    startingDate?: string | null;
    modifiedDate?: string | null;
  }[];
}

async function pedirJson<T>(url: string): Promise<T> {
  const r = await fetchWithRetry(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    timeoutMs: 25_000,
    retries: 1,
  });
  return (await r.json()) as T;
}

/** Resuelve el alias probando las formas conocidas. `undefined` = no está en la plataforma. */
export async function resolverAlias(nombre: string, departamento: string): Promise<string | undefined> {
  for (const alias of aliasCandidatos(nombre, departamento)) {
    try {
      await pedirJson<RespuestaLista>(`https://${alias}.${BASE}/api/v1/contents?orderBy=recent&pageSize=1`);
      return alias;
    } catch {
      /* siguiente forma */
    }
  }
  return undefined;
}

export interface OpcionesAlcaldias {
  /** Nada anterior al sismo. */
  desde: Date;
  /** Municipios a consultar. */
  municipios: MunicipioRef[];
  /** Peticiones simultáneas. 5 va sobrado y no castiga servidores en emergencia. */
  concurrencia?: number;
  /** Traer el cuerpo completo de las que hablan del sismo (una petición más cada una). */
  conTexto?: boolean;
}

export interface ResultadoAlcaldias {
  publicaciones: PublicacionAlcaldia[];
  cifras: CifraPropuesta[];
  /** Municipios que respondieron, para medir cobertura. */
  enPlataforma: string[];
  /** Descartados por ADR-001. Se cuenta, no se guarda. */
  avisosPersonalesDescartados: number;
}

/**
 * Recoge lo que las alcaldías publicaron desde el sismo.
 *
 * Devuelve enlaces (publicables) y cifras (a revisar). No escribe nada.
 */
export async function recogerAlcaldias(opciones: OpcionesAlcaldias): Promise<ResultadoAlcaldias> {
  const { desde, municipios, concurrencia = 5, conTexto = true } = opciones;

  const publicaciones: PublicacionAlcaldia[] = [];
  const cifras: CifraPropuesta[] = [];
  const enPlataforma: string[] = [];
  let avisosPersonalesDescartados = 0;

  const cola = [...municipios];

  async function trabajar(): Promise<void> {
    for (let m = cola.shift(); m; m = cola.shift()) {
      // Sin departamento solo queda la forma corta del alias; `aliasCandidatos` ya la prueba.
      const departamento = m.admin1_name ?? '';
      const alias = await resolverAlias(m.name, departamento);
      if (!alias) continue;
      enPlataforma.push(m.pcode);

      let lista: RespuestaLista;
      try {
        lista = await pedirJson<RespuestaLista>(
          `https://${alias}.${BASE}/api/v1/contents?orderBy=recent&pageSize=${POR_MUNICIPIO}`,
        );
      } catch {
        continue;
      }

      for (const it of lista.results ?? []) {
        const fecha = it.startingDate || it.modifiedDate;
        if (!fecha) continue;
        const cuando = new Date(fecha);
        if (Number.isNaN(cuando.valueOf()) || cuando < desde) continue;

        const resumen = limpiarHtml(it.metaDescription ?? '');
        const cabecera = `${it.name} ${resumen}`;

        // ADR-001 primero, antes que cualquier otro filtro.
        if (esAvisoPersonal(cabecera)) {
          avisosPersonalesDescartados += 1;
          continue;
        }
        if (!hablaDelSismo(cabecera)) continue;

        const url = urlPublica(alias, it.friendlyName);
        const pub: PublicacionAlcaldia = {
          pcode: m.pcode,
          municipio: m.name,
          departamento,
          alias,
          titulo: it.name.trim(),
          tipo: it.contentType,
          url,
          publicado: cuando.toISOString(),
          resumen,
        };

        if (conTexto) {
          try {
            const det = await pedirJson<{ results?: { body?: string }; body?: string }>(
              `https://${alias}.${BASE}/api/v1/contents/${it.contentID}`,
            );
            const cuerpo = limpiarHtml(det.results?.body ?? det.body ?? '');
            // El cuerpo puede traer el nombre que el titular no traía.
            if (esAvisoPersonal(cuerpo)) {
              avisosPersonalesDescartados += 1;
              continue;
            }
            pub.texto = cuerpo;
            for (const c of cifrasDe(cuerpo)) {
              cifras.push({ ...c, pcode: m.pcode, municipio: m.name, url, publicado: pub.publicado });
            }
          } catch {
            /* sin cuerpo; el enlace sigue valiendo */
          }
        }

        publicaciones.push(pub);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrencia }, trabajar));

  publicaciones.sort((a, b) => b.publicado.localeCompare(a.publicado));
  return { publicaciones, cifras, enPlataforma, avisosPersonalesDescartados };
}
