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
 * Conectores de lugar. El grupo capturado es el nombre.
 *
 * Se exige **mayúscula inicial** en el nombre: «en el barrio Egipto» sí, «en el barrio
 * más afectado» no. Sin ese filtro, la mitad de las capturas serían adjetivos.
 *
 * El nombre se corta en 40 caracteres y en la primera coma o punto. Capturar de más es
 * peor que no capturar: una sugerencia con media frase pegada es ruido que alguien tiene
 * que limpiar a mano.
 */
export const CONECTORES: readonly { clase: string; patron: RegExp }[] = [
  { clase: 'barrio', patron: /\b(?:en|del|el)\s+barrio\s+([A-ZÁÉÍÓÚÑ][^,.;:]{2,40})/ },
  { clase: 'sector', patron: /\bsector\s+(?:de\s+)?([A-ZÁÉÍÓÚÑ][^,.;:]{2,40})/ },
  { clase: 'comuna', patron: /\bcomuna\s+([0-9]{1,2}|[A-ZÁÉÍÓÚÑ][^,.;:]{2,40})/ },
  { clase: 'vereda', patron: /\bvereda\s+([A-ZÁÉÍÓÚÑ][^,.;:]{2,40})/ },
  { clase: 'corregimiento', patron: /\bcorregimiento\s+(?:de\s+)?([A-ZÁÉÍÓÚÑ][^,.;:]{2,40})/ },
  // Se quitó el conector de «vía X». En la primera corrida sobre titulares reales fue el
  // único que produjo algo — y fue un falso positivo: «vía Quito-Lago Agrio», que es un
  // oleoducto en Ecuador. Un nombre de carretera describe el incidente, no la localidad,
  // y su tasa de error no compensa lo poco que aporta.
];

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
}

/** Limpia el nombre capturado, o lo descarta si no parece un lugar. */
function limpiarLugar(bruto: string): string | undefined {
  const nombre = bruto.trim().replace(/\s+/g, ' ').replace(/\s+(?:y|e|donde|que)$/i, '');
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

  for (const { clase, patron } of CONECTORES) {
    const m = patron.exec(texto);
    const lugar = m?.[1] === undefined ? undefined : limpiarLugar(m[1]);
    if (lugar) return { tipo, clase, lugar };
  }

  return { tipo };
}
