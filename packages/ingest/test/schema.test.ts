import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ObservationSchema, adminLevelOf, type Observation } from '../src/schema.js';

const valid: Observation = {
  metric: 'deaths_confirmed',
  value: 12,
  pcode: 'CO76001',
  source: {
    name: 'UNGRD',
    url: 'https://portal.gestiondelriesgo.gov.co/',
    type: 'official',
  },
  observed_at: '2026-08-11T14:00:00Z',
  ingested_at: '2026-08-11T14:12:03Z',
};

describe('ObservationSchema', () => {
  it('acepta una observación bien formada', () => {
    assert.deepEqual(ObservationSchema.parse(valid), valid);
  });

  it('exige fuente con URL verificable — es la razón de ser del envelope (ADR-003)', () => {
    const sinUrl = { ...valid, source: { ...valid.source, url: 'no-es-una-url' } };
    assert.equal(ObservationSchema.safeParse(sinUrl).success, false);
  });

  it('rechaza fechas sin zona horaria', () => {
    // Colombia reporta en hora local y las fuentes internacionales en UTC.
    // Una fecha sin zona es un error silencioso de 5 horas.
    const sinZona = { ...valid, observed_at: '2026-08-11T14:00:00' };
    assert.equal(ObservationSchema.safeParse(sinZona).success, false);
  });

  it('rechaza un dato observado después de haber sido ingerido', () => {
    const delFuturo = { ...valid, observed_at: '2026-08-12T00:00:00Z' };
    assert.equal(ObservationSchema.safeParse(delFuturo).success, false);
  });

  it('tolera 60 s de desfase de reloj entre observed_at e ingested_at', () => {
    const casiIgual = {
      ...valid,
      observed_at: '2026-08-11T14:12:30Z',
      ingested_at: '2026-08-11T14:12:03Z',
    };
    assert.equal(ObservationSchema.safeParse(casiIgual).success, true);
  });

  it('rechaza conteos negativos: siempre son un error de parseo', () => {
    assert.equal(ObservationSchema.safeParse({ ...valid, value: -1 }).success, false);
  });

  it('rechaza campos no declarados, para que un adaptador no cuele datos personales', () => {
    const conNombre = { ...valid, nombre: 'una persona' };
    assert.equal(ObservationSchema.safeParse(conNombre).success, false);
  });

  it('rechaza métricas fuera de la lista cerrada', () => {
    const inventada = { ...valid, metric: 'personas_desaparecidas_lista' };
    assert.equal(ObservationSchema.safeParse(inventada).success, false);
  });

  describe('P-codes', () => {
    for (const pcode of ['CO76', 'CO05', 'CO76001', 'CO27001']) {
      it(`acepta ${pcode}`, () => {
        assert.equal(ObservationSchema.safeParse({ ...valid, pcode }).success, true);
      });
    }

    for (const pcode of ['76001', 'CO7', 'CO760011', 'co76001', 'COABCDE']) {
      it(`rechaza ${pcode}`, () => {
        assert.equal(ObservationSchema.safeParse({ ...valid, pcode }).success, false);
      });
    }

    it('deduce el nivel administrativo de la longitud', () => {
      assert.equal(adminLevelOf('CO76'), 1);
      assert.equal(adminLevelOf('CO76001'), 2);
    });
  });
});
