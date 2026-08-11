/**
 * Pruebas del adaptador USGS contra un fixture grabado.
 *
 * `fixtures/usgs-event.json` es la respuesta real del evento `us6000tjl2`. Nunca se toca
 * la red: los esquemas de las fuentes cambian sin avisar y CI no puede romperse porque el
 * USGS renombró un campo. Cuando eso pase, se regraba el fixture y se revisa el diff —
 * que es exactamente el momento en que queremos enterarnos.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  axisValue,
  gridValueAt,
  nearestIndex,
  parseAftershocks,
  parseEvent,
  parseMmiGrid,
  sampleMmi,
  type MmiGrid,
} from '../src/sources/usgs.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const eventoCrudo = JSON.parse(await readFile(resolve(FIXTURES, 'usgs-event.json'), 'utf8'));

describe('parseEvent', () => {
  const evento = parseEvent(eventoCrudo);

  it('extrae la magnitud, el epicentro y la profundidad', () => {
    assert.equal(evento.magnitude, 7.4);
    assert.equal(evento.longitude, -76.2422);
    assert.equal(evento.latitude, 4.8436);
    assert.ok(Math.abs(evento.depthKm - 110.285) < 0.001);
  });

  it('extrae el nivel de alerta PAGER', () => {
    assert.equal(evento.alert, 'red');
  });

  it('convierte el tiempo de origen a ISO', () => {
    assert.equal(evento.originTime, '2026-08-10T12:34:28.125Z');
  });

  it('lee la URL base del ShakeMap del producto, sin construirla a mano', () => {
    // Lleva un timestamp de versión que cambia con cada revisión del ShakeMap.
    // Si lo armáramos nosotros, quedaríamos clavados en una versión vieja.
    assert.match(evento.shakemapBaseUrl ?? '', /^https:\/\/earthquake\.usgs\.gov\/product\/shakemap\//);
    assert.doesNotMatch(evento.shakemapBaseUrl ?? '', /cont_mi\.json$/);
  });

  it('expone el MMI máximo del evento', () => {
    assert.ok(evento.maxMmi !== null && evento.maxMmi > 7 && evento.maxMmi < 9);
  });

  describe('fallos ruidosos', () => {
    it('falla si no hay properties', () => {
      assert.throws(() => parseEvent({}), /properties/);
    });

    it('falla si las coordenadas no traen profundidad', () => {
      const sinProfundidad = {
        ...eventoCrudo,
        geometry: { type: 'Point', coordinates: [-76.2, 4.8] },
      };
      assert.throws(() => parseEvent(sinProfundidad), /coordinates/);
    });

    it('falla si la magnitud no es numérica', () => {
      const magTexto = { ...eventoCrudo, properties: { ...eventoCrudo.properties, mag: '7.4' } };
      assert.throws(() => parseEvent(magTexto), /properties\.mag/);
    });
  });
});

// ── Malla de intensidad ──────────────────────────────────────────────────────

/** Malla 3×2 sintética: valores conocidos, fácil de razonar a mano. */
function mallaDePrueba(): MmiGrid {
  return {
    xStart: -78,
    xStop: -76,
    xNum: 3, // columnas en -78, -77, -76
    yStart: 4,
    yStop: 5,
    yNum: 2, // filas en 4, 5
    // fila mayor: [y=4: 1,2,3][y=5: 4,5,6]
    values: [1, 2, 3, 4, 5, 6],
  };
}

describe('parseMmiGrid', () => {
  function coverage(overrides: Record<string, unknown> = {}) {
    return {
      domain: { axes: { x: { start: -78, stop: -76, num: 3 }, y: { start: 4, stop: 5, num: 2 } } },
      ranges: { MMI: { axisNames: ['y', 'x'], shape: [2, 3], values: [1, 2, 3, 4, 5, 6] } },
      ...overrides,
    };
  }

  it('lee los ejes y los valores', () => {
    const malla = parseMmiGrid(coverage());
    assert.equal(malla.xNum, 3);
    assert.equal(malla.yNum, 2);
    assert.deepEqual(malla.values, [1, 2, 3, 4, 5, 6]);
  });

  it('falla si el número de valores no cuadra con los ejes', () => {
    const rota = coverage({ ranges: { MMI: { axisNames: ['y', 'x'], values: [1, 2, 3] } } });
    assert.throws(() => parseMmiGrid(rota), /no cuadra/);
  });

  it('falla si el orden de ejes no es [y, x]', () => {
    // Un eje transpuesto no rompe nada visiblemente: el mapa saldría mal en silencio,
    // que es el peor modo de falla posible aquí.
    const transpuesta = coverage({
      ranges: { MMI: { axisNames: ['x', 'y'], values: [1, 2, 3, 4, 5, 6] } },
    });
    assert.throws(() => parseMmiGrid(transpuesta), /orden de ejes/);
  });

  it('falla si no hay rango MMI', () => {
    assert.throws(() => parseMmiGrid(coverage({ ranges: {} })), /rango MMI/);
  });
});

describe('indexación de la malla', () => {
  const malla = mallaDePrueba();

  it('axisValue devuelve el centro de cada celda', () => {
    assert.equal(axisValue(-78, -76, 3, 0), -78);
    assert.equal(axisValue(-78, -76, 3, 1), -77);
    assert.equal(axisValue(-78, -76, 3, 2), -76);
  });

  it('gridValueAt indexa como fila mayor', () => {
    assert.equal(gridValueAt(malla, 0, 0), 1);
    assert.equal(gridValueAt(malla, 2, 0), 3);
    assert.equal(gridValueAt(malla, 0, 1), 4);
    assert.equal(gridValueAt(malla, 2, 1), 6);
  });

  it('gridValueAt devuelve undefined fuera de rango', () => {
    assert.equal(gridValueAt(malla, -1, 0), undefined);
    assert.equal(gridValueAt(malla, 3, 0), undefined);
    assert.equal(gridValueAt(malla, 0, 2), undefined);
  });

  it('nearestIndex satura en los bordes en vez de salirse', () => {
    assert.equal(nearestIndex(-78, -76, 3, -90), 0);
    assert.equal(nearestIndex(-78, -76, 3, -60), 2);
    assert.equal(nearestIndex(-78, -76, 3, -77.1), 1);
  });

  it('sampleMmi toma el vecino más cercano', () => {
    assert.equal(sampleMmi(malla, -78, 4), 1);
    assert.equal(sampleMmi(malla, -76, 5), 6);
    assert.equal(sampleMmi(malla, -77.4, 4.4), 2);
  });
});

// ── Réplicas ─────────────────────────────────────────────────────────────────

describe('parseAftershocks', () => {
  const coleccion = {
    features: [
      {
        id: 'principal',
        geometry: { coordinates: [-76.2, 4.8, 110] },
        properties: { mag: 7.4, place: 'San José del Palmar', time: 1786451668125 },
      },
      {
        id: 'r2',
        geometry: { coordinates: [-76.1, 4.9, 90] },
        properties: { mag: 4.6, place: 'Chocó', time: 1786455268125 },
      },
      {
        id: 'r1',
        geometry: { coordinates: [-76.3, 4.7, 100] },
        properties: { mag: 3.8, place: 'Chocó', time: 1786453468125 },
      },
    ],
  };

  it('excluye el evento principal de su propia lista de réplicas', () => {
    const replicas = parseAftershocks(coleccion, 'principal');
    assert.equal(replicas.length, 2);
    assert.ok(!replicas.some((r) => r.id === 'principal'));
  });

  it('ordena cronológicamente', () => {
    const replicas = parseAftershocks(coleccion, 'principal');
    assert.deepEqual(
      replicas.map((r) => r.id),
      ['r1', 'r2'],
    );
  });

  it('descarta rasgos incompletos en vez de emitir NaN', () => {
    const conBasura = { features: [...coleccion.features, { id: 'x', properties: {} }] };
    const replicas = parseAftershocks(conBasura, 'principal');
    assert.equal(replicas.length, 2);
  });

  it('falla si la respuesta no trae features', () => {
    assert.throws(() => parseAftershocks({}, 'principal'), /features/);
  });
});
