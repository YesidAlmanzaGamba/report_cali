/**
 * Pruebas contra respuestas REALES grabadas. Cada fixture es un error que de verdad
 * ocurrió o que estuvo a punto de ocurrir; ninguno es inventado para que la prueba pase.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  desdeNominatim,
  desdeOverpass,
  dispersion,
  distancia,
  esPreciso,
  evaluar,
  nombreCoincide,
  type Candidato,
} from '../src/geocodificar.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/geocode');
const fx = (n: string): unknown => JSON.parse(readFileSync(resolve(dir, `${n}.json`), 'utf8'));

const enCali = (lon: number, lat: number): boolean =>
  lon > -76.6 && lon < -76.4 && lat > 3.3 && lat < 3.6;
const siempre = (): boolean => true;

describe('esPreciso — separa una sede de una calle o un barrio', () => {
  it('acepta un estadio', () => {
    const [c] = desdeNominatim(fx('limpio-el-campin'));
    assert.equal(c?.clase, 'leisure/stadium');
    assert.ok(esPreciso(c!));
  });

  it('rechaza una vía: «Carrera 43 #6-120» geocodifica a un kilómetro de calle', () => {
    const c = desdeNominatim(fx('impreciso-via'));
    assert.ok(c.length > 0);
    assert.equal(c.filter(esPreciso).length, 0, 'ninguna vía debería pasar');
  });

  it('rechaza un barrio: «Barranquillita» no es el centro de acopio', () => {
    const [c] = desdeNominatim(fx('impreciso-barrio'));
    assert.equal(c?.clase, 'place/neighbourhood');
    assert.ok(!esPreciso(c!));
  });

  it('acepta una plazoleta, que sí es un lugar concreto', () => {
    assert.ok(esPreciso({ lon: -76.53, lat: 3.45, clase: 'place/square', rango: 25, nombre: 'x' }));
  });

  it('rechaza por rango aunque la clase sirva', () => {
    assert.ok(!esPreciso({ lon: -76.5, lat: 3.4, clase: 'amenity/school', rango: 20, nombre: 'x' }));
  });
});

describe('nombreCoincide — la revisión que atrapa el error real', () => {
  it('rechaza la sustitución que produjo el punto malo', () => {
    // Se buscó «Ciudadela del Petronio», no salió, y se sustituyó a mano por el complejo
    // que la contiene. Esa sustitución fue el error, y aquí queda cerrada.
    assert.ok(!nombreCoincide('Ciudadela del Petronio', 'Unidad Deportiva Alberto Galindo'));
  });

  it('acepta que el resultado sea más largo que la consulta', () => {
    assert.ok(nombreCoincide('Estadio El Campín', 'Estadio Nemesio Camacho El Campín'));
  });

  it('ignora tildes, mayúsculas y puntuación', () => {
    assert.ok(nombreCoincide('Coliseo Menor Ramón Marín Vargas', 'coliseo menor ramon marin vargas'));
  });

  it('rechaza un nombre sin palabras distintivas', () => {
    // «Centro de la sede» no identifica nada: todas sus palabras son de relleno.
    assert.ok(!nombreCoincide('Centro de la sede', 'Coliseo El Pueblo'));
  });

  it('no le basta con que compartan una palabra', () => {
    assert.ok(!nombreCoincide('Universidad de Caldas', 'Universidad Nacional'));
  });
});

describe('dispersion', () => {
  it('mide la mayor separación entre homónimos', () => {
    const o = desdeOverpass(fx('overpass-ambiguo-galindo'));
    assert.equal(o.length, 3);
    assert.ok(dispersion(o) > 2000, `dispersión medida: ${Math.round(dispersion(o))} m`);
  });

  it('con un solo sitio no hay dispersión', () => {
    assert.equal(dispersion(desdeOverpass(fx('overpass-limpio-hockey'))), 0);
  });

  it('POR QUÉ NO ALCANZA SOLA: Nominatim no delata los homónimos', () => {
    // Se probó `dedupe=0` además de `limit=5`, y sigue devolviendo uno. Los otros dos
    // «Alberto Galindo» tienen nombres distintos, así que no son homónimos exactos: la
    // dispersión nunca los iba a ver. Por eso la revisión que vale es `nombreCoincide`.
    assert.equal(desdeNominatim(fx('ambiguo-alberto-galindo')).length, 1);
  });
});

describe('evaluar — el veredicto', () => {
  it('EL CASO DE LA CIUDADELA DEL PETRONIO: se rechaza en vez de sustituirse', () => {
    // Respuesta real y grabada: consultando el nombre de la sede tal como sale del
    // titular, Nominatim devuelve CERO resultados. Eso es lo correcto — no está mapeada.
    //
    // El punto malo se publicó porque, al ver ese cero, sustituí el nombre a mano por el
    // del complejo que la contiene y me quedé con SU coordenada, a 2 km. El automatismo
    // no puede hacer eso: consulta el nombre que le dan y se queda sin respuesta.
    const v = evaluar('Ciudadela del Petronio', desdeNominatim(fx('petronio-real')), enCali);
    assert.equal(v.motivo, 'sin_resultado');
    assert.equal(v.lon, undefined, 'un rechazo no puede devolver coordenada');
  });

  it('y si alguien sustituyera el nombre, la revisión lo atrapa igual', () => {
    // El mismo error, ahora simulando que el resultado llega desde otro nombre.
    const v = evaluar(
      'Ciudadela del Petronio',
      desdeNominatim(fx('ambiguo-alberto-galindo')),
      enCali,
    );
    assert.equal(v.motivo, 'otro_sitio');
    assert.equal(v.lon, undefined);
    assert.match(v.detalle, /Alberto Galindo/);
  });

  it('acepta El Campín', () => {
    const v = evaluar('Estadio El Campín', desdeNominatim(fx('limpio-el-campin')), siempre);
    assert.equal(v.motivo, 'ok');
    assert.ok(Math.abs(v.lat! - 4.6459) < 0.01);
    assert.ok(Math.abs(v.lon! - -74.0776) < 0.01);
  });

  it('rechaza cuando no hay nada', () => {
    const v = evaluar('Sede inexistente', desdeNominatim(fx('sin-resultado')), siempre);
    assert.equal(v.motivo, 'sin_resultado');
  });

  it('rechaza la dirección que geocodifica a la vía', () => {
    const v = evaluar('Carrera 43 # 6-120', desdeNominatim(fx('impreciso-via')), siempre);
    assert.equal(v.motivo, 'impreciso');
  });

  it('rechaza el sitio correcto en la ciudad equivocada', () => {
    // El nombre coincide y la sede es precisa; lo que falla es que la fuente decía Cali.
    // Es la última barrera, y tiene que dispararse aunque todo lo demás esté bien.
    const v = evaluar('Estadio El Campín', desdeNominatim(fx('limpio-el-campin')), enCali);
    assert.equal(v.motivo, 'fuera_del_municipio');
    assert.equal(v.lon, undefined);
  });

  it('ningún rechazo devuelve coordenadas — la regla que hace esto publicable', () => {
    const rechazos: Candidato[][] = [
      desdeNominatim(fx('sin-resultado')),
      desdeNominatim(fx('impreciso-via')),
      desdeNominatim(fx('impreciso-barrio')),
    ];
    for (const r of rechazos) {
      const v = evaluar('x', r, siempre);
      assert.notEqual(v.motivo, 'ok');
      assert.equal(v.lon, undefined);
      assert.equal(v.lat, undefined);
    }
  });
});

describe('distancia', () => {
  it('mide en metros a escala de ciudad', () => {
    // Los dos coliseos de Palogrande, medidos a mano: 318 m.
    const a: Candidato = { lon: -75.4914175, lat: 5.0587763, clase: 'x/y', nombre: 'a' };
    const b: Candidato = { lon: -75.4912065, lat: 5.0559074, clase: 'x/y', nombre: 'b' };
    assert.ok(Math.abs(distancia(a, b) - 318) < 15, `midió ${Math.round(distancia(a, b))} m`);
  });
});
