import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ageHours, freshnessOf, relativeAgeEs } from '../src/freshness.js';
import type { Observation } from '../src/schema.js';

const NOW = new Date('2026-08-12T12:00:00Z');

function observation(metric: Observation['metric'], observedAt: string): Observation {
  return {
    metric,
    value: 1,
    pcode: 'CO76001',
    source: { name: 'UNGRD', url: 'https://portal.gestiondelriesgo.gov.co/', type: 'official' },
    observed_at: observedAt,
    ingested_at: '2026-08-12T12:00:00Z',
  };
}

describe('freshnessOf', () => {
  it('mide la antigüedad desde observed_at, no desde ingested_at', () => {
    // Una fuente que republica sin cambios tiene ingested_at fresco y dato viejo.
    // Aquí ingested_at es "ahora": medir por él daría 'fresh' y la cifra de hace
    // dos días se presentaría como vigente.
    const republicada = observation('deaths_confirmed', '2026-08-10T12:00:00Z');
    assert.equal(ageHours(republicada, NOW), 48);
    assert.equal(freshnessOf(republicada, NOW), 'aging');
  });

  describe('métricas que cambian rápido (albergues, vías)', () => {
    it('a 3 horas está fresco', () => {
      assert.equal(freshnessOf(observation('shelters_open', '2026-08-12T09:00:00Z'), NOW), 'fresh');
    });

    it('a 12 horas ya envejece', () => {
      assert.equal(freshnessOf(observation('shelters_open', '2026-08-12T00:00:00Z'), NOW), 'aging');
    });

    it('a 30 horas está obsoleto', () => {
      assert.equal(freshnessOf(observation('shelters_open', '2026-08-11T06:00:00Z'), NOW), 'stale');
    });
  });

  describe('métricas de balance diario (fallecidos, heridos)', () => {
    it('a 12 horas sigue fresco — no se degrada tan rápido como un albergue', () => {
      assert.equal(
        freshnessOf(observation('deaths_confirmed', '2026-08-12T00:00:00Z'), NOW),
        'fresh',
      );
    });

    it('a 30 horas envejece', () => {
      assert.equal(
        freshnessOf(observation('deaths_confirmed', '2026-08-11T06:00:00Z'), NOW),
        'aging',
      );
    });

    it('a 80 horas está obsoleto', () => {
      assert.equal(
        freshnessOf(observation('deaths_confirmed', '2026-08-09T04:00:00Z'), NOW),
        'stale',
      );
    });
  });

  describe('censo de daño estructural', () => {
    it('a 30 horas sigue fresco: un edificio colapsado no se recupera solo', () => {
      assert.equal(
        freshnessOf(observation('buildings_collapsed', '2026-08-11T06:00:00Z'), NOW),
        'fresh',
      );
    });
  });
});

describe('relativeAgeEs', () => {
  const casos: Array<[string, string]> = [
    ['2026-08-12T11:30:00Z', 'hace 30 minutos'],
    ['2026-08-12T11:00:00Z', 'hace 1 hora'],
    ['2026-08-12T09:00:00Z', 'hace 3 horas'],
    ['2026-08-11T12:00:00Z', 'hace 1 día'],
    ['2026-08-10T12:00:00Z', 'hace 2 días'],
  ];

  for (const [observedAt, expected] of casos) {
    it(`${observedAt} → ${expected}`, () => {
      assert.equal(relativeAgeEs(observation('deaths_confirmed', observedAt), NOW), expected);
    });
  }

  it('nunca dice "hace 0 minutos"', () => {
    assert.equal(
      relativeAgeEs(observation('deaths_confirmed', '2026-08-12T11:59:59Z'), NOW),
      'hace 1 minuto',
    );
  });
});
