/**
 * Reglas de extracción — **todas viven aquí, como datos**.
 *
 * Agregar una regla es agregar una línea a una de las tablas de abajo. No hay lógica
 * repartida por el archivo: hay dos tablas y una función que las recorre. Es a propósito,
 * porque estas reglas las va a tocar gente que no escribió el resto del código.
 *
 * **Lo que extrae son SUGERENCIAS, nunca datos publicados.** Sale a
 * `data/fuentes/extraidos.json` para que una persona lo confirme y lo pase a
 * `curated/incidentes.json`. Un patrón que se equivoca al etiquetar un lugar manda a un
 * equipo al sitio incorrecto, así que la máquina propone y la persona dispone.
 *
 * ## Qué esperar de esto, medido sobre titulares reales
 *
 * En la primera corrida sobre 676 notas: **109 clasificadas por tipo, y prácticamente
 * ninguna con barrio**. La razón es simple y conviene tenerla presente antes de invertir
 * más en las reglas de lugar: **los titulares dicen «edificio colapsó en Cali», no «en el
 * barrio Egipto»**. El detalle del barrio vive en el cuerpo del artículo, que no
 * descargamos.
 *
 * Así que el valor real de esta tabla hoy es **triaje**: separar las 109 notas que hablan
 * de incidentes de las 567 que hablan de donaciones, ayudas o política. Eso ya ahorra
 * mucho tiempo de lectura. El lugar exacto lo sigue poniendo la persona que abre la nota,
 * y no hay atajo automático que sea honesto.
 */
import type { TipoIncidente } from '../incidentes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tabla 1 — qué pasó
// ─────────────────────────────────────────────────────────────────────────────

interface ReglaTipo {
  tipo: TipoIncidente;
  patron: RegExp;
}

/**
 * El orden importa: gana la primera que coincida. Las más específicas van arriba, porque
 * «hospital colapsado» también coincide con el patrón genérico de edificación.
 */
/**
 * Los sustantivos llevan plural opcional (`(?:es)?`, `s?`) porque los titulares alternan
 * sin avisar: «edificación derrumbada» y «edificaciones colapsaron» dicen lo mismo. Sin
 * el plural, `\b` corta en «edificacion|es» y la regla no dispara — un fallo silencioso
 * que solo se ve probando.
 */
export const REGLAS_TIPO: readonly ReglaTipo[] = [
  {
    tipo: 'centro_salud_afectado',
    patron: /\b(?:hospitales|hospital|cl[ií]nicas?|centros? de salud|puestos? de salud)\b[^.]{0,40}?\b(?:afectad|colaps|evacuad|inhabilitad|da[ñn]ad)/i,
  },
  {
    tipo: 'albergue',
    patron: /\b(?:albergues?|alojamientos? temporal(?:es)?|refugios?)\b/i,
  },
  {
    tipo: 'centro_acopio',
    patron: /\b(?:centros?|puntos?) de acopio\b/i,
  },
  {
    tipo: 'via_bloqueada',
    patron: /\b(?:v[ií]as?|carreteras?|puentes?|corredor(?:es)? vial(?:es)?)\b[^.]{0,40}?\b(?:cerrad|bloquead|colaps|derrumb|obstruid|inhabilitad)/i,
  },
  {
    tipo: 'edificacion_colapsada',
    patron: /\b(?:edificaci(?:[oó]n|ones)|edificios?|casas?|viviendas?|estructuras?|inmuebles?)\b[^.]{0,30}?\b(?:se\s+)?(?:derrumb|colaps|cay[oó]|desplom)/i,
  },
  {
    tipo: 'edificacion_danada',
    patron: /\b(?:edificaci(?:[oó]n|ones)|edificios?|casas?|viviendas?|estructuras?)\b[^.]{0,30}?\b(?:agrietad|averiad|da[ñn]ad|afectad|fisurad)/i,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tabla 2 — dónde
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un nombre propio: palabra en mayúscula, seguida de hasta cuatro palabras que sean o
 * bien conectores (`de`, `del`, `la`…) o bien más palabras en mayúscula. Así entra
 * «Santa Rita del Norte» completa y se para justo antes de «habilitado».
 *
 * **El `\b` después de los conectores no es decorativo.** Sin él, `de` coincide con el
 * principio de `del`, la repetición se corta ahí y «Ciudadela del Petronio» queda en
 * «Ciudadela de» — un fallo que no se ve leyendo, solo probando.
 *
 * Se exige mayúscula inicial: «en el barrio Egipto» sí, «en el barrio más afectado» no.
 * Y el nombre termina en la primera palabra en minúscula, porque **capturar de más es
 * peor que no capturar**: una sugerencia con media frase pegada la tiene que limpiar
 * alguien a mano.
 */
const PALABRA = String.raw`[A-ZÁÉÍÓÚÑ][\wáéíóúñüÁÉÍÓÚÑ]*`;
const CONECTOR = String.raw`(?:de|del|la|las|el|los|San|Santa|Santo)\b`;
const NOMBRE_PROPIO = String.raw`${PALABRA}(?:\s+(?:${CONECTOR}|${PALABRA})){0,4}`;

/** Conectores de lugar. El grupo capturado es el nombre. */
export const CONECTORES: readonly { clase: string; patron: RegExp }[] = [
  { clase: 'barrio', patron: new RegExp(String.raw`\b(?:en|del|el)\s+barrio\s+(${NOMBRE_PROPIO})`) },
  { clase: 'sector', patron: new RegExp(String.raw`\bsector\s+(?:de\s+)?(${NOMBRE_PROPIO})`) },
  { clase: 'comuna', patron: new RegExp(String.raw`\bcomuna\s+([0-9]{1,2}|${NOMBRE_PROPIO})`) },
  { clase: 'vereda', patron: new RegExp(String.raw`\bvereda\s+(${NOMBRE_PROPIO})`) },
  {
    clase: 'corregimiento',
    patron: new RegExp(String.raw`\bcorregimiento\s+(?:de\s+)?(${NOMBRE_PROPIO})`),
  },
  // Se quitó el conector de «vía X». En la primera corrida sobre titulares reales fue el
  // único que produjo algo — y fue un falso positivo: «vía Quito-Lago Agrio», que es un
  // oleoducto en Ecuador. Un nombre de carretera describe el incidente, no la localidad,
  // y su tasa de error no compensa lo poco que aporta.
];

// ─────────────────────────────────────────────────────────────────────────────
// Tabla 3 — en qué sede
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nombres de sedes. Esta tabla existe por algo que se vio en los titulares reales y que
 * contradice a la tabla 2:
 *
 * > «Terremoto deja 181 muertos y cientos de edificios colapsados» — una cifra, ningún
 * > lugar.
 * > «**Universidad de Caldas** habilita centro de acopio» — un lugar que se puede ubicar
 * > en un mapa en diez segundos.
 *
 * Los daños se cuentan; la ayuda se convoca. Y para convocar hay que decir dónde. Por eso
 * los titulares de acopio y albergue **sí** traen ubicación, mientras los de colapso no —
 * y por eso vale la pena extraerla aunque la tabla 2 haya rendido casi nada.
 *
 * Se capturan sedes con nombre propio: la palabra clave más lo que la sigue, mientras sea
 * conector (`de`, `del`, `la`…) o palabra en mayúscula. «Universidad de Caldas» entra
 * completa; «universidad más cercana» no entra.
 */
const CLASES_SEDE =
  'Universidad|Coliseo|Estadio|Polideportivo|Unidad Deportiva|Parroquia|Iglesia|Catedral|' +
  'Colegio|Instituto|Ciudadela|Biblioteca|Teatro|Gimnasio|Batall[oó]n|Plaza de Mercado|' +
  'Centro Comercial|Corferias|Hospital|Cl[ií]nica|Aeropuerto|Terminal';

export const SEDES: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:${CLASES_SEDE})(?:\s+(?:${CONECTOR}|${PALABRA})){1,4}`),
];

/** Conectores sueltos al final: «Universidad de la» se queda en «Universidad». */
const CONECTOR_FINAL = /\s+(?:de|del|la|las|el|los|y|en)$/i;

/**
 * Recorta la sede capturada, o la descarta si quedó en la pura palabra clave.
 *
 * «Universidad» sola no ubica nada: hay 400 en el país. Solo sirve con nombre propio.
 */
function limpiarSede(bruto: string): string | undefined {
  let nombre = bruto.trim().replace(/\s+/g, ' ');
  while (CONECTOR_FINAL.test(nombre)) nombre = nombre.replace(CONECTOR_FINAL, '');
  return nombre.includes(' ') ? nombre : undefined;
}

/** Palabras que delatan que lo capturado no es un nombre propio de lugar. */
const NO_ES_LUGAR =
  /^(?:m[aá]s|menos|donde|que|del|de la|los|las|un|una|se|est[aá]|muy|afectad|damnificad)\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// Motor
// ─────────────────────────────────────────────────────────────────────────────

export interface Extraido {
  tipo: TipoIncidente;
  /** Clase de lugar reconocida: barrio, vereda, comuna… */
  clase?: string;
  /** Nombre del lugar tal como lo escribe la fuente. */
  lugar?: string;
  /** Sede con nombre propio: «Universidad de Caldas», «Coliseo El Pueblo». */
  sede?: string;
}

/** Limpia el nombre capturado, o lo descarta si no parece un lugar. */
function limpiarLugar(bruto: string): string | undefined {
  let nombre = bruto.trim().replace(/\s+/g, ' ').replace(/\s+(?:y|e|donde|que)$/i, '');
  while (CONECTOR_FINAL.test(nombre)) nombre = nombre.replace(CONECTOR_FINAL, '');
  if (NO_ES_LUGAR.test(nombre)) return undefined;

  // Las comunas se nombran por número —«comuna 13»— así que un nombre corto es válido
  // si es puramente numérico. Para los demás se exigen tres caracteres, que es lo que
  // separa un nombre de una preposición suelta.
  if (/^\d{1,3}$/.test(nombre)) return nombre;
  return nombre.length < 3 ? undefined : nombre;
}

/**
 * Aplica las reglas a un texto. Puro: sin red.
 *
 * Devuelve `undefined` si no reconoce ningún tipo de incidente — un titular sobre
 * donaciones o sobre el clima no tiene por qué producir nada. Puede devolver el tipo
 * **sin** lugar: saber que hubo un colapso en tal municipio ya es útil, aunque el
 * titular no diga en qué barrio.
 */
export function extraer(texto: string): Extraido | undefined {
  const tipo = REGLAS_TIPO.find((r) => r.patron.test(texto))?.tipo;
  if (!tipo) return undefined;

  let sede: string | undefined;
  for (const patron of SEDES) {
    const m = patron.exec(texto);
    sede = m?.[0] === undefined ? undefined : limpiarSede(m[0]);
    if (sede) break;
  }

  for (const { clase, patron } of CONECTORES) {
    const m = patron.exec(texto);
    const lugar = m?.[1] === undefined ? undefined : limpiarLugar(m[1]);
    if (lugar) return { tipo, clase, lugar, ...(sede ? { sede } : {}) };
  }

  return sede ? { tipo, sede } : { tipo };
}
