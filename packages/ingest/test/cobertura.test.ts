import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  construirCobertura,
  type MunicipioCobertura,
  type NotaCandidata,
} from '../src/cobertura.js';

const municipios: MunicipioCobertura[] = [
  { pcode: 'CO17001', name: 'Manizales', admin1_name: 'Caldas', mmi: 8, poblacion: 469_600 },
  { pcode: 'CO76622', name: 'Roldanillo', admin1_name: 'Valle del Cauca', mmi: 7.2, poblacion: 38_029 },
  // Golpeado y sin una sola nota: el caso que el archivo existe para hacer visible.
  { pcode: 'CO27787', name: 'Tadó', admin1_name: 'Chocó', mmi: 7, poblacion: 18_546 },
  // Por debajo del umbral y sin notas: no debe aparecer.
  { pcode: 'CO05001', name: 'Medellín', admin1_name: 'Antioquia', mmi: 4.1, poblacion: 2_600_000 },
  // Por debajo del umbral PERO con una nota: sí debe aparecer.
  { pcode: 'CO11001', name: 'Bogotá', admin1_name: 'Bogotá', mmi: 3.2, poblacion: 8_000_000 },
];

const candidatos: NotaCandidata[] = [
  { pcode: 'CO17001', medio: 'La Patria', publicado: '2026-08-12T10:00:00.000Z' },
  { pcode: 'CO17001', medio: 'La Patria', publicado: '2026-08-12T15:00:00.000Z' },
  { pcode: 'CO17001', medio: 'El Tiempo', publicado: '2026-08-11T08:00:00.000Z' },
  { pcode: 'CO76622', medio: 'El País (Cali)', publicado: '2026-08-12T09:00:00.000Z' },
  { pcode: 'CO11001', medio: 'El Tiempo', publicado: '2026-08-12T07:00:00.000Z' },
  // Ruido que debe ignorarse: sin municipio, y con fecha ilegible.
  { medio: 'Infobae', publicado: '2026-08-12T09:00:00.000Z' },
  { pcode: 'CO76622', medio: 'Pulzo', publicado: 'no es una fecha' },
];

describe('construirCobertura', () => {
  const c = construirCobertura(municipios, candidatos, { ahora: new Date('2026-08-12T18:00:00Z') });

  it('incluye los golpeados y excluye los que no tiemblan ni salen en prensa', () => {
    const codigos = c.municipios.map((m) => m.pcode);
    assert.ok(codigos.includes('CO17001'));
    assert.ok(codigos.includes('CO27787'), 'un municipio golpeado sin notas tiene que aparecer');
    assert.ok(!codigos.includes('CO05001'), 'sin sacudimiento y sin notas, no aporta');
  });

  it('incluye municipios por debajo del umbral si la prensa habla de ellos', () => {
    assert.ok(c.municipios.some((m) => m.pcode === 'CO11001'));
  });

  it('ordena por intensidad descendente', () => {
    const mmis = c.municipios.map((m) => m.mmi ?? 0);
    assert.deepEqual([...mmis].sort((a, b) => b - a), mmis);
  });

  it('agrupa por medio y guarda la nota más reciente de cada uno', () => {
    const manizales = c.municipios.find((m) => m.pcode === 'CO17001');
    assert.equal(manizales?.notas, 3);
    assert.deepEqual(
      manizales?.medios.map((x) => x.nombre),
      ['La Patria', 'El Tiempo'],
    );
    assert.equal(manizales?.medios[0]?.notas, 2);
    assert.equal(manizales?.medios[0]?.ultima, '2026-08-12T15:00:00.000Z');
    assert.equal(manizales?.ultima, '2026-08-12T15:00:00.000Z');
  });

  it('descarta notas sin municipio y con fecha ilegible', () => {
    const roldanillo = c.municipios.find((m) => m.pcode === 'CO76622');
    assert.equal(roldanillo?.notas, 1, 'la nota con fecha inválida no cuenta');
    assert.deepEqual(roldanillo?.medios.map((x) => x.nombre), ['El País (Cali)']);
  });

  it('deja el hueco a la vista, con nombre y con población', () => {
    const tado = c.municipios.find((m) => m.pcode === 'CO27787');
    assert.equal(tado?.notas, 0);
    assert.deepEqual(tado?.medios, []);
    assert.equal(tado?.ultima, undefined);

    assert.equal(c.resumen.sin_notas, 1);
    assert.equal(c.resumen.poblacion_sin_notas, 18_546);
  });

  it('cuenta el resumen sobre los municipios considerados, no sobre los 1.122', () => {
    assert.equal(c.resumen.municipios_considerados, 4);
    assert.equal(c.resumen.con_notas, 3);
    assert.equal(c.resumen.medios_distintos, 3);
  });

  it('no afirma que un municipio sin notas esté sin daños', () => {
    assert.match(c.nota, /NO es un municipio sin daños/);
  });
});

describe('construirCobertura sin notas', () => {
  it('no revienta y reporta el hueco entero', () => {
    const c = construirCobertura(municipios, [], { ahora: new Date('2026-08-12T18:00:00Z') });
    assert.equal(c.resumen.con_notas, 0);
    assert.equal(c.resumen.sin_notas, 3);
    assert.equal(c.resumen.poblacion_sin_notas, 469_600 + 38_029 + 18_546);
  });
});
