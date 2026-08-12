import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsearPoblacion, partirLineaCsv } from '../src/sources/poblacion.js';

describe('partirLineaCsv', () => {
  it('parte una línea simple', () => {
    assert.deepEqual(partirLineaCsv('a,b,c'), ['a', 'b', 'c']);
  });

  it('respeta las comas dentro de comillas', () => {
    // «Bogotá, D.C.» es un municipio real: partir por comas a secas corre todas las
    // columnas y el P-code termina en la casilla equivocada.
    assert.deepEqual(partirLineaCsv('2025,"Bogotá, D.C.",CO11001'), [
      '2025',
      'Bogotá, D.C.',
      'CO11001',
    ]);
  });

  it('maneja comillas escapadas', () => {
    assert.deepEqual(partirLineaCsv('"dice ""hola""",x'), ['dice "hola"', 'x']);
  });

  it('conserva las celdas vacías', () => {
    assert.deepEqual(partirLineaCsv('a,,c'), ['a', '', 'c']);
  });
});

describe('parsearPoblacion', () => {
  const csv = [
    '"Year","ADM2_ES","ADM2_PCODE","T_TL","T_00_04","T_65_69","T_70_74","T_100Plus"',
    '2025,"El Encanto","CO91263",2179,269,54,44,0',
    '2025,"Bogotá, D.C.","CO11001",8000000,500000,300000,200000,100',
  ].join('\n');

  it('lee el P-code y el total', () => {
    const filas = parsearPoblacion(csv);
    assert.equal(filas.length, 2);
    assert.equal(filas[0]?.pcode, 'CO91263');
    assert.equal(filas[0]?.total, 2179);
  });

  it('no se descoloca con un nombre que lleva coma', () => {
    const bogota = parsearPoblacion(csv).find((f) => f.pcode === 'CO11001');
    assert.equal(bogota?.total, 8000000);
  });

  it('suma el grupo vulnerable: menores de 5 más mayores de 65', () => {
    const filas = parsearPoblacion(csv);
    assert.equal(filas[0]?.vulnerable, 269 + 54 + 44 + 0);
  });

  it('falla si faltan las columnas que importan', () => {
    assert.throws(() => parsearPoblacion('"a","b"\n1,2'), /ADM2_PCODE|T_TL/);
  });

  it('falla si el CSV viene vacío', () => {
    assert.throws(() => parsearPoblacion(''), /no trae filas/);
  });

  it('omite filas con total no numérico en vez de publicar NaN', () => {
    const conBasura = csv + '\n2025,"Rota","CO99999","sin dato",0,0,0,0';
    assert.equal(parsearPoblacion(conBasura).length, 2);
  });
});
