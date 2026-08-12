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
import type { FeatureCollection, Geometry } from 'geojson';

import { loadCuratedObservations } from './curated.js';
import { mmiToCsv, observacionesToCsv } from './export.js';
import { joinMmiToMunicipios, type MunicipioMmi } from './join/mmi.js';
import { DATA_DIR } from './paths.js';
import { writeDataset, writeGeoJson, writeJson, writeText } from './persist.js';
import type { Observation } from './schema.js';
import { recolectarNoticias } from './sources/noticias.js';
import { fetchUngrdSeismic } from './sources/ungrd.js';
import {
  topologyToFeatures,
  type MunicipioProperties,
  type SimplifiedTopology,
} from './sources/codab.js';
import {
  USGS_SOURCE,
  fetchAftershocks,
  fetchEvent,
  fetchMmiGrid,
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

  await step('Evento USGS', async () => {
    event = await fetchEvent();
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
      mmiPorMunicipio = joined;

      const written = await writeJson(DATA_DIR, 'event/mmi-by-municipality', {
        source: USGS_SOURCE,
        generated_at: new Date().toISOString(),
        event_id: currentEvent.id,
        shakemap_url: currentEvent.shakemapBaseUrl,
        municipality_count: joined.length,
        municipalities: joined,
      });

      const top = joined[0];
      return `${joined.length} municipios, máximo ${top?.mmi} (${top?.mmi_roman}) en ${top?.name} ${
        written.changed ? '(escrito)' : '(sin cambios)'
      }`;
    });

    await step('Cifras oficiales y de prensa', async () => {
      // Dos orígenes con el mismo destino. La UNGRD hoy devuelve cero filas porque sus
      // datos abiertos llegan hasta 2024; queda consultando para que el día que publiquen
      // 2026 esto se llene solo, sin que nadie tenga que acordarse.
      const [curadas, ungrd] = await Promise.all([
        loadCuratedObservations(),
        fetchUngrdSeismic(currentEvent.originTime).catch((error: unknown) => {
          console.warn(`\n  (UNGRD no respondió: ${(error as Error).message})`);
          return [] as Observation[];
        }),
      ]);

      const todas = [...curadas, ...ungrd];
      if (todas.length === 0) throw new Error('No hay ninguna observación que publicar');
      observaciones = todas;

      const written = await writeDataset({
        dataDir: DATA_DIR,
        name: 'observations/afectacion',
        observations: todas,
        sources: [...new Map(todas.map((o) => [o.source.url, o.source])).values()],
      });

      return `${curadas.length} curadas + ${ungrd.length} de UNGRD ${
        written.changed ? '(escrito)' : '(sin cambios)'
      }`;
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

      return `${candidatos.length} notas (${conMunicipio} con municipio, ${oficiales} oficiales) ${
        written.changed ? '(escrito)' : '(sin cambios)'
      }`;
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
