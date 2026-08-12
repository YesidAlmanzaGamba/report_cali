/**
 * Geocodificación de sedes de ayuda, con las revisiones que hacen que sea publicable.
 *
 * ## Por qué esto existe y por qué no es «llamar a un geocodificador»
 *
 * Una coordenada equivocada en este mapa no se ve equivocada: se ve como cualquier otro
 * punto, y manda a alguien con el carro lleno a un sitio donde no hay nadie. Ya pasó una
 * vez —la Ciudadela del Petronio quedó publicada a 2 km, en la Plaza de Toros— así que
 * el trabajo de este módulo no es *conseguir* una coordenada sino **rechazar** las que no
 * se sostienen.
 *
 * Las cuatro revisiones salen de errores reales, no de la imaginación:
 *
 * | Revisión | El error que atrapa |
 * |---|---|
 * | `esPreciso` | «Carrera 43 #6-120» devuelve la VÍA: un kilómetro de calle |
 * | `esPreciso` | «Barranquillita» devuelve el BARRIO, no el centro de acopio |
 * | `nombreCoincide` | Se pidió «Ciudadela del Petronio» y respondió otra cosa |
 * | `dispersion` | Varios resultados precisos repartidos: el nombre no distingue |
 * | `dentroDelMunicipio` | Un homónimo en otra ciudad — hay 400 universidades en el país |
 *
 * ## La revisión que de verdad importa, y por qué no es la que parecía
 *
 * El punto malo se publicó así: busqué «Ciudadela del Petronio», no salió nada, y
 * **sustituí el nombre a mano** por el del complejo que la contiene. Ese cambio fue el
 * error, no el geocodificador.
 *
 * La primera hipótesis fue que la culpa era de la ambigüedad —OpenStreetMap tiene tres
 * cosas llamadas «Alberto Galindo» repartidas en 2,2 km— y se llegó a montar una consulta
 * a la base cruda (Overpass) para detectarla. Se descartó por dos medidas:
 *
 * 1. Overpass no aguanta: buscar por expresión regular en toda una ciudad devolvió `504`
 *    en un espejo y se pasó de 130 s en el otro. No es una dependencia que se pueda poner
 *    en un cron cada 30 minutos.
 * 2. **No hacía falta.** El automatismo consulta el nombre **tal como salió del titular**
 *    y nunca lo sustituye. Con `nombreCoincide`, «Ciudadela del Petronio» se rechaza por
 *    no encontrarse — que es la respuesta correcta— en vez de convertirse en otro sitio.
 *
 * La regla general: cuando la revisión cara y la barata atrapan el mismo error, sobra la
 * cara.
 */

/** Un resultado de geocodificación, ya normalizado desde Nominatim o desde Overpass. */
export interface Candidato {
  lon: number;
  lat: number;
  /** `class`/`type` de OSM: `leisure/stadium`, `highway/tertiary`, `place/neighbourhood`… */
  clase: string;
  /** `place_rank` de Nominatim cuando existe. Mayor = más específico. */
  rango?: number;
  nombre: string;
}

export type Motivo =
  | 'ok'
  | 'sin_resultado'
  | 'impreciso'
  | 'otro_sitio'
  | 'ambiguo'
  | 'fuera_del_municipio';

export interface Veredicto {
  motivo: Motivo;
  lon?: number;
  lat?: number;
  /** Para el registro: qué se rechazó y por qué, en una línea legible. */
  detalle: string;
}

/**
 * Clases de OSM que SÍ son un lugar al que se puede llegar.
 *
 * La lista es blanca a propósito. Con lista negra habría que adivinar todo lo que puede
 * salir mal; con lista blanca, lo que no se reconoce se rechaza, que es el lado correcto
 * en el que equivocarse cuando el costo del error es mandar a alguien a otra parte.
 */
const CLASES_PRECISAS = new Set([
  'leisure',
  'amenity',
  'building',
  'office',
  'shop',
  'healthcare',
  'sport',
  'club',
  'emergency',
  'military',
  'tourism',
]);

/** `place` sirve solo para algunos tipos: una plazoleta es un lugar; un barrio no. */
const TIPOS_PLACE_ACEPTABLES = new Set(['square']);

/**
 * ¿El resultado es una sede concreta, o una calle o un barrio?
 *
 * `place_rank` de Nominatim: 30 es un edificio, 26 una vía, 24 un barrio. Se exige ≥ 25
 * *además* de la clase, porque las dos señales fallan por separado.
 */
export function esPreciso(c: Candidato): boolean {
  const [clase, tipo] = c.clase.split('/');
  if (clase === undefined) return false;
  if (c.rango !== undefined && c.rango < 25) return false;
  if (clase === 'place') return TIPOS_PLACE_ACEPTABLES.has(tipo ?? '');
  return CLASES_PRECISAS.has(clase);
}

/** Palabras que no distinguen un sitio de otro y por eso no cuentan al comparar nombres. */
const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'sede', 'centro']);

const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');

const tokens = (s: string): string[] =>
  normalizar(s)
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !VACIAS.has(t));

/**
 * ¿El sitio que devolvió OSM es el que se pidió?
 *
 * Se exige que **todas** las palabras distintivas de la consulta aparezcan en el nombre
 * del resultado. Es estricto a propósito, y funciona en los dos casos que importan:
 *
 * - «Estadio El Campín» ↔ «Estadio Nemesio Camacho El Campín» → pasa: el resultado puede
 *   ser más largo, mientras contenga lo que se pidió.
 * - «Ciudadela del Petronio» ↔ «Unidad Deportiva Alberto Galindo» → no pasa. Ese es el
 *   error real que se publicó.
 *
 * Si la consulta no deja ninguna palabra distintiva —«Coliseo», «Sede»— no hay nada que
 * comparar y se rechaza: un nombre así tampoco identifica un lugar.
 */
export function nombreCoincide(consulta: string, resultado: string): boolean {
  const pedidas = tokens(consulta);
  if (pedidas.length === 0) return false;
  const obtenidas = new Set(tokens(resultado));
  return pedidas.every((t) => obtenidas.has(t));
}

const METROS_POR_GRADO_LAT = 110540;
const metrosPorGradoLon = (lat: number): number =>
  111320 * Math.cos((lat * Math.PI) / 180);

/** Distancia aproximada en metros. A escala de ciudad, la aproximación plana sobra. */
export function distancia(a: Candidato, b: Candidato): number {
  const m = metrosPorGradoLon((a.lat + b.lat) / 2);
  return Math.hypot((a.lon - b.lon) * m, (a.lat - b.lat) * METROS_POR_GRADO_LAT);
}

/** La mayor separación entre los homónimos. Con menos de dos, no hay dispersión. */
export function dispersion(candidatos: Candidato[]): number {
  let max = 0;
  for (let i = 0; i < candidatos.length; i++)
    for (let j = i + 1; j < candidatos.length; j++)
      max = Math.max(max, distancia(candidatos[i]!, candidatos[j]!));
  return max;
}

/**
 * Cuánta separación se tolera entre homónimos antes de declarar el nombre ambiguo.
 *
 * 400 m es la escala de un complejo deportivo o un campus: varias sedes con el mismo
 * nombre repartidas por ahí siguen llevando a la persona al sitio correcto, que es lo que
 * importa. Los dos «Alberto Galindo» estaban a 2.246 m — otro barrio, otro trayecto.
 */
export const DISPERSION_MAXIMA_M = 400;

/**
 * El veredicto. `dentroDelMunicipio` se inyecta para no atar este módulo a los límites
 * ni a la lectura de disco: así se prueba sin red y sin TopoJSON.
 */
export function evaluar(
  nombre: string,
  candidatos: Candidato[],
  dentroDelMunicipio: (lon: number, lat: number) => boolean,
): Veredicto {
  if (candidatos.length === 0) return { motivo: 'sin_resultado', detalle: `«${nombre}»: nada` };

  const precisos = candidatos.filter(esPreciso);
  if (precisos.length === 0) {
    const c = candidatos[0]!;
    return {
      motivo: 'impreciso',
      detalle: `«${nombre}»: lo mejor que hay es ${c.clase}${
        c.rango === undefined ? '' : ` (rango ${c.rango})`
      }, que no es una sede`,
    };
  }

  const coincidentes = precisos.filter((c) => nombreCoincide(nombre, c.nombre));
  if (coincidentes.length === 0) {
    return {
      motivo: 'otro_sitio',
      detalle: `«${nombre}»: lo más parecido fue «${precisos[0]!.nombre}», que no es lo mismo`,
    };
  }

  const separacion = dispersion(coincidentes);
  if (separacion > DISPERSION_MAXIMA_M) {
    return {
      motivo: 'ambiguo',
      detalle: `«${nombre}»: ${coincidentes.length} sitios con ese nombre repartidos en ${Math.round(
        separacion,
      )} m`,
    };
  }

  const elegido = coincidentes[0]!;
  if (!dentroDelMunicipio(elegido.lon, elegido.lat)) {
    return {
      motivo: 'fuera_del_municipio',
      detalle: `«${nombre}»: cae fuera del municipio que dice la fuente`,
    };
  }

  return {
    motivo: 'ok',
    lon: elegido.lon,
    lat: elegido.lat,
    detalle: `«${nombre}»: ${elegido.clase}${
      elegido.rango === undefined ? '' : ` rango ${elegido.rango}`
    }`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de las dos fuentes
// ─────────────────────────────────────────────────────────────────────────────

interface CrudoNominatim {
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank?: number;
  display_name?: string;
  name?: string;
}

export function desdeNominatim(crudo: unknown): Candidato[] {
  if (!Array.isArray(crudo)) return [];
  return (crudo as CrudoNominatim[])
    .filter((r) => r && typeof r.lat === 'string' && typeof r.lon === 'string')
    .map((r) => ({
      lon: Number(r.lon),
      lat: Number(r.lat),
      clase: `${r.class}/${r.type}`,
      ...(typeof r.place_rank === 'number' ? { rango: r.place_rank } : {}),
      nombre: r.name ?? r.display_name?.split(',')[0] ?? '',
    }));
}

interface CrudoOverpass {
  elements?: {
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }[];
}

export function desdeOverpass(crudo: unknown): Candidato[] {
  const els = (crudo as CrudoOverpass)?.elements ?? [];
  return els
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat === undefined || lon === undefined) return undefined;
      const t = e.tags ?? {};
      // Overpass no trae `class`; se reconstruye desde la etiqueta que la define.
      const clave = (['leisure', 'amenity', 'building', 'office', 'shop', 'healthcare', 'tourism'] as const).find(
        (k) => t[k] !== undefined,
      );
      return {
        lon,
        lat,
        clase: clave === undefined ? 'desconocido/desconocido' : `${clave}/${t[clave]}`,
        nombre: t['name'] ?? '',
      };
    })
    .filter((c) => c !== undefined);
}
