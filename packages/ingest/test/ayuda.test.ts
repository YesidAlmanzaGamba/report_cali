import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aGeoJson, enlaceBusqueda, enlaceMapa, publicar, type PuntoAyuda } from '../src/ayuda.js';

function punto(overrides: Partial<PuntoAyuda> = {}): PuntoAyuda {
  return {
    tipo: 'centro_acopio',
    nombre: 'Universidad de Caldas',
    pcode: 'CO17001',
    longitud: -75.4917,
    latitud: 5.057,
    direccion: 'Calle 65 # 26-10',
    horario: '8:00 a. m. a 6:00 p. m.',
    necesita: ['agua', 'alimentos no perecederos'],
    source: { name: 'El Tiempo', url: 'https://ejemplo.co/nota', type: 'press' },
    observed_at: '2026-08-11T15:00:00Z',
    activo: true,
    ...overrides,
  };
}

describe('enlaceMapa', () => {
  it('arma una URL de navegación con destino', () => {
    const url = enlaceMapa(-75.4917, 5.057);
    assert.ok(url.includes('destination=5.057,-75.4917'));
    assert.ok(url.startsWith('https://'));
  });

  it('pone latitud antes que longitud, que es el orden de los mapas', () => {
    // GeoJSON usa [lon, lat] y los mapas usan lat,lon. Invertirlo manda a la gente
    // al otro lado del mundo, y es un error que no se nota leyendo el código.
    const url = enlaceMapa(-75.4917, 5.057);
    assert.ok(!url.includes('destination=-75.4917'));
  });
});

describe('enlaceBusqueda', () => {
  it('escapa lo que el usuario no escribió', () => {
    const url = enlaceBusqueda('Universidad de Caldas, Manizales, Colombia');
    assert.ok(url.includes('Universidad%20de%20Caldas'));
    assert.ok(!url.includes(' '));
  });

  it('sobrevive a nombres con tildes y numerales', () => {
    // «Coliseo #2 de Bogotá»: el `#` corta la URL si no se escapa.
    const url = enlaceBusqueda('Coliseo #2 de Bogotá');
    assert.ok(!url.includes('#'));
    assert.ok(url.includes('Bogot%C3%A1'));
  });
});

describe('publicar', () => {
  it('agrega el enlace de cómo llegar', () => {
    const [p] = publicar([punto()]);
    assert.ok(p?.como_llegar.includes('maps'));
  });

  it('conserva la ubicación EXACTA — política contraria a incidentes', () => {
    // En `incidentes` lo no verificado se recorta a 100 m. Aquí no: que se encuentre
    // fácil es justamente el objetivo.
    const [p] = publicar([punto()]);
    assert.equal(p?.longitud, -75.4917);
    assert.equal(p?.latitud, 5.057);
  });

  it('omite los puntos que ya no operan', () => {
    assert.equal(publicar([punto({ activo: false })]).length, 0);
  });

  it('acepta puntos lejos de la zona del sismo', () => {
    // Muchos centros de acopio están en Bogotá: ahí está quien quiere donar.
    const bogota = punto({ pcode: 'CO11001', longitud: -74.07, latitud: 4.71 });
    assert.equal(publicar([bogota]).length, 1);
  });
});

describe('aGeoJson', () => {
  const geo = aGeoJson(publicar([punto()])) as {
    features: { geometry: { coordinates: number[] }; properties: Record<string, unknown> }[];
  };

  it('usa el orden [lon, lat] que pide GeoJSON', () => {
    assert.deepEqual(geo.features[0]?.geometry.coordinates, [-75.4917, 5.057]);
  });

  it('lleva lo que hace falta para llegar y para saber qué llevar', () => {
    const p = geo.features[0]?.properties ?? {};
    assert.equal(p['nombre'], 'Universidad de Caldas');
    assert.equal(p['direccion'], 'Calle 65 # 26-10');
    assert.equal(p['necesita'], 'agua, alimentos no perecederos');
    assert.ok(String(p['como_llegar']).includes('maps'));
  });

  it('deja el teléfono vacío cuando la fuente no lo publicó', () => {
    // Nunca se deduce: un número equivocado manda a alguien a ninguna parte.
    assert.equal(geo.features[0]?.properties['telefono'], '');
  });

  it('lleva la fuente, como todo dato publicado', () => {
    assert.equal(geo.features[0]?.properties['fuente_url'], 'https://ejemplo.co/nota');
  });
});
