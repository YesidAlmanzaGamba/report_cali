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
