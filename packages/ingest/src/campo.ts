/**
 * Importador de recolección en campo.
 *
 * ## Por qué existe
 *
 * El registro de cobertura midió el techo del proyecto: de **228 municipios golpeados,
 * 179 no tienen ni una nota de prensa** — 5,6 millones de personas. Cartago, con MMI 8 y
 * 142.255 habitantes, tiene cero. Se buscaron gacetas oficiales y no las hay legibles por
 * máquina.
 *
 * Ninguna mejora del emparejamiento crea fuentes donde no existen. **Lo único que llega a
 * un municipio de 7.000 habitantes es alguien parado ahí, o alguien oyendo su emisora.**
 * Este módulo es el puente entre esa persona y el mapa.
 *
 * ## El principio: Drive es el cuaderno, `curated/` es el registro
 *
 * Se captura en una hoja de cálculo —cómodo desde un teléfono, en la calle— y este
 * importador la traduce. **No lee Drive**: la ingesta corre en GitHub Actions sin
 * credenciales de Google, y un documento de Drive se edita sin dejar rastro auditable,
 * que es justo lo que ADR-004 le pide al historial de git. Se exporta a CSV y se importa.
 *
 * ## Propone, no publica
 *
 * Escribe a `curated/incidentes.sugeridos.json`, **nunca** a `curated/incidentes.json`.
 * Una persona revisa, mueve lo bueno y hace commit; el commit es el acto de publicación y
 * queda auditable. Mismo patrón que `fuentes/extraidos.json` y las sedes geocodificadas.
 *
 * ## Y no afloja ADR-012
 *
 * Todo sale con `verificado: false`, así que `publicables()` recorta a la rejilla de
 * 100 m antes de escribir nada en `data/`. Un mapa público y preciso de edificaciones
 * colapsadas es una lista de objetivos para saqueo — y eso no cambia porque quien lo
 * reportó estuviera ahí. La coordenada exacta se queda en `curated/`, que no se publica.
 */
import { z } from 'zod';

import { TipoIncidenteSchema, type TipoIncidente } from './incidentes.js';
import { municipiosEn, type MunicipioRef } from './sources/noticias.js';

/** Colombia está toda en UTC−5 y no aplica horario de verano. */
const ZONA_COLOMBIA = '-05:00';

// ─────────────────────────────────────────────────────────────────────────────
// Coordenadas
// ─────────────────────────────────────────────────────────────────────────────

export interface Coordenada {
  lon: number;
  lat: number;
}

export class CoordenadaIlegible extends Error {}

/**
 * Saca `[lon, lat]` de lo que una persona pega en la casilla «dónde».
 *
 * Acepta las formas que Google Maps produce de verdad al copiar un enlace:
 *
 * - `https://www.google.com/maps/@4.5709,-76.1934,17z` — el centro del mapa
 * - `https://maps.google.com/?q=4.5709,-76.1934` — un punto marcado
 * - `…/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d4.5709!4d-76.1934` — una ficha de lugar
 * - `4.5709, -76.1934` — escrito a mano
 *
 * **Los enlaces cortos `maps.app.goo.gl` se rechazan a propósito.** Resolverlos exige una
 * petición de red y seguir una redirección, y este módulo tiene que poder correr sin red
 * para ser probable. Pero el motivo de fondo es otro: una coordenada mal resuelta manda a
 * un equipo al sitio equivocado, y fallar ruidosamente es mejor que acertar a veces.
 *
 * El orden de los números importa y es la trampa clásica: Google escribe **lat,lon** y
 * GeoJSON quiere **lon,lat**. Aquí se invierte una sola vez, en este sitio.
 */
export function coordenadaDe(texto: string): Coordenada {
  const t = texto.trim();
  if (!t) throw new CoordenadaIlegible('la casilla «donde» está vacía');

  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(t)) {
    throw new CoordenadaIlegible(
      'es un enlace corto de Google Maps y no se resuelve sin red. Ábrelo en el navegador ' +
        'y pega el enlace largo, o escribe «latitud, longitud».',
    );
  }

  const patrones = [
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, //  /@lat,lon,zoom
    /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, //  ?q=lat,lon
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, //  !3dlat!4dlon
    /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/, //  escrito a mano
  ];

  for (const patron of patrones) {
    const m = patron.exec(t);
    if (!m) continue;

    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    // Los mismos límites del esquema de incidentes: si cae fuera de Colombia, casi
    // siempre es que venían invertidos.
    if (lat < -4.3 || lat > 13.5 || lon < -82 || lon > -66) {
      throw new CoordenadaIlegible(
        `el punto (${lat}, ${lon}) cae fuera de Colombia. Google escribe «latitud, longitud»; ` +
          'comprueba que no estén al revés.',
      );
    }

    return { lon, lat };
  }

  throw new CoordenadaIlegible(
    'no se reconoce como coordenada. Pega el enlace largo de Google Maps o escribe ' +
      '«latitud, longitud», por ejemplo «4.5709, -76.1934».',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fecha
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte lo que se escribe en la casilla «cuando» a un instante con zona.
 *
 * Quien anota en campo escribe hora local y no va a teclear `-05:00`. Se lo ponemos, que
 * es lo correcto en Colombia y evita el error silencioso de cinco horas que ya apareció
 * con el CMS de gov.co. Si la persona sí escribió una zona, se respeta.
 */
export function fechaLocalDe(texto: string): string {
  const t = texto.trim();
  if (!t) throw new Error('la casilla «cuando» está vacía');

  const conZona = /(Z|[+-]\d{2}:?\d{2})$/.test(t);
  const iso = conZona ? t.replace(' ', 'T') : `${t.replace(' ', 'T')}${ZONA_COLOMBIA}`;

  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`«${texto}» no es una fecha. Escribe «2026-08-12 15:20».`);
  }

  return new Date(ms).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lector de CSV con lo justo: comillas dobles, comas dentro de comillas y saltos de línea
 * dentro de comillas. No es una librería de CSV y no pretende serlo — es lo que exporta
 * una hoja de cálculo, ni más ni menos, y ADR-011 pide no añadir dependencias que no
 * paguen su peso.
 */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let enComillas = false;

  const sinBom = texto.replace(/^﻿/, '');

  for (let i = 0; i < sinBom.length; i++) {
    const c = sinBom[i];

    if (enComillas) {
      if (c === '"') {
        if (sinBom[i + 1] === '"') {
          celda += '"';
          i++;
        } else enComillas = false;
      } else celda += c;
      continue;
    }

    if (c === '"') enComillas = true;
    else if (c === ',') {
      fila.push(celda);
      celda = '';
    } else if (c === '\n') {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else if (c !== '\r') celda += c;
  }

  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

/** Columnas que espera la hoja. Se comparan sin tildes ni mayúsculas. */
export const COLUMNAS = ['cuando', 'donde', 'municipio', 'que', 'descripcion', 'fuente', 'foto'] as const;

const sinTildes = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Cabecera → índice de columna, tolerando tildes, mayúsculas y espacios. */
export function mapaDeColumnas(cabecera: string[]): Map<string, number> {
  const mapa = new Map<string, number>();
  cabecera.forEach((nombre, i) => mapa.set(sinTildes(nombre), i));
  return mapa;
}

// ─────────────────────────────────────────────────────────────────────────────
// Traducción a incidentes sugeridos
// ─────────────────────────────────────────────────────────────────────────────

export interface Sugerencia {
  tipo: TipoIncidente;
  pcode: string;
  longitud: number;
  latitud: number;
  descripcion: string;
  source: { name: string; type: 'unverified'; detalle: string };
  observed_at: string;
  verificado: false;
  /** Enlace de la foto, para quien revisa. **No se publica**: se queda en `curated/`. */
  foto?: string;
  /** Discrepancia entre el municipio declarado y dónde cae el punto. */
  revisar?: string;
}

export interface Rechazo {
  fila: number;
  motivo: string;
  contenido: string;
}

export interface ResultadoImportacion {
  sugerencias: Sugerencia[];
  rechazos: Rechazo[];
}

export interface OpcionesImportacion {
  municipios: MunicipioRef[];
  /** Comprueba si un punto cae dentro del municipio. Opcional: solo sirve para avisar. */
  dentroDe?: (pcode: string, lon: number, lat: number) => boolean;
}

/**
 * Resuelve el municipio de una fila.
 *
 * Reutiliza `municipiosEn()` de `sources/noticias.ts`, que ya trae las defensas contra
 * homónimos y contra nombres que coinciden con un departamento o con el país. Se pasa la
 * longitud mínima en 4 porque aquí la persona escribió el nombre a propósito: no es
 * emparejar prosa, es leer una casilla, así que «Tadó» o «Sipí» no son ambiguos.
 */
export function municipioDeFila(
  nombre: string,
  municipios: MunicipioRef[],
): MunicipioRef | undefined {
  const escrito = nombre.trim();
  if (!escrito) return undefined;

  // Se capitaliza porque `municipiosEn` exige mayúscula inicial, su defensa contra «la
  // paz» en prosa corriente. En una casilla escrita a mano esa distinción no aplica.
  const capitalizado = escrito.replace(/(^|\s)(\p{L})/gu, (_, s: string, l: string) => s + l.toUpperCase());

  const encontrados = municipiosEn(capitalizado, municipios, undefined, 4);
  if (encontrados.length === 0) return undefined;

  return encontrados.reduce((mejor, m) => (m.name.length > mejor.name.length ? m : mejor));
}

/**
 * Parte la casilla «fuente» en un nombre corto y el detalle completo.
 *
 * La hoja tiene una sola casilla porque pedirle dos a alguien que escribe en la calle es
 * pedirle demasiado. Pero la interfaz necesita una etiqueta corta: «Radio Versalles» cabe
 * en una ficha, «Radio Versalles, boletín de las 14:00 del 12 de agosto» no.
 *
 * Se corta en la primera coma, que es donde la gente separa naturalmente el quién del
 * cuándo. Si no hay coma, el nombre se recorta y el detalle conserva todo — nunca se
 * pierde información, solo se acorta la etiqueta.
 */
export function nombreYDetalleDe(fuente: string): {
  name: string;
  type: 'unverified';
  detalle: string;
} {
  const completo = fuente.trim();
  const coma = completo.indexOf(',');
  const corto = coma > 0 ? completo.slice(0, coma).trim() : completo;

  return {
    name: corto.length > 60 ? `${corto.slice(0, 57)}…` : corto,
    type: 'unverified',
    detalle: completo,
  };
}

const FilaSchema = z.object({
  cuando: z.string().min(1),
  donde: z.string().min(1),
  municipio: z.string(),
  que: z.string().min(1),
  descripcion: z.string().min(1).max(280),
  fuente: z.string().min(10).max(200),
  foto: z.string().optional(),
});

/**
 * Traduce las filas de la hoja a incidentes sugeridos.
 *
 * Cada fila se valida entera y, si algo falla, **se rechaza con el número de fila y el
 * motivo** en vez de descartarse en silencio. Quien captura en la calle necesita saber
 * qué fila arreglar, no que «se importaron 7 de 9».
 */
export function aSugerencias(
  filas: string[][],
  opciones: OpcionesImportacion,
): ResultadoImportacion {
  const sugerencias: Sugerencia[] = [];
  const rechazos: Rechazo[] = [];

  const [cabecera, ...cuerpo] = filas;
  if (!cabecera) return { sugerencias, rechazos };

  const col = mapaDeColumnas(cabecera);
  const faltantes = COLUMNAS.filter((c) => c !== 'foto' && !col.has(c));
  if (faltantes.length > 0) {
    rechazos.push({
      fila: 1,
      motivo: `a la hoja le faltan columnas: ${faltantes.join(', ')}`,
      contenido: cabecera.join(', '),
    });
    return { sugerencias, rechazos };
  }

  const dame = (fila: string[], nombre: string): string => {
    const i = col.get(nombre);
    return i === undefined ? '' : (fila[i] ?? '').trim();
  };

  cuerpo.forEach((fila, i) => {
    // +2: la cabecera es la fila 1 y las hojas de cálculo cuentan desde 1.
    const numero = i + 2;
    const crudo = fila.join(' | ').slice(0, 120);

    const rechazar = (motivo: string): void => {
      rechazos.push({ fila: numero, motivo, contenido: crudo });
    };

    const analisis = FilaSchema.safeParse({
      cuando: dame(fila, 'cuando'),
      donde: dame(fila, 'donde'),
      municipio: dame(fila, 'municipio'),
      que: dame(fila, 'que'),
      descripcion: dame(fila, 'descripcion'),
      fuente: dame(fila, 'fuente'),
      foto: dame(fila, 'foto') || undefined,
    });

    if (!analisis.success) {
      const falla = analisis.error.issues[0];
      const campo = falla?.path.join('.') ?? 'la fila';
      rechazar(
        campo === 'fuente'
          ? 'la casilla «fuente» necesita al menos 10 caracteres: di la emisora y la hora, ' +
              'o «observación propia en el sitio». Es lo único que hace comprobable el dato.'
          : `${campo}: ${falla?.message ?? 'no es válido'}`,
      );
      return;
    }
    const datos = analisis.data;

    const tipo = TipoIncidenteSchema.safeParse(sinTildes(datos.que).replace(/\s+/g, '_'));
    if (!tipo.success) {
      rechazar(`«${datos.que}» no es un tipo. Usa uno de: ${TipoIncidenteSchema.options.join(', ')}`);
      return;
    }

    let punto: Coordenada;
    try {
      punto = coordenadaDe(datos.donde);
    } catch (error) {
      rechazar(error instanceof Error ? error.message : 'coordenada ilegible');
      return;
    }

    let observado: string;
    try {
      observado = fechaLocalDe(datos.cuando);
    } catch (error) {
      rechazar(error instanceof Error ? error.message : 'fecha ilegible');
      return;
    }

    const municipio = municipioDeFila(datos.municipio, opciones.municipios);
    if (!municipio) {
      rechazar(
        datos.municipio
          ? `no se reconoce el municipio «${datos.municipio}»`
          : 'falta el municipio, y sin él el incidente no se puede agrupar',
      );
      return;
    }

    /**
     * El punto contra el municipio declarado. **Solo avisa, no decide.**
     *
     * `CLAUDE.md` documenta que los límites de `data/` están simplificados y mienten
     * cerca de un borde: la sede de la Cruz Roja de Caldas cae 549 m dentro del polígono
     * de Villamaría y está en Manizales. Quien estuvo en el sitio sabe mejor que un
     * polígono recortado, así que manda lo que escribió y se marca para revisar.
     */
    const dentro = opciones.dentroDe?.(municipio.pcode, punto.lon, punto.lat);
    const revisar =
      dentro === false
        ? `el punto no cae dentro de ${municipio.name} según los límites simplificados. ` +
          'Puede ser un borde mal recortado o un municipio equivocado — compruébalo.'
        : undefined;

    sugerencias.push({
      tipo: tipo.data,
      pcode: municipio.pcode,
      longitud: punto.lon,
      latitud: punto.lat,
      descripcion: datos.descripcion,
      source: nombreYDetalleDe(datos.fuente),
      observed_at: observado,
      verificado: false,
      ...(datos.foto ? { foto: datos.foto } : {}),
      ...(revisar ? { revisar } : {}),
    });
  });

  return { sugerencias, rechazos };
}
