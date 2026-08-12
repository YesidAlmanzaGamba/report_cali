/**
 * Escala de intensidad Mercalli Modificada (MMI) del ShakeMap del USGS.
 *
 * **Estos colores son un estándar, no una decisión de diseño.** La guía general de
 * visualización pediría una rampa de un solo tono, y para un gráfico cualquiera tendría
 * razón. Aquí no: socorristas, Cruz Roja, Defensa Civil y el SGC leen esta escala todos
 * los días en los productos oficiales. Cambiarla por una más bonita rompería la
 * comparación con el ShakeMap del USGS justo cuando alguien necesita cruzar los dos.
 *
 * Lo que sí respetamos es la regla de fondo: **nunca identificar por color solamente.**
 * El grado en romanos aparece en la leyenda, en el tooltip y en la tabla.
 */
export interface MmiLevel {
  /** Grado entero (1–12). */
  degree: number;
  roman: string;
  color: string;
  /** Descripción de lo que se siente y del daño esperado. */
  label: string;
  /** Tinta legible sobre `color`. */
  ink: string;
}

export const MMI_LEVELS: readonly MmiLevel[] = [
  { degree: 1, roman: 'I', color: '#ffffff', ink: '#1a1a1a', label: 'No se siente' },
  { degree: 2, roman: 'II', color: '#c8d4f0', ink: '#1a1a1a', label: 'Apenas perceptible' },
  { degree: 3, roman: 'III', color: '#a0e6ff', ink: '#1a1a1a', label: 'Leve' },
  { degree: 4, roman: 'IV', color: '#80ffff', ink: '#1a1a1a', label: 'Moderado' },
  { degree: 5, roman: 'V', color: '#7aff93', ink: '#1a1a1a', label: 'Fuerte' },
  { degree: 6, roman: 'VI', color: '#ffff00', ink: '#1a1a1a', label: 'Muy fuerte — daño leve' },
  { degree: 7, roman: 'VII', color: '#ffc800', ink: '#1a1a1a', label: 'Severo — daño moderado' },
  { degree: 8, roman: 'VIII', color: '#ff9100', ink: '#1a1a1a', label: 'Violento — daño grave' },
  { degree: 9, roman: 'IX', color: '#ff0000', ink: '#ffffff', label: 'Extremo — daño muy grave' },
  { degree: 10, roman: 'X', color: '#c80000', ink: '#ffffff', label: 'Extremo — destrucción' },
  { degree: 11, roman: 'XI', color: '#a00000', ink: '#ffffff', label: 'Extremo — destrucción total' },
  { degree: 12, roman: 'XII', color: '#780000', ink: '#ffffff', label: 'Extremo — destrucción total' },
];

export function levelFor(mmi: number): MmiLevel {
  const degree = Math.min(12, Math.max(1, Math.round(mmi)));
  return MMI_LEVELS[degree - 1] ?? MMI_LEVELS[0]!;
}

/**
 * Paradas para la interpolación de color en MapLibre.
 * Se interpola de forma continua para que un municipio en 7.9 se vea distinto de uno
 * en 7.1: ambos son «VIII» al redondear, pero no sufrieron lo mismo.
 */
export function mmiColorStops(): (string | number)[] {
  return MMI_LEVELS.flatMap((level) => [level.degree, level.color]);
}

/** Grados que de verdad aparecen en estos datos, para no dibujar una leyenda de 12 filas. */
export function levelsPresent(values: number[]): MmiLevel[] {
  const degrees = new Set(values.map((v) => levelFor(v).degree));
  return MMI_LEVELS.filter((l) => degrees.has(l.degree));
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo «Gente expuesta»
// ─────────────────────────────────────────────────────────────────────────────

/** MMI a partir del cual se considera que el sacudimiento pudo causar daño. */
export const UMBRAL_DANINO = 6;

/**
 * Rampa para población: **un solo tono, de claro a oscuro**.
 *
 * A diferencia del MMI —donde la paleta multicolor del USGS es un estándar que los
 * socorristas ya leen (ADR-009)— aquí estamos midiendo una magnitud, y para magnitudes la
 * regla normal sí aplica: un tono, más oscuro cuanto más. Que las dos escalas se vean
 * completamente distintas **es la señal** de que miden cosas distintas; si se parecieran,
 * la gente creería que el mapa no cambió al cambiar de modo.
 */
export const RAMPA_POBLACION: readonly { desde: number; color: string; etiqueta: string }[] = [
  { desde: 0, color: '#f2e9e4', etiqueta: 'menos de 5 mil' },
  { desde: 5_000, color: '#dbc3bd', etiqueta: '5 mil' },
  { desde: 20_000, color: '#c39c98', etiqueta: '20 mil' },
  { desde: 50_000, color: '#a97674', etiqueta: '50 mil' },
  { desde: 150_000, color: '#8a5252', etiqueta: '150 mil' },
  { desde: 500_000, color: '#63302f', etiqueta: '500 mil o más' },
];

/**
 * Paradas para MapLibre, en escala logarítmica.
 *
 * Sin logaritmo, Cali con 2,3 millones aplastaría a todos los demás y el mapa quedaría en
 * un solo color con un punto oscuro. La población urbana se reparte así de desigual, y la
 * escala tiene que reconocerlo para que un municipio de 50 mil siga siendo distinguible.
 */
export function poblacionColorStops(): (string | number)[] {
  return RAMPA_POBLACION.flatMap((p) => [Math.log10(Math.max(1, p.desde || 1)), p.color]);
}
