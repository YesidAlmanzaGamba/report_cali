import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aGeoJson,
  porMunicipio,
  publicables,
  recortarARejilla,
  type IncidenteCurado,
} from '../src/incidentes.js';

function incidente(overrides: Partial<IncidenteCurado> = {}): IncidenteCurado {
  return {
    tipo: 'edificacion_colapsada',
    pcode: 'CO17001',
    longitud: -75.513812,
    latitud: 5.068901,
    descripcion: 'Edificio colapsado en el centro',
    source: { name: 'El Tiempo', url: 'https://ejemplo.co/nota', type: 'press' },
    observed_at: '2026-08-11T15:00:00Z',
    verificado: false,
    ...overrides,
  };
}

describe('recortarARejilla', () => {
  it('mueve el punto menos de 100 m', () => {
    const { longitud, latitud } = recortarARejilla(-75.513812, 5.068901);

    const metrosLat = Math.abs(latitud - 5.068901) * 111_320;
    const metrosLon =
      Math.abs(longitud - -75.513812) * 111_320 * Math.cos((5.068901 * Math.PI) / 180);

    assert.ok(metrosLat < 100, `latitud se movió ${metrosLat.toFixed(0)} m`);
    assert.ok(metrosLon < 100, `longitud se movió ${metrosLon.toFixed(0)} m`);
  });

  it('manda dos puntos de la misma manzana al mismo sitio', () => {
    // Es el objetivo: que el punto publicado no distinga una casa de su vecina.
    const a = recortarARejilla(-75.513812, 5.068901);
    const b = recortarARejilla(-75.5139, 5.06895);

    assert.deepEqual(a, b);
  });

  it('separa puntos que están a más de 100 m', () => {
    const a = recortarARejilla(-75.5138, 5.0689);
    const b = recortarARejilla(-75.5138, 5.0725); // ~400 m al norte

    assert.notDeepEqual(a, b);
  });

  it('corrige el paso de longitud por la latitud', () => {
    // Un grado de longitud mide menos lejos del ecuador. Sin corregir, la celda saldría
    // rectangular y publicaría más precisión de la que decimos.
    const cerca = recortarARejilla(-75.5, 0.5);
    const lejos = recortarARejilla(-75.5, 11.5);

    assert.notEqual(cerca.longitud, lejos.longitud);
  });

  it('acepta otros tamaños de celda', () => {
    const cien = recortarARejilla(-75.5138, 5.0689, 100);
    const mil = recortarARejilla(-75.5138, 5.0689, 1000);

    assert.notDeepEqual(cien, mil);
  });
});

describe('publicables — la regla de ADR-012', () => {
  it('recorta lo NO verificado y lo deja marcado', () => {
    const [salida] = publicables([incidente({ verificado: false })]);

    assert.equal(salida?.precision, 'rejilla-100m');
    assert.notEqual(salida?.longitud, -75.513812);
  });

  it('conserva la ubicación exacta de lo verificado por una persona', () => {
    const [salida] = publicables([incidente({ verificado: true })]);

    assert.equal(salida?.precision, 'exacta');
    assert.equal(salida?.longitud, -75.513812);
    assert.equal(salida?.latitud, 5.068901);
  });

  it('la coordenada precisa no sobrevive al pipeline cuando no está verificada', () => {
    // La garantía de fondo: un error de front-end no puede filtrar lo que nunca salió
    // del servidor.
    const salida = publicables([incidente({ verificado: false })]);
    const serializado = JSON.stringify(salida);

    assert.ok(!serializado.includes('-75.513812'));
    assert.ok(!serializado.includes('5.068901'));
  });
});

describe('porMunicipio', () => {
  it('agrupa por P-code', () => {
    const grupos = porMunicipio(
      publicables([
        incidente({ pcode: 'CO17001' }),
        incidente({ pcode: 'CO17001' }),
        incidente({ pcode: 'CO76001' }),
      ]),
    );

    assert.equal(grupos.size, 2);
    assert.equal(grupos.get('CO17001')?.length, 2);
    assert.equal(grupos.get('CO76001')?.length, 1);
  });
});

describe('aGeoJson', () => {
  const geo = aGeoJson(publicables([incidente()])) as {
    type: string;
    features: { geometry: { coordinates: number[] }; properties: Record<string, unknown> }[];
  };

  it('produce una colección de puntos', () => {
    assert.equal(geo.type, 'FeatureCollection');
    assert.equal(geo.features.length, 1);
  });

  it('lleva la fuente y su enlace, como todo dato publicado', () => {
    assert.equal(geo.features[0]?.properties['fuente'], 'El Tiempo');
    assert.equal(geo.features[0]?.properties['fuente_url'], 'https://ejemplo.co/nota');
  });

  it('expone la precisión, para que el dato sea auditable', () => {
    assert.equal(geo.features[0]?.properties['precision'], 'rejilla-100m');
  });

  it('no incluye ningún campo de persona', () => {
    const claves = Object.keys(geo.features[0]?.properties ?? {});
    for (const prohibida of ['nombre', 'apellido', 'cedula', 'telefono']) {
      assert.ok(!claves.includes(prohibida));
    }
  });
});
