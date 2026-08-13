import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aSugerencias,
  coordenadaDe,
  fechaLocalDe,
  leerCsv,
  municipioDeFila,
  CoordenadaIlegible,
} from '../src/campo.js';
import type { MunicipioRef } from '../src/sources/noticias.js';

const municipios: MunicipioRef[] = [
  { pcode: 'CO76869', name: 'Versalles', admin1_name: 'Valle del Cauca' },
  { pcode: 'CO76147', name: 'Cartago', admin1_name: 'Valle del Cauca' },
  { pcode: 'CO27787', name: 'Tadó', admin1_name: 'Chocó' },
  { pcode: 'CO66682', name: 'Santa Rosa de Cabal', admin1_name: 'Risaralda' },
];

describe('coordenadaDe', () => {
  it('lee el centro del mapa (/@lat,lon,zoom)', () => {
    assert.deepEqual(coordenadaDe('https://www.google.com/maps/@4.5709,-76.1934,17z'), {
      lat: 4.5709,
      lon: -76.1934,
    });
  });

  it('lee un punto marcado (?q=lat,lon)', () => {
    assert.deepEqual(coordenadaDe('https://maps.google.com/?q=4.5709,-76.1934'), {
      lat: 4.5709,
      lon: -76.1934,
    });
  });

  it('lee una ficha de lugar (!3dlat!4dlon)', () => {
    assert.deepEqual(
      coordenadaDe('https://www.google.com/maps/place/X/data=!4m5!3m4!1s0x0:0x0!8m2!3d4.5709!4d-76.1934'),
      { lat: 4.5709, lon: -76.1934 },
    );
  });

  it('lee un par escrito a mano', () => {
    assert.deepEqual(coordenadaDe('4.5709, -76.1934'), { lat: 4.5709, lon: -76.1934 });
  });

  /**
   * Resolverlos exige red y seguir una redirección. Fallar ruidosamente es mejor que
   * acertar a veces: una coordenada mal resuelta manda un equipo al sitio equivocado.
   */
  it('rechaza los enlaces cortos y dice qué hacer', () => {
    assert.throws(
      () => coordenadaDe('https://maps.app.goo.gl/abc123'),
      (e: Error) => e instanceof CoordenadaIlegible && /enlace largo/.test(e.message),
    );
  });

  /** Google escribe lat,lon; GeoJSON quiere lon,lat. Invertirlos saca el punto del país. */
  it('detecta las coordenadas invertidas en vez de publicar un punto en el océano', () => {
    assert.throws(
      () => coordenadaDe('-76.1934, 4.5709'),
      (e: Error) => e instanceof CoordenadaIlegible && /fuera de Colombia/.test(e.message),
    );
  });

  it('rechaza lo que no es coordenada', () => {
    assert.throws(() => coordenadaDe('cerca del parque'), CoordenadaIlegible);
    assert.throws(() => coordenadaDe(''), CoordenadaIlegible);
  });
});

describe('fechaLocalDe', () => {
  it('asume hora de Colombia cuando no se escribe zona', () => {
    assert.equal(fechaLocalDe('2026-08-12 15:20'), '2026-08-12T20:20:00.000Z');
  });

  it('respeta la zona si la persona la escribió', () => {
    assert.equal(fechaLocalDe('2026-08-12T15:20:00Z'), '2026-08-12T15:20:00.000Z');
  });

  it('rechaza lo que no es fecha', () => {
    assert.throws(() => fechaLocalDe('esta mañana'), /no es una fecha/);
  });
});

describe('leerCsv', () => {
  it('respeta comas y saltos de línea dentro de comillas', () => {
    const filas = leerCsv('a,b\n"uno, con coma","dos\ncon salto"\n');
    assert.deepEqual(filas, [
      ['a', 'b'],
      ['uno, con coma', 'dos\ncon salto'],
    ]);
  });

  it('entiende las comillas dobles escapadas y descarta filas vacías', () => {
    assert.deepEqual(leerCsv('a\n"dijo ""hola"""\n\n\n'), [['a'], ['dijo "hola"']]);
  });
});

describe('municipioDeFila', () => {
  it('encuentra el municipio aunque se escriba en minúscula y sin tilde', () => {
    assert.equal(municipioDeFila('versalles', municipios)?.pcode, 'CO76869');
    assert.equal(municipioDeFila('tado', municipios)?.pcode, 'CO27787');
  });

  it('prefiere el nombre más largo', () => {
    assert.equal(municipioDeFila('Santa Rosa de Cabal', municipios)?.pcode, 'CO66682');
  });

  it('devuelve undefined si no reconoce nada', () => {
    assert.equal(municipioDeFila('Springfield', municipios), undefined);
    assert.equal(municipioDeFila('', municipios), undefined);
  });
});

const cabecera = 'cuando,donde,municipio,que,descripcion,fuente,foto';

describe('aSugerencias', () => {
  it('traduce una fila buena y la deja lista para revisión', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,edificacion_colapsada,Fachada caída sobre la vía,"Radio Versalles 1250 AM, boletín de las 14:00",https://drive.google.com/x`;

    const { sugerencias, rechazos } = aSugerencias(leerCsv(csv), { municipios });
    assert.deepEqual(rechazos, []);
    assert.equal(sugerencias.length, 1);

    const s = sugerencias[0];
    assert.equal(s?.pcode, 'CO76869');
    assert.equal(s?.tipo, 'edificacion_colapsada');
    assert.equal(s?.longitud, -76.1934);
    assert.equal(s?.observed_at, '2026-08-12T20:20:00.000Z');
    assert.equal(s?.foto, 'https://drive.google.com/x');
  });

  /** ADR-012: nada de campo entra como verificado, por muy en el sitio que se estuviera. */
  it('marca todo como no verificado, para que se recorte a la rejilla de 100 m', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,edificacion_colapsada,Algo,"observación propia en el sitio",`;
    const { sugerencias } = aSugerencias(leerCsv(csv), { municipios });
    assert.equal(sugerencias[0]?.verificado, false);
  });

  /** ADR-013: la fuente sin URL solo vale si dice cómo comprobarla. */
  it('sale con fuente unverified, nombre corto y detalle completo', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,via_bloqueada,Derrumbe,"Radio Versalles, boletín de las 14:00",`;
    const { sugerencias } = aSugerencias(leerCsv(csv), { municipios });
    assert.equal(sugerencias[0]?.source.type, 'unverified');
    // El nombre cabe en una ficha; el detalle conserva cómo comprobarlo.
    assert.equal(sugerencias[0]?.source.name, 'Radio Versalles');
    assert.equal(sugerencias[0]?.source.detalle, 'Radio Versalles, boletín de las 14:00');
  });

  it('conserva la fuente entera como nombre cuando no hay coma que la parta', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,via_bloqueada,Derrumbe,"observación propia en el sitio",`;
    const { sugerencias } = aSugerencias(leerCsv(csv), { municipios });
    assert.equal(sugerencias[0]?.source.name, 'observación propia en el sitio');
  });

  it('rechaza una fuente demasiado corta para ser comprobable', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,via_bloqueada,Derrumbe,radio,`;
    const { sugerencias, rechazos } = aSugerencias(leerCsv(csv), { municipios });
    assert.equal(sugerencias.length, 0);
    assert.match(rechazos[0]?.motivo ?? '', /emisora y la hora/);
  });

  it('rechaza un tipo que el mapa no sabe dibujar, y dice cuáles valen', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,se cayó una casa,Algo,"observación propia en el sitio",`;
    const { rechazos } = aSugerencias(leerCsv(csv), { municipios });
    assert.match(rechazos[0]?.motivo ?? '', /no es un tipo/);
    assert.match(rechazos[0]?.motivo ?? '', /edificacion_colapsada/);
  });

  it('dice el número de fila para poder arreglarla en la hoja', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,edificacion_colapsada,Bien,"observación propia en el sitio",
2026-08-12 15:30,no es coordenada,Cartago,edificacion_colapsada,Mal,"observación propia en el sitio",`;
    const { sugerencias, rechazos } = aSugerencias(leerCsv(csv), { municipios });
    assert.equal(sugerencias.length, 1);
    assert.equal(rechazos[0]?.fila, 3, 'la cabecera es la fila 1');
  });

  /**
   * Los límites de `data/` están simplificados y mienten cerca de un borde — el caso
   * documentado de la Cruz Roja de Caldas. Manda quien estuvo ahí; esto solo avisa.
   */
  it('avisa si el punto cae fuera del municipio, pero no lo descarta', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,edificacion_colapsada,Junto al río,"observación propia en el sitio",`;
    const { sugerencias } = aSugerencias(leerCsv(csv), {
      municipios,
      dentroDe: () => false,
    });
    assert.equal(sugerencias.length, 1);
    assert.equal(sugerencias[0]?.pcode, 'CO76869', 'manda el municipio que escribió la persona');
    assert.match(sugerencias[0]?.revisar ?? '', /no cae dentro de Versalles/);
  });

  it('no avisa cuando el punto sí cae dentro', () => {
    const csv = `${cabecera}
2026-08-12 15:20,"4.5709, -76.1934",Versalles,edificacion_colapsada,Algo,"observación propia en el sitio",`;
    const { sugerencias } = aSugerencias(leerCsv(csv), { municipios, dentroDe: () => true });
    assert.equal(sugerencias[0]?.revisar, undefined);
  });

  it('avisa si a la hoja le faltan columnas, en vez de importar basura', () => {
    const { sugerencias, rechazos } = aSugerencias(leerCsv('cuando,donde\n2026-08-12,x'), {
      municipios,
    });
    assert.equal(sugerencias.length, 0);
    assert.match(rechazos[0]?.motivo ?? '', /faltan columnas/);
  });
});
