import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';

import {
  SourceContractError,
  contentHashOf,
  writeDataset,
  writeGeoJson,
  writeJson,
  type DatasetFile,
} from '../src/persist.js';
import type { Observation, Source } from '../src/schema.js';

const SOURCE: Source = {
  name: 'UNGRD',
  url: 'https://portal.gestiondelriesgo.gov.co/',
  type: 'official',
};

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    metric: 'deaths_confirmed',
    value: 12,
    pcode: 'CO76001',
    source: SOURCE,
    observed_at: '2026-08-11T14:00:00Z',
    ingested_at: '2026-08-11T14:12:03Z',
    ...overrides,
  };
}

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'report-cali-'));
});

describe('writeDataset', () => {
  it('escribe un dataset válido con su metadata', async () => {
    const result = await writeDataset({
      dataDir,
      name: 'observations/ungrd',
      observations: [observation()],
      sources: [SOURCE],
    });

    assert.equal(result.changed, true);
    assert.equal(result.recordCount, 1);

    const file = JSON.parse(await readFile(result.path, 'utf8')) as DatasetFile;
    assert.equal(file.meta.event_id, 'us6000tjl2');
    assert.equal(file.meta.record_count, 1);
    assert.equal(file.observations[0]?.value, 12);
  });

  describe('conservar el último dato bueno (ADR-003)', () => {
    it('no toca el archivo previo cuando la fuente rompe su contrato', async () => {
      const { path } = await writeDataset({
        dataDir,
        name: 'observations/ungrd',
        observations: [observation({ value: 12 })],
        sources: [SOURCE],
      });

      const corrupta = [{ ...observation(), value: -5 }] as unknown as Observation[];

      await assert.rejects(
        writeDataset({
          dataDir,
          name: 'observations/ungrd',
          observations: corrupta,
          sources: [SOURCE],
        }),
        SourceContractError,
      );

      // El dato bueno anterior sigue intacto: preferimos una cifra vieja
      // y marcada como vieja antes que una corrupta presentada como fresca.
      const file = JSON.parse(await readFile(path, 'utf8')) as DatasetFile;
      assert.equal(file.observations[0]?.value, 12);
    });

    it('no crea el archivo si la primera ingesta ya viene corrupta', async () => {
      const corrupta = [{ metric: 'inventada', value: 1 }] as unknown as Observation[];

      await assert.rejects(
        writeDataset({
          dataDir,
          name: 'observations/nueva',
          observations: corrupta,
          sources: [SOURCE],
        }),
        SourceContractError,
      );

      await assert.rejects(stat(join(dataDir, 'observations/nueva.json')));
    });

    it('el error nombra el dataset y explica qué falló', async () => {
      const corrupta = [{ ...observation(), pcode: '76001' }] as unknown as Observation[];

      await assert.rejects(
        writeDataset({
          dataDir,
          name: 'observations/ungrd',
          observations: corrupta,
          sources: [SOURCE],
        }),
        /ungrd[\s\S]*pcode/i,
      );
    });
  });

  describe('escritura estable (ADR-004)', () => {
    it('no reescribe cuando solo cambió ingested_at', async () => {
      const args = { dataDir, name: 'observations/ungrd', sources: [SOURCE] };

      const primera = await writeDataset({ ...args, observations: [observation()] });
      assert.equal(primera.changed, true);

      // Corrida siguiente del cron, 15 minutos después: mismo dato, otra hora de ingesta.
      const segunda = await writeDataset({
        ...args,
        observations: [observation({ ingested_at: '2026-08-11T14:27:03Z' })],
      });

      // Sin esto el cron produciría ~96 commits diarios de puro ruido y ahogaría
      // el historial de git, que es justamente nuestra trazabilidad.
      assert.equal(segunda.changed, false);
    });

    it('sí reescribe cuando cambia el valor', async () => {
      const args = { dataDir, name: 'observations/ungrd', sources: [SOURCE] };

      await writeDataset({ ...args, observations: [observation({ value: 12 })] });
      const segunda = await writeDataset({ ...args, observations: [observation({ value: 19 })] });

      assert.equal(segunda.changed, true);
    });

    it('sí reescribe cuando la fuente reafirma el mismo valor con nuevo observed_at', async () => {
      // Es información real: la fuente confirmó la cifra en un corte posterior.
      const args = { dataDir, name: 'observations/ungrd', sources: [SOURCE] };

      await writeDataset({ ...args, observations: [observation()] });
      const segunda = await writeDataset({
        ...args,
        observations: [
          observation({ observed_at: '2026-08-11T20:00:00Z', ingested_at: '2026-08-11T20:05:00Z' }),
        ],
      });

      assert.equal(segunda.changed, true);
    });

    it('se recupera de un archivo previo corrupto en vez de reventar', async () => {
      const path = join(dataDir, 'observations/ungrd.json');
      await writeDataset({
        dataDir,
        name: 'observations/ungrd',
        observations: [observation()],
        sources: [SOURCE],
      });
      await writeFile(path, '{ esto no es json válido', 'utf8');

      const result = await writeDataset({
        dataDir,
        name: 'observations/ungrd',
        observations: [observation()],
        sources: [SOURCE],
      });

      assert.equal(result.changed, true);
    });
  });
});

describe('writeJson / writeGeoJson — marcas de tiempo volátiles', () => {
  // Regresión de un fallo real observado en producción: el cron hizo commit de
  // `mmi-by-municipality.json` cuando lo ÚNICO que cambió fue `generated_at`. Los 1.122
  // valores de intensidad eran idénticos. A 96 corridas diarias, eso ahoga el historial
  // de git — que es justamente nuestra trazabilidad de procedencia (ADR-004).
  it('no reescribe cuando solo cambió generated_at', async () => {
    const dataset = (generadoEn: string) => ({
      generated_at: generadoEn,
      event_id: 'us6000tjl2',
      municipalities: [{ pcode: 'CO17001', name: 'Manizales', mmi: 8 }],
    });

    const primera = await writeJson(dataDir, 'event/mmi', dataset('2026-08-11T17:35:56.313Z'));
    assert.equal(primera.changed, true);

    const segunda = await writeJson(dataDir, 'event/mmi', dataset('2026-08-11T21:29:48.498Z'));
    assert.equal(segunda.changed, false);
  });

  it('no reescribe cuando el USGS solo tocó `updatedAt` del registro', async () => {
    // El USGS mueve `updated` sin que cambie la ciencia. Cuando revisan el ShakeMap de
    // verdad, cambian el MMI y la URL versionada del producto, y eso sí se escribe.
    const evento = (actualizado: string) => ({
      id: 'us6000tjl2',
      magnitude: 7.4,
      updatedAt: actualizado,
      ingested_at: actualizado,
    });

    await writeJson(dataDir, 'event/event', evento('2026-08-11T17:26:19.239Z'));
    const segunda = await writeJson(dataDir, 'event/event', evento('2026-08-11T21:19:40.010Z'));

    assert.equal(segunda.changed, false);
  });

  it('sí reescribe cuando cambia un valor real junto a la marca de tiempo', async () => {
    const dataset = (mmi: number, generadoEn: string) => ({
      generated_at: generadoEn,
      municipalities: [{ pcode: 'CO17001', mmi }],
    });

    await writeJson(dataDir, 'event/mmi', dataset(8, '2026-08-11T17:00:00.000Z'));
    const segunda = await writeJson(dataDir, 'event/mmi', dataset(8.3, '2026-08-11T21:00:00.000Z'));

    assert.equal(segunda.changed, true);
  });

  it('escribe la marca nueva cuando sí hubo cambio real', async () => {
    await writeJson(dataDir, 'event/mmi', { generated_at: 'a', mmi: 1 });
    const { path } = await writeJson(dataDir, 'event/mmi', { generated_at: 'b', mmi: 2 });

    const guardado = JSON.parse(await readFile(path, 'utf8')) as { generated_at: string };
    assert.equal(guardado.generated_at, 'b');
  });

  it('ignora marcas volátiles anidadas, no solo las de primer nivel', async () => {
    const conAnidado = (t: string) => ({
      meta: { fuente: { name: 'USGS' }, generated_at: t },
      valores: [{ pcode: 'CO17001', mmi: 8, ingested_at: t }],
    });

    await writeJson(dataDir, 'event/anidado', conAnidado('2026-08-11T17:00:00.000Z'));
    const segunda = await writeJson(dataDir, 'event/anidado', conAnidado('2026-08-11T21:00:00.000Z'));

    assert.equal(segunda.changed, false);
  });

  it('aplica lo mismo a GeoJSON', async () => {
    const replicas = (t: string) => ({
      type: 'FeatureCollection',
      generated_at: t,
      features: [{ type: 'Feature', properties: { magnitude: 4.6 } }],
    });

    await writeGeoJson(dataDir, 'event/replicas', replicas('2026-08-11T17:00:00.000Z'));
    const segunda = await writeGeoJson(dataDir, 'event/replicas', replicas('2026-08-11T21:00:00.000Z'));

    assert.equal(segunda.changed, false);
  });
});

describe('contentHashOf', () => {
  it('ignora ingested_at', () => {
    assert.equal(
      contentHashOf([observation()]),
      contentHashOf([observation({ ingested_at: '2026-08-11T23:59:00Z' })]),
    );
  });

  it('no depende del orden de los registros', () => {
    const a = observation({ pcode: 'CO76001' });
    const b = observation({ pcode: 'CO05001' });
    assert.equal(contentHashOf([a, b]), contentHashOf([b, a]));
  });

  it('cambia cuando cambia el valor', () => {
    assert.notEqual(contentHashOf([observation({ value: 1 })]), contentHashOf([observation({ value: 2 })]));
  });
});
