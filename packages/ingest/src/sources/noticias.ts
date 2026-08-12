/**
 * Recolector de notas de prensa y boletines oficiales.
 *
 * **Recoge enlaces, no cifras.** No lee el cuerpo de los artículos ni extrae números
 * automáticamente, y eso es a propósito: sacar cifras de prosa con patrones confunde
 * totales con parciales, acumulados con nuevos, y correcciones con datos frescos. Una
 * cifra de fallecidos equivocada en un mapa de emergencia hace daño real.
 *
 * Lo que produce es una **lista de candidatos** —titular, medio, fecha, enlace, y el
 * municipio que menciona— para que una persona los lea y registre lo que corresponda en
 * `curated/observaciones.json`. La máquina hace lo que hace bien (rastrear muchas fuentes
 * sin cansarse) y la persona hace lo que hace bien (entender qué dice un texto).
 *
 * Usa el RSS de Google Noticias porque agrega en una sola consulta a Caracol, RCN,
 * El Tiempo, El Espectador, Blu Radio, Semana y los portales `.gov.co`, cuyos feeds
 * propios en su mayoría no existen o cambiaron de ruta.
 */
import { fetchWithRetry } from '../http.js';

const GOOGLE_NEWS = 'https://news.google.com/rss/search';

/**
 * Medios que consideramos de referencia, y cómo se clasifica cada uno.
 *
 * Un `.gov.co` es fuente oficial; un medio serio sigue siendo prensa. La distinción se
 * mantiene visible en toda la aplicación (ADR-003) y quien coordina una respuesta la
 * necesita a la vista.
 */
const OFICIAL = /\.gov\.co|gestiondelriesgo|sgc\.gov|dane\.gov|ideam|unidad nacional/i;

const MEDIOS_CONOCIDOS = [
  'El Tiempo',
  'El Espectador',
  'Caracol',
  'Noticias Caracol',
  'Caracol Radio',
  'RCN',
  'Noticias RCN',
  'Blu Radio',
  'Semana',
  'Infobae',
  'El Colombiano',
  'El País',
  'La FM',
  'W Radio',
  'Portafolio',
  'La República',
  'El Heraldo',
  'Q’hubo',
  'Publimetro',
];

export type TipoCandidato = 'official' | 'press' | 'unverified';

export interface Candidato {
  titulo: string;
  enlace: string;
  medio: string;
  tipo: TipoCandidato;
  publicado: string;
  /** P-code del municipio mencionado en el titular, si se reconoció alguno. */
  pcode?: string;
  municipio?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parseo del feed
// ─────────────────────────────────────────────────────────────────────────────

function extraer(bloque: string, etiqueta: string): string {
  const m = bloque.match(
    new RegExp(`<${etiqueta}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${etiqueta}>`),
  );
  return (m?.[1] ?? '').trim();
}

/** Entidades HTML que aparecen en los titulares de Google Noticias. */
function limpiar(texto: string): string {
  return texto
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function clasificar(medio: string): TipoCandidato {
  if (OFICIAL.test(medio)) return 'official';
  const conocido = MEDIOS_CONOCIDOS.some((m) => medio.toLowerCase().includes(m.toLowerCase()));
  return conocido ? 'press' : 'unverified';
}

/** Parsea un feed RSS. Puro: sin red. */
export function parsearFeed(xml: string): Candidato[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  return items
    .map(([, bloque]) => {
      const titulo = limpiar(extraer(bloque ?? '', 'title'));
      const enlace = extraer(bloque ?? '', 'link');
      const medio = limpiar(extraer(bloque ?? '', 'source')) || 'desconocido';
      const fecha = extraer(bloque ?? '', 'pubDate');
      if (!titulo || !enlace) return undefined;

      const publicado = fecha ? new Date(fecha).toISOString() : new Date().toISOString();
      if (Number.isNaN(Date.parse(publicado))) return undefined;

      return { titulo, enlace, medio, tipo: clasificar(medio), publicado } satisfies Candidato;
    })
    .filter((c): c is Candidato => c !== undefined);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconocimiento de municipios
// ─────────────────────────────────────────────────────────────────────────────

/** Quita tildes conservando mayúsculas. */
function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Sin tildes y en minúscula, para comparar titulares con nombres de municipio. */
export function normalizar(texto: string): string {
  return sinTildes(texto).toLowerCase();
}

export interface MunicipioRef {
  pcode: string;
  name: string;
  /** Departamento al que pertenece. Sirve para descartar nombres ambiguos. */
  admin1_name?: string;
}

/**
 * Nombres de municipio que en un titular casi nunca significan el municipio.
 *
 * Colombia tiene un municipio llamado **Colombia** (Huila) y otro llamado **Risaralda**
 * (Caldas), y hay municipios homónimos de casi todos los departamentos: Córdoba, Bolívar,
 * Sucre, Cauca, Nariño… Un titular que dice «Risaralda» habla del departamento el 99 %
 * de las veces.
 *
 * La lista se arma con los nombres de departamento que vienen en los propios datos, más
 * el país, así que no hay nada codificado a mano que se pueda quedar viejo.
 */
export function nombresAmbiguos(municipios: MunicipioRef[]): Set<string> {
  const ambiguos = new Set<string>(['colombia']);
  for (const m of municipios) {
    if (m.admin1_name) ambiguos.add(normalizar(m.admin1_name));
  }
  return ambiguos;
}

/**
 * Busca el municipio mencionado en un titular.
 *
 * Tres filtros, y ninguno sobra:
 *
 * 1. **Longitud mínima de cinco letras** (con «Cali» exceptuado por ser una de las
 *    ciudades afectadas). Los nombres cortos coinciden con demasiadas cosas.
 * 2. **Límites de palabra**, para que «Pereira» no coincida dentro de otra palabra.
 * 3. **Mayúscula inicial en el titular**. Este es el que de verdad importa: hay
 *    municipios que se llaman «La Paz», «La Unión» o «El Peñol», y esas mismas palabras
 *    aparecen constantemente en prosa normal. «Marchas por la paz» no habla del municipio
 *    de La Paz; «Emergencia en La Paz» probablemente sí. La mayúscula distingue el
 *    nombre propio del giro común.
 *
 * Si un titular menciona varios, gana el más largo: «Santa Rosa de Cabal» debe ganarle
 * a «Rosa».
 *
 * Etiquetar mal un reporte es peor que no etiquetarlo: manda a alguien a leer una nota
 * que no habla de su municipio, y en una emergencia el tiempo de lectura es caro.
 */
export function municipioDe(
  titulo: string,
  municipios: MunicipioRef[],
  ambiguos: Set<string> = nombresAmbiguos(municipios),
): MunicipioRef | undefined {
  const plano = sinTildes(titulo);
  const bajo = plano.toLowerCase();

  let mejor: MunicipioRef | undefined;

  for (const m of municipios) {
    if (m.name.length < 5 && normalizar(m.name) !== 'cali') continue;
    if (ambiguos.has(normalizar(m.name))) continue;

    const nombre = normalizar(m.name);
    const coincidencia = new RegExp(`(^|[^a-z0-9])(${nombre})([^a-z0-9]|$)`).exec(bajo);
    if (!coincidencia) continue;

    // Posición del nombre dentro del titular original, para mirar su mayúscula.
    const inicio = coincidencia.index + (coincidencia[1]?.length ?? 0);
    const primera = plano[inicio] ?? '';
    if (primera !== primera.toUpperCase()) continue;

    if (!mejor || m.name.length > mejor.name.length) mejor = m;
  }

  return mejor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recolección
// ─────────────────────────────────────────────────────────────────────────────

function urlConsulta(consulta: string): string {
  const q = encodeURIComponent(consulta);
  return `${GOOGLE_NEWS}?q=${q}&hl=es-419&gl=CO&ceid=CO:es-419`;
}

/** Consultas generales, más una por municipio de los más golpeados. */
export function consultasPara(municipios: MunicipioRef[]): string[] {
  const generales = [
    'terremoto Colombia damnificados',
    'terremoto Colombia edificios colapsados',
    'terremoto Colombia fallecidos heridos',
    'sismo Colombia albergues centros de acopio',
    'terremoto Colombia UNGRD balance',
  ];

  const porMunicipio = municipios
    .slice(0, 12)
    .map((m) => `terremoto ${m.name} damnificados`);

  return [...generales, ...porMunicipio];
}

export interface Recoleccion {
  generado: string;
  consultas: number;
  candidatos: Candidato[];
}

/**
 * Recorre las consultas y devuelve los candidatos sin repetir.
 *
 * Las consultas van una tras otra y no en paralelo: son diez o quince peticiones a un
 * servicio gratuito y ajeno, y no hay ninguna prisa que justifique golpearlo de golpe.
 */
export async function recolectarNoticias(
  municipios: MunicipioRef[],
  ahora: Date = new Date(),
): Promise<Recoleccion> {
  const porEnlace = new Map<string, Candidato>();
  const consultas = consultasPara(municipios);
  const ambiguos = nombresAmbiguos(municipios);

  for (const consulta of consultas) {
    let xml: string;
    try {
      const respuesta = await fetchWithRetry(urlConsulta(consulta), { timeoutMs: 30_000, retries: 1 });
      xml = await respuesta.text();
    } catch {
      continue; // Una consulta caída no puede tumbar la recolección entera.
    }

    for (const candidato of parsearFeed(xml)) {
      if (porEnlace.has(candidato.enlace)) continue;

      const municipio = municipioDe(candidato.titulo, municipios, ambiguos);
      porEnlace.set(candidato.enlace, {
        ...candidato,
        ...(municipio ? { pcode: municipio.pcode, municipio: municipio.name } : {}),
      });
    }
  }

  const candidatos = [...porEnlace.values()].sort(
    (a, b) => Date.parse(b.publicado) - Date.parse(a.publicado),
  );

  return { generado: ahora.toISOString(), consultas: consultas.length, candidatos };
}
