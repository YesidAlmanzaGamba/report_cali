/**
 * Puntos de ayuda: centros de acopio, albergues, puestos médicos.
 *
 * **La política es la contraria a la de `incidentes.ts`, y conviene tenerlo presente
 * porque los dos módulos se parecen mucho.**
 *
 * | | `incidentes` | `ayuda` (esto) |
 * |---|---|---|
 * | Precisión | rejilla de 100 m salvo verificado (ADR-012) | **exacta, siempre** |
 * | Objetivo | saber qué pasó y dónde | **que alguien llegue** |
 * | Riesgo | señalar casas vacías atrae saqueo | ninguno: ser encontrable ES el punto |
 *
 * Un punto de daño se difumina a propósito. Un centro de acopio se publica con
 * dirección, horario y enlace de navegación, porque la pregunta que responde es «tengo
 * mercado en el carro, ¿a dónde lo llevo?».
 *
 * Por eso también se aceptan puntos **fuera de la zona del sismo**: buena parte de los
 * centros de acopio están en Bogotá, y hasta en Ecuador o México. Ahí es donde está quien
 * quiere donar.
 */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { AYUDA_FILE } from './paths.js';
import { IsoDateTimeSchema, PcodeSchema, SourceSchema } from './schema.js';

export const TIPOS_AYUDA = [
  'centro_acopio',
  'albergue',
  'puesto_medico',
  'punto_hidratacion',
  'brigada',
] as const;

export const TipoAyudaSchema = z.enum(TIPOS_AYUDA);
export type TipoAyuda = z.infer<typeof TipoAyudaSchema>;

const PuntoSchema = z
  .object({
    tipo: TipoAyudaSchema,
    /** Nombre del lugar tal como lo conoce la gente: «Coliseo El Pueblo». */
    nombre: z.string().min(3).max(120),
    /** Municipio. Puede estar lejos del sismo: los donantes están en otras ciudades. */
    pcode: PcodeSchema,
    longitud: z.number().gte(-82).lte(-66),
    latitud: z.number().gte(-4.3).lte(13.5),
    /** Dirección legible, para quien prefiere leerla a seguir el mapa. */
    direccion: z.string().max(160).optional(),
    /** Horario tal como lo publica la fuente: «8:00 a. m. a 6:00 p. m.». */
    horario: z.string().max(80).optional(),
    /**
     * Qué se necesita ahí. Es el dato que evita que lleguen diez camiones de ropa y
     * ningún litro de agua.
     */
    necesita: z.array(z.string().max(60)).max(12).optional(),
    /**
     * Teléfono **solo si la fuente oficial lo publicó**. Nunca inventado ni deducido:
     * un número equivocado en una emergencia manda a alguien a ninguna parte.
     */
    telefono: z.string().max(40).optional(),
    source: SourceSchema,
    observed_at: IsoDateTimeSchema,
    /** `true` cuando alguien confirmó que sigue operando. */
    activo: z.boolean().default(true),
  })
  .strict();

const ArchivoSchema = z.object({ puntos: z.array(PuntoSchema) });

export type PuntoAyuda = z.infer<typeof PuntoSchema>;

export class AyudaError extends Error {
  constructor(issues: string[]) {
    super(
      `El archivo curated/ayuda.json tiene errores:\n` + issues.map((i) => `  · ${i}`).join('\n'),
    );
    this.name = 'AyudaError';
  }
}

/**
 * Enlace de navegación.
 *
 * Se usa la URL universal de Google Maps y no un esquema `geo:` porque tiene que
 * funcionar en los tres sitios donde se va a tocar: el celular de quien va a llevar la
 * donación, el computador de quien coordina, y el navegador de escritorio de quien arma
 * la lista. `geo:` no abre nada en un escritorio.
 *
 * No lleva clave de API ni rastrea nada: es una URL de búsqueda.
 */
export function enlaceMapa(longitud: number, latitud: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}`;
}

/**
 * Enlace de **búsqueda** por nombre, para la persona que cura los datos.
 *
 * Esto no se publica en el mapa: es la herramienta de quien convierte un titular en un
 * punto. No podemos geocodificar automáticamente sin inventar precisión —«Universidad de
 * Caldas» puede ser cualquiera de sus cinco sedes—, pero sí podemos dejar la búsqueda
 * armada para que ubicarla sea un clic y un clic derecho sobre el mapa.
 *
 * Ese es el punto medio honesto: la máquina no adivina la coordenada, pero tampoco deja
 * el trabajo entero a mano.
 */
export function enlaceBusqueda(consulta: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

export interface PuntoPublicado extends PuntoAyuda {
  /** Enlace «cómo llegar», precalculado para que la interfaz no arme URLs. */
  como_llegar: string;
}

/** Añade el enlace de navegación. Puro: sin red ni disco. */
export function publicar(puntos: PuntoAyuda[]): PuntoPublicado[] {
  return puntos
    .filter((p) => p.activo)
    .map((p) => ({ ...p, como_llegar: enlaceMapa(p.longitud, p.latitud) }));
}

/** GeoJSON para el mapa. */
export function aGeoJson(puntos: PuntoPublicado[]): unknown {
  return {
    type: 'FeatureCollection',
    features: puntos.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitud, p.latitud] },
      properties: {
        tipo: p.tipo,
        nombre: p.nombre,
        pcode: p.pcode,
        direccion: p.direccion ?? '',
        horario: p.horario ?? '',
        necesita: (p.necesita ?? []).join(', '),
        telefono: p.telefono ?? '',
        como_llegar: p.como_llegar,
        fuente: p.source.name,
        fuente_url: p.source.url,
        observado: p.observed_at,
      },
    })),
  };
}

export async function cargarAyuda(): Promise<PuntoAyuda[]> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(await readFile(AYUDA_FILE, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new AyudaError([`No se pudo leer el archivo: ${(error as Error).message}`]);
  }

  const parsed = ArchivoSchema.safeParse(crudo);
  if (!parsed.success) {
    throw new AyudaError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
  }

  return parsed.data.puntos;
}
