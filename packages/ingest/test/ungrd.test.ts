import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { ObservationSchema, pcodeFromDivipola } from '../src/schema.js';
import { parseUngrdRows } from '../src/sources/ungrd.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const filasReales = JSON.parse(await readFile(resolve(FIXTURES, 'ungrd-sismo.json'), 'utf8'));

const NOW = new Date('2026-08-11T18:00:00Z');
const opciones = { divipolaField: 'codificaci_n_segun_divipola', datasetId: 'rgre-6ak4', now: NOW };

describe('pcodeFromDivipola', () => {
  it('convierte un código de municipio de cinco dígitos', () => {
    assert.equal(pcodeFromDivipola('27006'), 'CO27006');
  });

  it('rellena el cero inicial que los datasets del Estado omiten', () => {
    // «5656» y «05656» son el mismo municipio de Antioquia. Sin rellenar, los 32
    // departamentos cuyo código empieza por cero no cruzarían con la geometría.
    assert.equal(pcodeFromDivipola('5656'), 'CO05656');
    assert.equal(pcodeFromDivipola(5656), 'CO05656');
  });

  it('acepta códigos de departamento', () => {
    assert.equal(pcodeFromDivipola('76'), 'CO76');
    assert.equal(pcodeFromDivipola('5'), 'CO05');
  });

  it('falla con un código vacío o no numérico', () => {
    assert.throws(() => pcodeFromDivipola(''), /DIVIPOLA/);
    assert.throws(() => pcodeFromDivipola('abc'), /DIVIPOLA/);
  });
});

describe('parseUngrdRows', () => {
  const observaciones = parseUngrdRows(filasReales, opciones);

  it('produce observaciones válidas desde las filas reales del fixture', () => {
    assert.ok(observaciones.length > 0);
    for (const o of observaciones) {
      assert.equal(ObservationSchema.safeParse(o).success, true);
    }
  });

  it('cruza el municipio correcto', () => {
    // Acandí, Chocó → DIVIPOLA 27006
    const acandi = observaciones.filter((o) => o.pcode === 'CO27006');
    assert.ok(acandi.length > 0, 'esperaba observaciones de Acandí');
  });

  it('mapea las columnas a las métricas correctas', () => {
    const heridos = observaciones.find((o) => o.pcode === 'CO27006' && o.metric === 'injured');
    assert.equal(heridos?.value, 1);

    const viviendas = observaciones.find(
      (o) => o.pcode === 'CO27006' && o.metric === 'buildings_damaged',
    );
    assert.equal(viviendas?.value, 87);
  });

  it('descarta los ceros: la UNGRD rellena con 0 lo que no aplica', () => {
    // Publicar «0 fallecidos» con la misma fuerza que un cero verificado afirmaría
    // algo que el dato no respalda.
    assert.equal(
      observaciones.some((o) => o.value === 0),
      false,
    );
  });

  it('interpreta las fechas como hora de Colombia, no como UTC', () => {
    // La UNGRD publica fechas sin zona. Leerlas como UTC corre el evento cinco horas.
    const acandi = observaciones.find((o) => o.pcode === 'CO27006');
    assert.equal(acandi?.observed_at, '2023-05-24T05:00:00.000Z');
  });

  it('conserva el tipo de evento en las notas', () => {
    assert.match(observaciones[0]?.notes ?? '', /SISMO/);
  });

  describe('robustez', () => {
    it('omite filas sin código DIVIPOLA en vez de inventar una ubicación', () => {
      const sinCodigo = [{ fecha: '2023-05-24T00:00:00.000', evento: 'SISMO', fallecidos: '3' }];
      assert.equal(parseUngrdRows(sinCodigo, opciones).length, 0);
    });

    it('omite filas con código no utilizable', () => {
      const raro = [
        { fecha: '2023-05-24T00:00:00.000', codificaci_n_segun_divipola: '—', fallecidos: '3' },
      ];
      assert.equal(parseUngrdRows(raro, opciones).length, 0);
    });

    it('tolera conteos con separadores de miles', () => {
      const conSeparador = [
        {
          fecha: '2023-05-24T00:00:00.000',
          codificaci_n_segun_divipola: '27006',
          evento: 'SISMO',
          personas: '1.282',
        },
      ];
      const [o] = parseUngrdRows(conSeparador, opciones);
      assert.equal(o?.value, 1282);
    });

    it('falla si la respuesta no es un arreglo', () => {
      assert.throws(() => parseUngrdRows({ error: 'x' }, opciones), /arreglo/);
    });
  });
});
