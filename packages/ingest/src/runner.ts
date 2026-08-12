/**
 * Pipeline de ingesta. Lo corre el cron cada 15 minutos.
 *
 *   npm run ingest
 *
 * Cada fuente se ejecuta aislada: si una se cae, las demás siguen. En emergencia los
 * servidores oficiales se caen a ratos, y perder el sismo del USGS porque ReliefWeb
 * devolvió 503 sería absurdo. Al final se reporta todo y se sale con código distinto de
 * cero si algo falló, para que la corrida quede marcada en rojo sin haber bloqueado
 * los datos que sí se pudieron traer.
 */
import { readFile } from 'node:fs/promises';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { FeatureCollection, Geometry } from 'geojson';

import { loadCuratedObservations } from './curated.js';
import { mmiToCsv, observacionesToCsv } from './export.js';
import { aGeoJson, cargarIncidentes, porMunicipio, publicables } from './incidentes.js';
import {
  conPoblacion,
  genteExpuesta,
  joinMmiToMunicipios,
  MMI_UMBRAL_DANINO,
  type MunicipioMmi,
} from './join/mmi.js';
import { POBLACION_SOURCE, fetchPoblacion } from './sources/poblacion.js';
import { DATA_DIR } from './paths.js';
import { writeBinary, writeDataset, writeGeoJson, writeJson, writeText } from './persist.js';
import type { Observation } from './schema.js';
import {
  DESLIZAMIENTOS_SOURCE,
  fetchImagenDeslizamiento,
  observacionesDeslizamiento,
  parsearDeslizamientos,
} from './sources/deslizamientos.js';
import {
  aGeoJson as aGeoJsonAyuda,
  cargarAyuda,
  desdeGeocodificacion,
  enlaceBusqueda,
  publicar,
} from './ayuda.js';
import { CACHE_PATH, geocodificarPendientes, leerCache } from './sources/osm.js';
import { extraer } from './extraccion/reglas.js';
import { fetchJson } from './http.js';
import { recolectarNoticias } from './sources/noticias.js';
import { fetchUngrdSeismic } from './sources/ungrd.js';
import {
  topologyToFeatures,
  type MunicipioProperties,
  type SimplifiedTopology,
} from './sources/codab.js';
import {
  EVENT_URL,
  USGS_SOURCE,
  fetchAftershocks,
  fetchMmiGrid,
  parseEvent,
  type EarthquakeEvent,
} from './sources/usgs.js';

interface StepResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: StepResult[] = [];

async function step(name: string, run: () => Promise<string>): Promise<boolean> {
  process.stdout.write(`· ${name}… `);
  try {
    const detail = await run();
    console.log(detail);
    results.push({ name, ok: true, detail });
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log('FALLÓ');
    console.error(`  ${detail.split('\n').join('\n  ')}`);
    results.push({ name, ok: false, detail });
    return false;
  }
}

/**
 * Los límites se guardan en TopoJSON —es lo que sirve el navegador— y aquí se
 * expanden a GeoJSON en memoria para poder cruzarlos con la malla de intensidad.
 * Un solo archivo canónico, sin copias que puedan desincronizarse.
 */
async function loadMunicipios(): Promise<FeatureCollection<Geometry, MunicipioProperties>> {
  const path = `${DATA_DIR}/boundaries/municipios.topojson`;

  let topo: SimplifiedTopology;
  try {
    topo = JSON.parse(await readFile(path, 'utf8')) as SimplifiedTopology;
  } catch {
    throw new Error(
      `No se encontraron los límites municipales en ${path}.\n` +
        `Ejecuta primero:  npm run boundaries --workspace=@report-cali/ingest`,
    );
  }

  return topologyToFeatures<MunicipioProperties>(topo);
}

async function main(): Promise<void> {
  console.log('Ingesta — mapa de situación terremoto Colombia 2026\n');

  let event: EarthquakeEvent | undefined;
  // Se guardan para la exportación final, que necesita ambos conjuntos a la vez.
  let mmiPorMunicipio: MunicipioMmi[] = [];
  let observaciones: Observation[] = [];
  // El JSON crudo del evento: los productos secundarios (deslizamientos) viven ahí y
  // `parseEvent` no los conserva.
  let crudoEvento: unknown;
  // Se llenan en el paso de deslizamientos, que corre ANTES que el de cifras para que
  // entren en el mismo dataset. Si se escribieran después, no se guardarían.
  let obsDeslizamiento: Observation[] = [];

  await step('Evento USGS', async () => {
    crudoEvento = await fetchJson(EVENT_URL);
    event = parseEvent(crudoEvento);
    const written = await writeJson(DATA_DIR, 'event/event', {
      ...event,
      source: USGS_SOURCE,
      ingested_at: new Date().toISOString(),
    });
    return `M${event.magnitude}, ${event.depthKm} km, alerta ${event.alert ?? 'n/d'} ${
      written.changed ? '(escrito)' : '(sin cambios)'
    }`;
  });

  if (event) {
    const currentEvent = event;

    await step('Intensidad MMI por municipio', async () => {
      const [grid, municipios] = await Promise.all([
        fetchMmiGrid(currentEvent),
        loadMunicipios(),
      ]);

      const joined = joinMmiToMunicipios(grid, municipios);
      if (joined.length === 0) {
        throw new Error('El cruce MMI × municipios no produjo ningún resultado');
      }
      // La población entra aquí y no en un paso propio: si su fuente falla, el mapa de
      // intensidad —que es la capa principal— tiene que seguir saliendo igual.
      const conPob = await fetchPoblacion()
        .then((p) => conPoblacion(joined, p))
        .catch((error: unknown) => {
          console.warn(`\n  (población no disponible: ${(error as Error).message})`);
          return joined;
        });

      mmiPorMunicipio = conPob;

      const expuesta = genteExpuesta(conPob);

      const written = await writeJson(DATA_DIR, 'event/mmi-by-municipality', {
        source: USGS_SOURCE,
        poblacion_source: POBLACION_SOURCE,
        generated_at: new Date().toISOString(),
        event_id: currentEvent.id,
        shakemap_url: currentEvent.shakemapBaseUrl,
        municipality_count: conPob.length,
        // Cuánta gente vive donde el sacudimiento alcanzó el umbral de daño. No es un
        // índice: es un conteo, y por eso se puede explicar en una frase.
        gente_expuesta: expuesta,
        umbral_mmi: MMI_UMBRAL_DANINO,
        municipalities: conPob,
      });

      const top = conPob[0];
      return `${conPob.length} municipios, máximo ${top?.mmi} (${top?.mmi_roman}) en ${
        top?.name
      } · ${expuesta.total.toLocaleString('es-CO')} personas expuestas ${
        written.changed ? '(escrito)' : '(sin cambios)'
      }`;
    });

    // Va ANTES de las cifras a propósito: aporta una observación (personas expuestas a
    // deslizamiento) que tiene que entrar en el mismo dataset. Si corriera después, se
    // calcularía sobre un archivo ya escrito y no se guardaría.
    await step('Deslizamientos', async () => {
      const datos = parsearDeslizamientos(crudoEvento);
      if (!datos) return 'el evento no trae modelo de deslizamiento';

      // La imagen se guarda con nosotros en vez de enlazarla en caliente: mismo criterio
      // que ADR-010, no depender de un servidor ajeno justo cuando más se consulta.
      const imagen = await fetchImagenDeslizamiento(datos.url);
      await writeBinary(DATA_DIR, 'event/deslizamientos.png', imagen);

      const written = await writeJson(DATA_DIR, 'event/deslizamientos', {
        imagen: 'event/deslizamientos.png',
        esquinas: datos.esquinas,
        alerta: datos.alerta,
        amenaza: datos.amenaza,
        poblacion_expuesta: datos.poblacion_expuesta,
        modelo: datos.modelo,
        fuente: DESLIZAMIENTOS_SOURCE,
        nota: 'Probabilidad de deslizamiento del USGS. En terreno montañoso se lee como riesgo de acceso vial.',
      });

      obsDeslizamiento = observacionesDeslizamiento(datos, currentEvent);

      return `alerta ${datos.alerta ?? 'n/d'}, ${
        datos.poblacion_expuesta?.toLocaleString('es-CO') ?? '?'
      } personas expuestas ${written.changed ? '(escrito)' : '(sin cambios)'}`;
    });

    await step('Cifras oficiales y de prensa', async () => {
      // Tres orígenes con el mismo destino. La UNGRD hoy devuelve cero filas porque sus
      // datos abiertos llegan hasta 2024; queda consultando para que el día que publiquen
      // 2026 esto se llene solo, sin que nadie tenga que acordarse.
      const [curadas, ungrd] = await Promise.all([
        loadCuratedObservations(),
        fetchUngrdSeismic(currentEvent.originTime).catch((error: unknown) => {
          console.warn(`\n  (UNGRD no respondió: ${(error as Error).message})`);
          return [] as Observation[];
        }),
      ]);

      const todas = [...curadas, ...ungrd, ...obsDeslizamiento];
      if (todas.length === 0) throw new Error('No hay ninguna observación que publicar');
      observaciones = todas;

      const written = await writeDataset({
        dataDir: DATA_DIR,
        name: 'observations/afectacion',
        observations: todas,
        sources: [...new Map(todas.map((o) => [o.source.url, o.source])).values()],
      });

      return `${curadas.length} curadas + ${ungrd.length} de UNGRD + ${
        obsDeslizamiento.length
      } de deslizamiento ${written.changed ? '(escrito)' : '(sin cambios)'}`;
    });

    await step('Réplicas', async () => {
      const aftershocks = await fetchAftershocks(currentEvent);

      const written = await writeGeoJson(DATA_DIR, 'event/aftershocks', {
        type: 'FeatureCollection',
        features: aftershocks.map((a) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [a.longitude, a.latitude, a.depthKm] },
          properties: {
            id: a.id,
            magnitude: a.magnitude,
            depth_km: a.depthKm,
            place: a.place,
            time: a.time,
          },
        })),
      });

      return `${aftershocks.length} réplicas ${written.changed ? '(escrito)' : '(sin cambios)'}`;
    });
  }

  if (mmiPorMunicipio.length > 0) {
    // Se llena en el paso de prensa y se consume en los dos siguientes. Si el paso de
    // prensa falla, queda vacío y los otros dos simplemente no hacen nada — que es el
    // comportamiento correcto: sin titulares nuevos no hay sedes nuevas que ubicar.
    let sedesSugeridas: {
      sede: string;
      pcode: string;
      municipio: string;
      tipo: 'centro_acopio' | 'albergue';
      titulo: string;
      enlace: string;
      medio: string;
      publicado: string;
    }[] = [];

    await step('Notas de prensa y boletines', async () => {
      // Recoge ENLACES, no cifras. Lo que produce es una lista de candidatos para que
      // una persona los lea; sacar números de prosa automáticamente confunde totales con
      // parciales y publica cifras equivocadas. Ver sources/noticias.ts.
      const { candidatos, consultas } = await recolectarNoticias(
        mmiPorMunicipio.map((m) => ({
          pcode: m.pcode,
          name: m.name,
          admin1_name: m.admin1_name,
        })),
      );

      if (candidatos.length === 0) throw new Error('Ninguna consulta devolvió resultados');

      const written = await writeJson(DATA_DIR, 'fuentes/candidatos', {
        generado: new Date().toISOString(),
        consultas,
        nota:
          'Enlaces recogidos automáticamente para revisión humana. Las cifras verificadas ' +
          'se registran en curated/observaciones.json.',
        candidatos,
      });

      const conMunicipio = candidatos.filter((c) => c.pcode).length;
      const oficiales = candidatos.filter((c) => c.tipo === 'official').length;

      // Sugerencias, no datos publicados: alguien las lee y las pasa a
      // curated/incidentes.json. Un patrón que etiqueta mal un lugar manda un equipo al
      // sitio equivocado, así que la máquina propone y la persona dispone.
      const sugerencias = candidatos
        .map((c) => {
          const e = extraer(c.titulo);
          if (!e) return undefined;
          // Búsqueda armada para quien cura: sede (o barrio) + municipio si lo hay.
          // Se arma aunque falte el municipio —«Estadio El Campín» se ubica solo— porque
          // esto no se publica: es la herramienta de quien va a mirar el mapa y confirmar.
          // La ambigüedad no la resuelve el municipio de todos modos: la Universidad de
          // Caldas tiene cinco sedes en Manizales. Siempre la resuelve la persona.
          const nombre = e.sede ?? (e.lugar ? `${e.clase} ${e.lugar}` : undefined);
          const buscar = nombre
            ? {
                buscar_en_mapa: enlaceBusqueda(
                  [nombre, c.municipio, 'Colombia'].filter(Boolean).join(', '),
                ),
              }
            : {};

          return {
            ...e,
            titulo: c.titulo,
            enlace: c.enlace,
            medio: c.medio,
            tipo_fuente: c.tipo,
            publicado: c.publicado,
            ...(c.pcode ? { pcode: c.pcode, municipio: c.municipio } : {}),
            ...buscar,
          };
        })
        .filter((s) => s !== undefined);

      const escritas = await writeJson(DATA_DIR, 'fuentes/extraidos', {
        generado: new Date().toISOString(),
        nota:
          'Sugerencias extraídas de titulares para revisión humana. NO son datos ' +
          'publicados: hay que confirmarlas y pasarlas a curated/incidentes.json.',
        reglas: 'packages/ingest/src/extraccion/reglas.ts',
        sugerencias,
      });

      // Solo las de ayuda se geocodifican. Un titular de colapso trae cifras, no lugares
      // —está medido: de 108 sugerencias, las 4 con sede eran todas de acopio— así que
      // pedirle al geocodificador que ubique un derrumbe es gastar consultas en nada.
      sedesSugeridas = sugerencias
        .filter((s) => s.sede !== undefined && s.pcode !== undefined && s.municipio !== undefined)
        .filter((s) => s.tipo === 'centro_acopio' || s.tipo === 'albergue')
        .map((s) => ({
          sede: s.sede!,
          pcode: s.pcode!,
          municipio: s.municipio!,
          tipo: s.tipo as 'centro_acopio' | 'albergue',
          titulo: s.titulo,
          enlace: s.enlace,
          medio: s.medio,
          publicado: s.publicado,
        }));

      const conLugar = sugerencias.filter((s) => s.lugar).length;

      return `${candidatos.length} notas (${conMunicipio} con municipio, ${oficiales} oficiales) · ${
        sugerencias.length
      } incidentes sugeridos, ${conLugar} con lugar ${
        written.changed || escritas.changed ? '(escrito)' : '(sin cambios)'
      }`;
    });

    await step('Incidentes por municipio', async () => {
      const curados = await cargarIncidentes();
      const listos = publicables(curados);
      const grupos = porMunicipio(listos);

      // Un archivo por municipio, descargado solo al abrirlo: la vista nacional no
      // engorda por incidentes que casi nadie va a mirar.
      for (const [pcode, incidentes] of grupos) {
        await writeGeoJson(DATA_DIR, `incidentes/${pcode}`, aGeoJson(incidentes));
      }

      // El índice le dice a la interfaz qué municipios tienen detalle. Es lo que permite
      // distinguir «aquí no hay cartografía» de «aquí no hubo daño» — confundir esas dos
      // cosas en un mapa de emergencia hace daño real.
      const written = await writeJson(DATA_DIR, 'incidentes/index', {
        generado: new Date().toISOString(),
        nota: 'Municipios con incidentes registrados. Los no listados NO tienen cartografía, que no es lo mismo que no tener daños.',
        recorte: 'Los incidentes sin verificar se recortan a una rejilla de ~100 m (ADR-012).',
        municipios: [...grupos.keys()].sort(),
        total: listos.length,
      });

      const exactos = listos.filter((i) => i.precision === 'exacta').length;
      return `${listos.length} incidentes en ${grupos.size} municipios (${exactos} verificados) ${
        written.changed ? '(escrito)' : '(sin cambios)'
      }`;
    });

    await step('Geocodificación de sedes', async () => {
      const cache = await leerCache();
      if (sedesSugeridas.length === 0) {
        return `sin sedes nuevas (${Object.keys(cache).length} en caché)`;
      }

      const municipios = await loadMunicipios();
      const porPcode = new Map(municipios.features.map((f) => [f.properties.pcode, f]));

      const pendientes = sedesSugeridas.map((s) => ({
        nombre: s.sede,
        municipio: s.municipio,
        // La comprobación se hace contra el municipio que dice la fuente. Ojo: cerca de un
        // borde los límites simplificados mienten (ver trampas en CLAUDE.md), pero aquí
        // solo se usa para descartar homónimos de OTRA ciudad, que es una escala en la que
        // la simplificación no alcanza a equivocarse.
        dentroDelMunicipio: (lon: number, lat: number): boolean => {
          const f = porPcode.get(s.pcode);
          return f === undefined ? false : booleanPointInPolygon([lon, lat], f as never);
        },
      }));

      const { cache: actualizada, resueltos, omitidos } = await geocodificarPendientes(
        pendientes,
        cache,
      );

      const written = await writeJson(DATA_DIR, CACHE_PATH, {
        generado: new Date().toISOString(),
        nota:
          'Caché de geocodificación. Un nombre resuelto no cambia de sitio, así que se ' +
          'consulta una vez. Borra una entrada para que se vuelva a resolver.',
        entradas: actualizada,
      });

      const conteo = Object.values(actualizada).reduce<Record<string, number>>((acc, e) => {
        acc[e.motivo] = (acc[e.motivo] ?? 0) + 1;
        return acc;
      }, {});

      return `${resueltos} resueltos${omitidos > 0 ? `, ${omitidos} para la próxima` : ''} · ${JSON.stringify(
        conteo,
      )} ${written.changed ? '(escrito)' : '(sin cambios)'}`;
    });

    await step('Puntos de ayuda', async () => {
      const curados = await cargarAyuda();
      const cache = await leerCache();

      const automaticos = desdeGeocodificacion(
        sedesSugeridas
          .map((s) => {
            const v = cache[s.sede];
            if (v?.motivo !== 'ok' || v.lon === undefined || v.lat === undefined) return undefined;
            return { ...s, lon: v.lon, lat: v.lat };
          })
          .filter((s) => s !== undefined),
        curados,
      );

      const puntos = [...publicar(curados), ...automaticos];

      // Un solo archivo nacional, no uno por municipio como los incidentes: los puntos
      // de ayuda son pocos y quien busca dónde donar no sabe todavía en qué municipio
      // va a mirar. Cargarlos todos de una es más útil y sigue siendo diminuto.
      const written = await writeGeoJson(DATA_DIR, 'ayuda/puntos', aGeoJsonAyuda(puntos));

      const porTipo = puntos.reduce<Record<string, number>>((acc, p) => {
        acc[p.tipo] = (acc[p.tipo] ?? 0) + 1;
        return acc;
      }, {});

      return `${puntos.length} puntos (${automaticos.length} automáticos) ${JSON.stringify(
        porTipo,
      )} ${written.changed ? '(escrito)' : '(sin cambios)'}`;
    });

    await step('Exportación CSV/HXL', async () => {
      const nombres = new Map(
        mmiPorMunicipio.map((m) => [m.pcode, `${m.name}, ${m.admin1_name}`]),
      );

      const escritos = [
        await writeText(DATA_DIR, 'export/mmi-por-municipio.csv', mmiToCsv(mmiPorMunicipio)),
        await writeText(
          DATA_DIR,
          'export/observaciones.csv',
          observacionesToCsv(observaciones, { nombres }),
        ),
      ];

      const cambiados = escritos.filter((e) => e.changed).length;
      return `2 archivos ${cambiados > 0 ? `(${cambiados} escrito${cambiados > 1 ? 's' : ''})` : '(sin cambios)'}`;
    });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} pasos completados.`);

  if (failed.length > 0) {
    console.error(`Fallaron: ${failed.map((f) => f.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
