import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FeatureCollection, Geometry, Polygon } from 'geojson';

import { bboxOf, joinMmiToMunicipios, maxMmiInPolygon, mmiToRoman } from '../src/join/mmi.js';
import type { MunicipioProperties } from '../src/sources/codab.js';
import type { MmiGrid } from '../src/sources/usgs.js';

/**
 * Malla 5×5 sobre lon [-78,-74] y lat [2,6], con un pico en el centro.
 * Valores por fila (y ascendente):
 *   y=2: 1 1 1 1 1
 *   y=3: 1 4 4 4 1
 *   y=4: 1 4 9 4 1
 *   y=5: 1 4 4 4 1
 *   y=6: 1 1 1 1 1
 */
const malla: MmiGrid = {
  xStart: -78,
  xStop: -74,
  xNum: 5,
  yStart: 2,
  yStop: 6,
  yNum: 5,
  values: [
    1, 1, 1, 1, 1,
    1, 4, 4, 4, 1,
    1, 4, 9, 4, 1,
    1, 4, 4, 4, 1,
    1, 1, 1, 1, 1,
  ],
};

/** Rectángulo lon/lat como polígono. */
function caja(oeste: number, sur: number, este: number, norte: number): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [oeste, sur],
        [este, sur],
        [este, norte],
        [oeste, norte],
        [oeste, sur],
      ],
    ],
  };
}

describe('bboxOf', () => {
  it('calcula la caja de un polígono', () => {
    assert.deepEqual(bboxOf(caja(-78, 2, -74, 6)), [-78, 2, -74, 6]);
  });

  it('recorre geometrías anidadas (MultiPolygon)', () => {
    const multi: Geometry = {
      type: 'MultiPolygon',
      coordinates: [caja(-78, 2, -77, 3).coordinates, caja(-75, 5, -74, 6).coordinates],
    };
    assert.deepEqual(bboxOf(multi), [-78, 2, -74, 6]);
  });
});

describe('maxMmiInPolygon', () => {
  it('toma el máximo de las celdas dentro del polígono, no el promedio', () => {
    // Un municipio que contiene el pico debe reportar el pico. Promediar
    // escondería justamente el lugar donde más fuerte se sintió.
    const resultado = maxMmiInPolygon(malla, caja(-77.5, 2.5, -74.5, 5.5));
    assert.equal(resultado?.mmi, 9);
    assert.equal(resultado?.method, 'grid');
  });

  it('no deja que un vecino cercano contamine el valor', () => {
    // Esta caja rodea el borde exterior y no toca la celda central de valor 9.
    const resultado = maxMmiInPolygon(malla, caja(-78.2, 1.8, -77.5, 2.5));
    assert.equal(resultado?.mmi, 1);
  });

  it('recurre al centroide cuando el municipio es más pequeño que una celda', () => {
    // Municipio diminuto alrededor de (-76, 4): no contiene ningún centro de celda…
    const resultado = maxMmiInPolygon(malla, caja(-76.02, 3.98, -76.015, 3.985));
    assert.equal(resultado?.method, 'centroid');
    // …pero sí está sobre la celda del pico, así que hereda su valor.
    assert.equal(resultado?.mmi, 9);
  });

  it('devuelve undefined si la geometría está vacía', () => {
    assert.equal(maxMmiInPolygon(malla, { type: 'Polygon', coordinates: [] }), undefined);
  });
});

describe('mmiToRoman', () => {
  it('redondea al grado entero: la escala Mercalli se comunica en enteros', () => {
    assert.equal(mmiToRoman(7.6), 'VIII');
    assert.equal(mmiToRoman(7.4), 'VII');
    assert.equal(mmiToRoman(6.5), 'VII');
  });

  it('satura en los extremos de la escala', () => {
    assert.equal(mmiToRoman(0.1), 'I');
    assert.equal(mmiToRoman(-3), 'I');
    assert.equal(mmiToRoman(99), 'XII');
  });
});

describe('joinMmiToMunicipios', () => {
  function municipios(): FeatureCollection<Geometry, MunicipioProperties> {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: caja(-77.5, 3.5, -74.5, 4.5),
          properties: {
            pcode: 'CO76001',
            name: 'Centro',
            admin1_pcode: 'CO76',
            admin1_name: 'Valle del Cauca',
          },
        },
        {
          type: 'Feature',
          geometry: caja(-78.5, 1.5, -77.5, 2.5),
          properties: {
            pcode: 'CO27001',
            name: 'Orilla',
            admin1_pcode: 'CO27',
            admin1_name: 'Chocó',
          },
        },
      ],
    };
  }

  it('ordena de mayor a menor intensidad', () => {
    const resultado = joinMmiToMunicipios(malla, municipios());
    assert.deepEqual(
      resultado.map((m) => m.name),
      ['Centro', 'Orilla'],
    );
    assert.equal(resultado[0]?.mmi, 9);
    assert.equal(resultado[0]?.mmi_roman, 'IX');
  });

  it('conserva la identidad del municipio y su departamento', () => {
    const centro = joinMmiToMunicipios(malla, municipios())[0];
    assert.equal(centro?.pcode, 'CO76001');
    assert.equal(centro?.admin1_name, 'Valle del Cauca');
  });

  it('registra el método para que el dato sea auditable', () => {
    for (const m of joinMmiToMunicipios(malla, municipios())) {
      assert.ok(m.method === 'grid' || m.method === 'centroid');
    }
  });

  it('redondea el MMI a un decimal', () => {
    const mallaDecimal: MmiGrid = { ...malla, values: malla.values.map((v) => v + 0.06789) };
    const resultado = joinMmiToMunicipios(mallaDecimal, municipios());
    assert.equal(resultado[0]?.mmi, 9.1);
  });

  it('omite los municipios sin cobertura en vez de inventarles un cero', () => {
    // Un cero se leería como «aquí no se sintió nada», que es una afirmación
    // que los datos no respaldan.
    const fuera: FeatureCollection<Geometry, MunicipioProperties> = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: {
            pcode: 'CO88001',
            name: 'Sin geometría',
            admin1_pcode: 'CO88',
            admin1_name: 'San Andrés',
          },
        },
      ],
    };

    assert.equal(joinMmiToMunicipios(malla, fuera).length, 0);
  });
});
