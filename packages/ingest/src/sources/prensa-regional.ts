/**
 * Prensa regional: los feeds propios de los diarios de la zona golpeada.
 *
 * ## Por qué existe, si ya había un recolector
 *
 * `noticias.ts` consulta el RSS de Google Noticias, que agrega. Agregar está bien para
 * enterarse de que hubo un terremoto y mal para saber qué pasó en Roldanillo. Medido
 * sobre la recolección en producción: **704 notas, y solo 177 (25 %) traían un municipio
 * reconocible**. Entre los medios más repetidos aparecían Infobae, El Universo (Ecuador),
 * DW, France 24 y el Hoy Diario del Magdalena — a 900 km del epicentro—, y quince enlaces
 * a `facebook.com`, que además roza ADR-002.
 *
 * El motivo de fondo no es qué medio salga primero: es que **la cobertura nacional habla
 * del país y la regional habla de los municipios**. Un diario de Pereira publica «restringen
 * el ingreso al campus de la UTP»; ninguna agencia nacional publica eso, y es exactamente
 * el grano que este mapa necesita.
 *
 * ## Qué cambia respecto de Google Noticias
 *
 * 1. **El medio sale de la configuración, no del feed.** Un RSS propio no trae `<source>`
 *    —comprobado en los ocho—, así que por esa vía todos habrían quedado como
 *    «desconocido» y clasificados `unverified`.
 * 2. **Se lee el resumen y la URL, no solo el titular.** Varios de estos diarios ponen el
 *    municipio en la ruta (`/noticias/risaralda/pereira/…`), que es una señal más limpia
 *    que el titular: no depende de cómo esté redactado.
 * 3. **Cada feed declara qué departamentos cubre.** Con eso se desempatan los homónimos:
 *    si El Diario de Pereira dice «La Unión», es la de Risaralda y no la del Valle.
 * 4. **Filtro de tema.** Estos son feeds generales: traen fútbol y clasificados. Sin
 *    filtro entraban titulares como «VENTA LOTES» y «Dos militares asesinados».
 * 5. **Filtro de antigüedad.** Nada anterior al sismo. Un feed de 100 notas arrastra
 *    semanas de archivo.
 *
 * ## Lo que NO hace, y no es un descuido
 *
 * Igual que `noticias.ts`: **recoge enlaces, no cifras.** No lee el cuerpo del artículo ni
 * saca números. Sacar cifras de prosa con patrones confunde totales con parciales y
 * acumulados con nuevos, y una cifra de fallecidos equivocada en un mapa de emergencia
 * hace daño real. La máquina rastrea, la persona registra en `curated/observaciones.json`.
 */
import { fetchWithRetry } from '../http.js';
import {
  extraerEtiqueta,
  limpiar,
  municipiosEn,
  nombresAmbiguos,
  normalizar,
  type Candidato,
  type MunicipioRef,
  type TipoCandidato,
} from './noticias.js';

export interface MedioRegional {
  /** Cómo se muestra en la interfaz. No sale del feed: los propios no traen `<source>`. */
  nombre: string;
  url: string;
  tipo: TipoCandidato;
  /**
   * Departamentos que el medio cubre de cerca, con el mismo nombre que traen los datos
   * de límites. Sirve para desempatar homónimos, no para descartar: un diario de Cali
   * puede hablar de Quibdó y esa nota vale.
   */
  departamentos: string[];
}

/**
 * Feeds verificados uno a uno el 2026-08-12: se pidieron todos y se comprobó que
 * devolvieran `<item>`s con `pubDate`. Los que no respondieron quedan anotados abajo para
 * que nadie los vuelva a probar a ciegas.
 *
 * Cubren los departamentos con más municipios por encima del umbral de daño: Valle del
 * Cauca (42), Tolima (41), Chocó (25), Risaralda (14) y Cauca (9).
 */
export const MEDIOS_REGIONALES: MedioRegional[] = [
  {
    nombre: 'El País (Cali)',
    url: 'https://www.elpais.com.co/arc/outboundfeeds/rss/',
    tipo: 'press',
    departamentos: ['Valle del Cauca', 'Cauca'],
  },
  {
    nombre: 'El Diario (Pereira)',
    url: 'https://www.eldiario.com.co/feed/',
    tipo: 'press',
    departamentos: ['Risaralda'],
  },
  {
    nombre: 'Chocó 7 Días',
    url: 'https://choco7dias.com/feed/',
    tipo: 'press',
    departamentos: ['Chocó'],
  },
  {
    nombre: 'Proclama del Cauca',
    url: 'https://www.proclamadelcauca.com/feed/',
    tipo: 'press',
    departamentos: ['Cauca', 'Valle del Cauca'],
  },
  {
    nombre: 'El Nuevo Día (Ibagué)',
    url: 'https://www.elnuevodia.com.co/nuevodia/rss.xml',
    tipo: 'press',
    departamentos: ['Tolima'],
  },
  {
    nombre: 'El Tiempo',
    url: 'https://www.eltiempo.com/rss/colombia.xml',
    tipo: 'press',
    departamentos: [],
  },
];

/**
 * Probados y descartados el 2026-08-12, para no repetir el trabajo:
 *
 * - **La Patria (Manizales)** — `lapatria.com/rss.xml` responde, pero es el feed de
 *   *clasificados*: la primera entrada era «VENTA LOTES» de abril. No expone uno de
 *   noticias en las rutas habituales. Sigue llegando por Google Noticias, donde es de los
 *   medios más frecuentes.
 * - **La Crónica del Quindío**, **El Quindiano** — `/feed`, `/rss`, `/rss.xml` devuelven
 *   HTML. Quindío (12 municipios sobre el umbral) queda solo con Google Noticias.
 * - **El Colombiano** — sin feed público; Antioquia (29 municipios) queda igual.
 * - **UNGRD** (`portal.gestiondelriesgo.gov.co`) devuelve 403 al RSS, y el **SGC** sirve
 *   una página sin `<item>`. Lo oficial sigue entrando por las consultas `.gov.co` de
 *   Google Noticias.
 * - Ninguno de estos medios expone feeds por sección (`/category/<municipio>/feed`), así
 *   que no hay forma de pedir «solo Pereira»: se filtra después de traer.
 */
export const MEDIOS_SIN_FEED = [
  'La Patria (Manizales)',
  'La Crónica del Quindío',
  'El Quindiano',
  'El Colombiano',
  'UNGRD (portal)',
  'SGC',
] as const;

/**
 * Tienen feed y funciona, pero **nos bloquean por User-Agent**. No están en la lista
 * activa, y la decisión de dejarlos fuera es deliberada.
 *
 * Comprobado el 2026-08-12, mismo feed y misma petición cambiando solo el
 * identificador:
 *
 * | User-Agent | occidente.co | 90minutos.co |
 * |---|---|---|
 * | `Mozilla/5.0` | 200 | 200 |
 * | el nuestro | **403** | **403** |
 * | ninguno | 200 | 200 |
 *
 * O sea que su WAF no rechaza el tráfico automático en general: rechaza al que se
 * identifica como tal. Hacerse pasar por un navegador los saltaría, y no se hace: `http.ts`
 * se compromete a identificarse justo para que quien opera un servidor bajo carga pueda
 * pedirnos que bajemos el ritmo o llamarnos. Falsear eso convierte esa promesa en
 * decorado. Tampoco tiene sentido pedirles cada 30 minutos un 403 seguro.
 *
 * **La salida no es técnica**: escribirle al medio y pedir permiso. Es el mismo trámite
 * pendiente con el `appname` de ReliefWeb. Mientras tanto, Cali queda cubierta por El País
 * —el medio con más notas de toda la recolección— y por Google Noticias.
 */
export const MEDIOS_QUE_NOS_BLOQUEAN: MedioRegional[] = [
  {
    nombre: 'Diario Occidente',
    url: 'https://occidente.co/feed/',
    tipo: 'press',
    departamentos: ['Valle del Cauca'],
  },
  {
    nombre: '90 Minutos',
    url: 'https://90minutos.co/feed/',
    tipo: 'press',
    departamentos: ['Valle del Cauca'],
  },
];

/**
 * Palabras que hacen que una nota sea de este desastre y no del día corriente.
 *
 * Estos feeds son generales — traen fútbol, política y clasificados—, así que sin este
 * filtro la lista de candidatos se llena de ruido y quien cura pierde el tiempo. Se mira
 * el titular y el resumen juntos.
 */
const TEMA =
  /terremoto|sismo|temblor|r[ée]plica|damnificad|colaps|derrumb|deslizamiento|albergue|acopio|evacua|socorr|desapareci|remoci[óo]n|escombro|damnific|emergencia s[íi]smica|UNGRD|Defensa Civil|Cruz Roja/i;

/** Quita etiquetas y entidades del resumen: viene con HTML en casi todos los feeds. */
export function textoPlano(html: string): string {
  return limpiar(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * La ruta de la URL como texto buscable.
 *
 * `…/noticias/risaralda/pereira/utp-mantiene-actividades…` se convierte en
 * «noticias risaralda pereira utp mantiene actividades». Es la señal más limpia que hay
 * para atribuir municipio: no depende de cómo esté redactado el titular. Se capitaliza
 * cada palabra porque `municipiosEn` exige mayúscula inicial —su defensa contra «la paz»
 * en prosa corriente—, y en una ruta esa distinción no existe.
 */
export function rutaComoTexto(url: string): string {
  let ruta: string;
  try {
    ruta = new URL(url).pathname;
  } catch {
    return '';
  }

  return ruta
    .split(/[/\-_.]+/)
    .filter((t) => t.length > 1 && !/^\d+$/.test(t))
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

export interface NotaRegional extends Candidato {
  /** De qué feed salió. Útil para depurar y para el tablero. */
  fuente_feed: string;
}

export interface OpcionesRegional {
  municipios: MunicipioRef[];
  /** Nada anterior al sismo entra. */
  desde: Date;
  ahora?: Date;
}

/**
 * Parsea un feed propio. Puro: sin red, para poder probarlo con fixtures grabados.
 */
export function parsearFeedRegional(
  xml: string,
  medio: MedioRegional,
  opciones: OpcionesRegional,
  ambiguos: Set<string> = nombresAmbiguos(opciones.municipios),
): NotaRegional[] {
  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([bloque]) => bloque);
  const desde = opciones.desde.getTime();
  const notas: NotaRegional[] = [];

  for (const bloque of items) {
    const titulo = limpiar(extraerEtiqueta(bloque, 'title'));
    const enlace = limpiar(extraerEtiqueta(bloque, 'link'));
    if (!titulo || !enlace) continue;

    const resumen = textoPlano(extraerEtiqueta(bloque, 'description'));

    // Tema antes que nada: es lo que evita que un feed general meta clasificados.
    if (!TEMA.test(`${titulo} ${resumen}`)) continue;

    const fecha = extraerEtiqueta(bloque, 'pubDate');
    const t = fecha ? Date.parse(fecha) : Number.NaN;
    // Sin fecha no se puede saber si es de este desastre; fuera. Y nada anterior al sismo.
    if (Number.isNaN(t) || t < desde) continue;

    const municipio = municipioDeNota(titulo, resumen, enlace, medio, opciones.municipios, ambiguos);

    notas.push({
      titulo,
      enlace,
      medio: medio.nombre,
      tipo: medio.tipo,
      publicado: new Date(t).toISOString(),
      fuente_feed: medio.url,
      ...(municipio ? { pcode: municipio.pcode, municipio: municipio.name } : {}),
    });
  }

  return notas;
}

/**
 * Elige el municipio de una nota mirando la ruta de la URL, el titular y el resumen.
 *
 * El orden no es arbitrario: va de la señal más limpia a la más sucia, y se queda con la
 * primera que acierta.
 *
 * 1. **La ruta de la URL.** Si dice `/noticias/risaralda/pereira/`, la sección del propio
 *    diario ya clasificó la nota. Ninguna frase del cuerpo le gana a eso.
 * 2. **El titular.** Corto, y el municipio suele ser el sujeto.
 * 3. **El resumen, y solo para municipios del departamento que el medio cubre.**
 *
 * Ese último límite salió de un error real en producción, y conviene no deshacerlo:
 *
 * > «El doble drama de **Sipí, Chocó**» quedó etiquetada como **Murillo (Tolima)**,
 * > porque el resumen decía «el alcalde Jairo Antonio **Murillo**».
 *
 * Un resumen es prosa llena de nombres de personas, y los apellidos van en mayúscula
 * igual que los municipios, así que la defensa de la mayúscula inicial no sirve ahí.
 * Acotar el resumen al departamento del medio la reemplaza por una garantía editorial:
 * si El Diario de Pereira menciona Santa Rosa de Cabal, habla de la de Risaralda.
 * Para un medio nacional —`departamentos: []`— el resumen sencillamente no cuenta.
 *
 * En cada paso se prueba primero contra **los municipios del propio departamento**, con
 * la longitud mínima relajada a cuatro letras. Es lo que hace visibles a Tadó y Sipí, que
 * están entre los más golpeados del Chocó y que la regla de cinco letras descartaba
 * siempre: con la lista ya acotada a Chocó, «Tadó» no se confunde con nada.
 */
export function municipioDeNota(
  titulo: string,
  resumen: string,
  enlace: string,
  medio: MedioRegional,
  municipios: MunicipioRef[],
  ambiguos: Set<string> = nombresAmbiguos(municipios),
): MunicipioRef | undefined {
  const cubre = new Set(medio.departamentos.map((d) => normalizar(d)));
  const propios = municipios.filter(
    (m) => m.admin1_name !== undefined && cubre.has(normalizar(m.admin1_name)),
  );

  const masLargo = (lista: MunicipioRef[]): MunicipioRef | undefined =>
    lista.length === 0
      ? undefined
      : lista.reduce((mejor, m) => (m.name.length > mejor.name.length ? m : mejor));

  const ruta = rutaComoTexto(enlace);

  return (
    masLargo(municipiosEn(ruta, propios, ambiguos, 4)) ??
    masLargo(municipiosEn(ruta, municipios, ambiguos)) ??
    masLargo(municipiosEn(titulo, propios, ambiguos, 4)) ??
    masLargo(municipiosEn(titulo, municipios, ambiguos)) ??
    masLargo(municipiosEn(resumen, propios, ambiguos))
  );
}

export interface RecoleccionRegional {
  generado: string;
  feeds_consultados: number;
  feeds_caidos: string[];
  notas: NotaRegional[];
}

/**
 * Recorre los feeds regionales. Uno caído no tumba los demás.
 *
 * En serie y no en paralelo, igual que `noticias.ts`: son ocho peticiones a servidores de
 * diarios pequeños que ahora mismo tienen más visitas de las que suelen. No hay ninguna
 * prisa que justifique golpearlos a la vez.
 */
export async function recolectarRegional(
  opciones: OpcionesRegional,
  medios: MedioRegional[] = MEDIOS_REGIONALES,
): Promise<RecoleccionRegional> {
  const ambiguos = nombresAmbiguos(opciones.municipios);
  const porEnlace = new Map<string, NotaRegional>();
  const caidos: string[] = [];

  for (const medio of medios) {
    let xml: string;
    try {
      const respuesta = await fetchWithRetry(medio.url, { timeoutMs: 20_000, retries: 1 });
      xml = await respuesta.text();
    } catch {
      caidos.push(medio.nombre);
      continue;
    }

    for (const nota of parsearFeedRegional(xml, medio, opciones, ambiguos)) {
      // El primero gana: los medios van ordenados por cercanía a la zona.
      if (!porEnlace.has(nota.enlace)) porEnlace.set(nota.enlace, nota);
    }
  }

  const notas = [...porEnlace.values()].sort(
    (a, b) => Date.parse(b.publicado) - Date.parse(a.publicado),
  );

  return {
    generado: (opciones.ahora ?? new Date()).toISOString(),
    feeds_consultados: medios.length,
    feeds_caidos: caidos,
    notas,
  };
}
