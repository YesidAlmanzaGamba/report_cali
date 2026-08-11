import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hxlTagFor, mmiToCsv, observacionesToCsv } from '../src/export.js';
import type { MunicipioMmi } from '../src/join/mmi.js';
import type { Observation } from '../src/schema.js';

const nombres = new Map([['CO76001', 'Cali, Valle del Cauca']]);

function observacion(overrides: Partial<Observation> = {}): Observation {
  return {
    metric: 'deaths_confirmed',
    value: 234,
    pcode: 'CO',
    source: { name: 'Infobae', url: 'https://example.org/nota', type: 'press' },
    observed_at: '2026-08-11T03:00:00.000Z',
    ingested_at: '2026-08-11T18:00:00.000Z',
    ...overrides,
  };
}

describe('observacionesToCsv', () => {
  const csv = observacionesToCsv([observacion()], { nombres });
  const lineas = csv.trimEnd().split('\r\n');

  it('usa CRLF, como pide RFC 4180 y espera Excel', () => {
    assert.ok(csv.includes('\r\n'));
  });

  it('pone la fila HXL como segunda línea, no como primera', () => {
    // Si fuera la primera, cualquier lector de CSV la tomaría como encabezado.
    assert.match(lineas[0] ?? '', /^pcode,lugar,metrica/);
    assert.match(lineas[1] ?? '', /^#loc\+code,#loc\+name/);
  });

  it('resuelve el país a un nombre legible', () => {
    assert.match(lineas[2] ?? '', /^CO,Colombia,deaths_confirmed/);
  });

  it('incluye la etiqueta HXL de la métrica en su propia columna', () => {
    assert.ok(lineas[2]?.includes('#affected+killed'));
  });

  it('incluye la fuente y su URL: sin eso la exportación no sería verificable', () => {
    assert.ok(lineas[2]?.includes('Infobae'));
    assert.ok(lineas[2]?.includes('https://example.org/nota'));
  });

  it('resuelve el nombre del municipio', () => {
    const [, , fila] = observacionesToCsv([observacion({ pcode: 'CO76001' })], { nombres })
      .trimEnd()
      .split('\r\n');
    assert.ok(fila?.includes('"Cali, Valle del Cauca"'));
  });

  describe('escapado', () => {
    it('entrecomilla los valores con coma', () => {
      const csv = observacionesToCsv([observacion({ notes: 'uno, dos' })], { nombres });
      assert.ok(csv.includes('"uno, dos"'));
    });

    it('duplica las comillas internas', () => {
      const csv = observacionesToCsv([observacion({ notes: 'dijo "hola"' })], { nombres });
      assert.ok(csv.includes('"dijo ""hola"""'));
    });

    it('entrecomilla los saltos de línea', () => {
      const csv = observacionesToCsv([observacion({ notes: 'uno\ndos' })], { nombres });
      assert.ok(csv.includes('"uno\ndos"'));
    });

    it('no entrecomilla lo que no lo necesita', () => {
      const csv = observacionesToCsv([observacion({ notes: 'simple' })], { nombres });
      assert.ok(csv.includes(',simple'));
      assert.ok(!csv.includes('"simple"'));
    });
  });

  it('deja la celda vacía cuando no hay notas', () => {
    const csv = observacionesToCsv([observacion()], { nombres });
    assert.ok(csv.trimEnd().endsWith(','));
  });
});

describe('mmiToCsv', () => {
  const municipios: MunicipioMmi[] = [
    {
      pcode: 'CO17001',
      name: 'Manizales',
      admin1_pcode: 'CO17',
      admin1_name: 'Caldas',
      mmi: 8,
      mmi_roman: 'VIII',
      method: 'grid',
    },
    {
      pcode: 'CO76001',
      name: 'Cali',
      admin1_pcode: 'CO76',
      admin1_name: 'Valle del Cauca',
      mmi: 6.7,
      mmi_roman: 'VII',
      method: 'centroid',
    },
  ];

  const lineas = mmiToCsv(municipios).trimEnd().split('\r\n');

  it('etiqueta los niveles administrativos con HXL estándar', () => {
    assert.match(lineas[1] ?? '', /#adm2\+code,#adm2\+name,#adm1\+code,#adm1\+name/);
  });

  it('exporta una fila por municipio', () => {
    assert.equal(lineas.length, 4); // encabezado + HXL + 2 municipios
  });

  it('traduce el método al español', () => {
    assert.ok(lineas[2]?.endsWith(',malla'));
    assert.ok(lineas[3]?.endsWith(',centroide'));
  });

  it('conserva el decimal del MMI', () => {
    assert.ok(lineas[3]?.includes(',6.7,'));
  });
});

describe('hxlTagFor', () => {
  it('usa el vocabulario estándar para personas afectadas', () => {
    assert.equal(hxlTagFor('deaths_confirmed'), '#affected+killed');
    assert.equal(hxlTagFor('injured'), '#affected+injured');
    assert.equal(hxlTagFor('missing_reported'), '#affected+missing');
  });
});
