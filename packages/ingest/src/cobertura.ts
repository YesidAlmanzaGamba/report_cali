/**
 * Registro de cobertura periodística por municipio.
 *
 * ## Qué responde, y por qué importa el reverso
 *
 * De frente responde «¿quién está informando sobre este municipio?». Al derecho sirve a
 * quien cura: dice dónde hay notas sin leer y de qué medio salieron.
 *
 * **Pero el reverso es lo que de verdad justifica el archivo: dice dónde NO hay nadie
 * mirando.** Un municipio golpeado del que ningún medio publicó nada no es un municipio
 * sin daños — es un municipio del que no sabemos. Esa distinción es la misma que sostiene
 * `CLAUDE.md` («distinguir sin dato de sin daño») y la que hace que un mapa de emergencia
 * no mande equipos al sitio equivocado.
 *
 * Hasta ahora esa ignorancia estaba implícita: se deducía mirando qué municipios no
 * aparecían en `candidatos.json`. Implícito quiere decir que nadie la mira. Aquí queda
 * contada, con nombre y con población.
 *
 * ## Cómo se construye
 *
 * No se declara: **se observa**. No hay una tabla escrita a mano de «qué medio cubre qué
 * municipio»; se cuenta lo que cada medio publicó de verdad y de ahí sale el mapa de
 * cobertura. Una tabla escrita a mano envejece el día que un diario cambia de sección;
 * esto se corrige solo en la siguiente corrida.
 *
 * ## Qué NO es
 *
 * No es una medida de daño ni un orden de prioridad para enviar recursos. Un municipio
 * puede tener veinte notas por ser capital y otro ninguna por ser pequeño y estar
 * incomunicado — y el segundo puede necesitar más ayuda. Es un mapa de **nuestra
 * información**, no del desastre.
 */

export interface MunicipioCobertura {
  pcode: string;
  name: string;
  admin1_name?: string;
  mmi?: number | null;
  poblacion?: number | null;
}

export interface NotaCandidata {
  pcode?: string;
  medio: string;
  publicado: string;
}

export interface MedioCobertura {
  nombre: string;
  notas: number;
  /** La más reciente de ese medio para este municipio. */
  ultima: string;
}

export interface CoberturaMunicipio {
  pcode: string;
  nombre: string;
  departamento?: string;
  mmi?: number | null;
  poblacion?: number | null;
  notas: number;
  ultima?: string;
  medios: MedioCobertura[];
}

export interface ResumenCobertura {
  municipios_considerados: number;
  con_notas: number;
  sin_notas: number;
  /**
   * Cuánta gente vive en los municipios golpeados de los que no tenemos ni una nota.
   *
   * Es la cifra que mejor resume el hueco, y por eso va en el resumen y no enterrada en
   * la lista: «no sabemos nada de N personas» se entiende sin abrir el archivo.
   */
  poblacion_sin_notas: number;
  medios_distintos: number;
}

export interface Cobertura {
  generado: string;
  umbral_mmi: number;
  nota: string;
  resumen: ResumenCobertura;
  municipios: CoberturaMunicipio[];
}

/** Umbral donde empieza el daño, el mismo que usa el mapa para «gente expuesta». */
export const UMBRAL_COBERTURA = 6;

const NOTA =
  'Qué medios han publicado sobre cada municipio golpeado, contado a partir de las notas ' +
  'recogidas. Un municipio con cero notas NO es un municipio sin daños: es uno del que no ' +
  'tenemos información. No es una medida de daño ni un orden de prioridad.';

/**
 * Cruza los municipios con las notas recogidas. Pura: sin red ni disco.
 *
 * Entran los municipios que superan el umbral de daño **y además** cualquiera con notas,
 * aunque haya temblado poco: si la prensa habla de él, quien cura necesita verlo. Lo que
 * queda fuera son los ~900 municipios sin sacudimiento relevante y sin una sola mención,
 * que no aportarían más que peso.
 */
export function construirCobertura(
  municipios: MunicipioCobertura[],
  candidatos: NotaCandidata[],
  opciones: { umbralMmi?: number; ahora?: Date } = {},
): Cobertura {
  const umbral = opciones.umbralMmi ?? UMBRAL_COBERTURA;
  const ahora = opciones.ahora ?? new Date();

  /** pcode → medio → { notas, ultima } */
  const porMunicipio = new Map<string, Map<string, { notas: number; ultima: string }>>();

  for (const nota of candidatos) {
    if (!nota.pcode) continue;
    const fecha = Date.parse(nota.publicado);
    if (Number.isNaN(fecha)) continue;

    const medios = porMunicipio.get(nota.pcode) ?? new Map();
    porMunicipio.set(nota.pcode, medios);

    const previo = medios.get(nota.medio);
    if (previo) {
      previo.notas += 1;
      if (fecha > Date.parse(previo.ultima)) previo.ultima = nota.publicado;
    } else {
      medios.set(nota.medio, { notas: 1, ultima: nota.publicado });
    }
  }

  const considerados = municipios.filter(
    (m) => (typeof m.mmi === 'number' && m.mmi >= umbral) || porMunicipio.has(m.pcode),
  );

  const filas: CoberturaMunicipio[] = considerados.map((m) => {
    const medios = [...(porMunicipio.get(m.pcode) ?? new Map())]
      .map(([nombre, v]) => ({ nombre, notas: v.notas, ultima: v.ultima }))
      // Más notas primero; a igualdad, el que publicó más recientemente.
      .sort((a, b) => b.notas - a.notas || Date.parse(b.ultima) - Date.parse(a.ultima));

    const notas = medios.reduce((n, x) => n + x.notas, 0);
    const ultima = medios.reduce<string | undefined>(
      (max, x) => (max === undefined || Date.parse(x.ultima) > Date.parse(max) ? x.ultima : max),
      undefined,
    );

    return {
      pcode: m.pcode,
      nombre: m.name,
      ...(m.admin1_name !== undefined ? { departamento: m.admin1_name } : {}),
      ...(m.mmi !== undefined ? { mmi: m.mmi } : {}),
      ...(m.poblacion !== undefined ? { poblacion: m.poblacion } : {}),
      notas,
      ...(ultima !== undefined ? { ultima } : {}),
      medios,
    };
  });

  // Por intensidad descendente: es el orden en que alguien recorrería la lista buscando
  // el hueco más grave, que es para lo que existe el archivo.
  filas.sort((a, b) => (b.mmi ?? 0) - (a.mmi ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));

  const sinNotas = filas.filter((f) => f.notas === 0);
  const mediosDistintos = new Set(filas.flatMap((f) => f.medios.map((x) => x.nombre)));

  return {
    generado: ahora.toISOString(),
    umbral_mmi: umbral,
    nota: NOTA,
    resumen: {
      municipios_considerados: filas.length,
      con_notas: filas.length - sinNotas.length,
      sin_notas: sinNotas.length,
      poblacion_sin_notas: sinNotas.reduce((n, f) => n + (f.poblacion ?? 0), 0),
      medios_distintos: mediosDistintos.size,
    },
    municipios: filas,
  };
}
