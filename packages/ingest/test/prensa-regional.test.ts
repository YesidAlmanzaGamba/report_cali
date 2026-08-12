import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MunicipioRef } from '../src/sources/noticias.js';
import {
  MEDIOS_REGIONALES,
  fechaDe,
  municipioDeNota,
  parsearFeedRegional,
  rutaComoTexto,
  textoPlano,
  type MedioRegional,
} from '../src/sources/prensa-regional.js';

const municipios: MunicipioRef[] = [
  { pcode: 'CO66001', name: 'Pereira', admin1_name: 'Risaralda' },
  { pcode: 'CO66682', name: 'Santa Rosa de Cabal', admin1_name: 'Risaralda' },
  { pcode: 'CO66400', name: 'La Unión', admin1_name: 'Risaralda' },
  { pcode: 'CO76400', name: 'La Unión', admin1_name: 'Valle del Cauca' },
  { pcode: 'CO76622', name: 'Roldanillo', admin1_name: 'Valle del Cauca' },
  { pcode: 'CO76246', name: 'El Cairo', admin1_name: 'Valle del Cauca' },
  { pcode: 'CO27001', name: 'Quibdó', admin1_name: 'Chocó' },
];

const pereira: MedioRegional = {
  nombre: 'El Diario (Pereira)',
  url: 'https://www.eldiario.com.co/feed/',
  tipo: 'press',
  departamentos: ['Risaralda'],
};

const cali: MedioRegional = {
  nombre: 'El País (Cali)',
  url: 'https://www.elpais.com.co/arc/outboundfeeds/rss/',
  tipo: 'press',
  departamentos: ['Valle del Cauca', 'Cauca'],
};

/** Sismo del 10 de agosto: nada anterior debe entrar. */
const DESDE = new Date('2026-08-10T00:00:00Z');

describe('textoPlano', () => {
  it('quita etiquetas y entidades del resumen', () => {
    assert.equal(textoPlano('<p>Da&amp;ntilde;os en <b>Pereira</b></p>'), 'Da&ntilde;os en Pereira');
    assert.equal(textoPlano('<a href="x">Colapso</a>  en  la vía'), 'Colapso en la vía');
  });
});

describe('rutaComoTexto', () => {
  it('convierte la ruta en palabras capitalizadas', () => {
    assert.equal(
      rutaComoTexto('https://www.eldiario.com.co/noticias/risaralda/pereira/utp-restringe-ingreso'),
      'Noticias Risaralda Pereira Utp Restringe Ingreso',
    );
  });

  it('descarta los tramos numéricos, que son identificadores', () => {
    assert.equal(rutaComoTexto('https://x.co/cali/centro-acopio-120'), 'Cali Centro Acopio');
  });

  it('no revienta con una URL inválida', () => {
    assert.equal(rutaComoTexto('no-es-una-url'), '');
  });
});

describe('municipioDeNota', () => {
  it('usa la ruta de la URL aunque el titular no nombre el municipio', () => {
    const m = municipioDeNota(
      'UTP mantiene actividades virtuales tras el terremoto',
      '',
      'https://www.eldiario.com.co/noticias/risaralda/pereira/utp-mantiene-actividades',
      pereira,
      municipios,
    );
    assert.equal(m?.pcode, 'CO66001');
  });

  it('desempata homónimos por el departamento que cubre el medio', () => {
    const desdePereira = municipioDeNota(
      'Emergencia en La Unión',
      '',
      'https://www.eldiario.com.co/noticias/emergencia',
      pereira,
      municipios,
    );
    assert.equal(desdePereira?.admin1_name, 'Risaralda');

    const desdeCali = municipioDeNota(
      'Emergencia en La Unión',
      '',
      'https://www.elpais.com.co/valle/emergencia',
      cali,
      municipios,
    );
    assert.equal(desdeCali?.admin1_name, 'Valle del Cauca');
  });

  it('encuentra municipios pequeños que la cobertura nacional nunca nombra', () => {
    assert.equal(
      municipioDeNota('Roldanillo reporta viviendas averiadas', '', 'https://x.co/a', cali, municipios)
        ?.pcode,
      'CO76622',
    );
    assert.equal(
      municipioDeNota('Reportan daños en El Cairo', '', 'https://x.co/a', cali, municipios)?.pcode,
      'CO76246',
    );
  });

  it('lee el resumen solo para el departamento que el medio cubre', () => {
    const choco: MedioRegional = {
      nombre: 'Chocó 7 Días',
      url: 'https://choco7dias.com/feed/',
      tipo: 'press',
      departamentos: ['Chocó'],
    };
    const m = municipioDeNota(
      'Continúa la remoción de escombros',
      'Los equipos trabajan en Quibdó desde el martes.',
      'https://choco7dias.com/a',
      choco,
      municipios,
    );
    assert.equal(m?.pcode, 'CO27001');
  });

  /**
   * Caso real de producción: «El doble drama de Sipí, Chocó» quedó etiquetada como
   * Murillo (Tolima) porque el resumen decía «el alcalde Jairo Antonio Murillo».
   */
  it('no confunde un apellido del resumen con un municipio', () => {
    const conMurillo: MunicipioRef[] = [
      ...municipios,
      { pcode: 'CO73461', name: 'Murillo', admin1_name: 'Tolima' },
    ];
    const nacional: MedioRegional = {
      nombre: 'El Tiempo',
      url: 'https://www.eltiempo.com/rss/colombia.xml',
      tipo: 'press',
      departamentos: [],
    };

    const m = municipioDeNota(
      'El doble drama de Sipí, Chocó: el terremoto que golpeó a un municipio cercado',
      'El alcalde Jairo Antonio Murillo aseguró que 260 viviendas quedaron destruidas.',
      'https://www.eltiempo.com/colombia/otras-ciudades/el-doble-drama-de-sipi-choco-3577920',
      nacional,
      conMurillo,
    );
    assert.equal(m, undefined, 'un apellido no puede etiquetar la nota');
  });

  /**
   * Tadó y Sipí tienen cuatro letras y la regla general pide cinco, así que la cobertura
   * del Chocó —uno de los departamentos más golpeados— se perdía entera.
   */
  it('encuentra municipios de cuatro letras dentro del departamento del medio', () => {
    const choco: MedioRegional = {
      nombre: 'Chocó 7 Días',
      url: 'https://choco7dias.com/feed/',
      tipo: 'press',
      departamentos: ['Chocó'],
    };
    const conCortos: MunicipioRef[] = [
      ...municipios,
      { pcode: 'CO27787', name: 'Tadó', admin1_name: 'Chocó' },
    ];

    assert.equal(
      municipioDeNota('Tadó sigue sin agua potable', '', 'https://choco7dias.com/a', choco, conCortos)
        ?.pcode,
      'CO27787',
    );

    // Y sigue sin encontrarlos para un medio que no cubre el Chocó.
    assert.equal(
      municipioDeNota('Tadó sigue sin agua potable', '', 'https://x.co/a', cali, conCortos),
      undefined,
    );
  });

  it('prefiere el nombre más largo', () => {
    const m = municipioDeNota('Daños en Santa Rosa de Cabal', '', 'https://x.co/a', pereira, municipios);
    assert.equal(m?.pcode, 'CO66682');
  });
});

const feed = `<?xml version="1.0"?><rss><channel>
<item>
  <title>UTP restringe el ingreso al campus tras el terremoto</title>
  <link>https://www.eldiario.com.co/noticias/risaralda/pereira/utp-restringe</link>
  <pubDate>Wed, 12 Aug 2026 14:03:20 +0000</pubDate>
  <description><![CDATA[<a href="x">La universidad</a> evalúa daños estructurales.]]></description>
</item>
<item>
  <title>VENTA LOTES</title>
  <link>https://www.eldiario.com.co/clasificados/venta-lotes</link>
  <pubDate>Wed, 12 Aug 2026 10:00:00 +0000</pubDate>
  <description>Lotes en venta</description>
</item>
<item>
  <title>Colapso parcial de una vivienda en Roldanillo</title>
  <link>https://www.eldiario.com.co/noticias/nacional/roldanillo</link>
  <pubDate>Mon, 03 Aug 2026 09:00:00 +0000</pubDate>
  <description>Nota anterior al sismo</description>
</item>
<item>
  <title>Sismo: albergues habilitados</title>
  <link>https://www.eldiario.com.co/noticias/sin-fecha</link>
  <description>Sin pubDate</description>
</item>
</channel></rss>`;

describe('parsearFeedRegional', () => {
  const notas = parsearFeedRegional(feed, pereira, { municipios, desde: DESDE });

  it('deja fuera lo que no habla del desastre', () => {
    assert.equal(
      notas.some((n) => n.titulo === 'VENTA LOTES'),
      false,
    );
  });

  it('deja fuera lo anterior al sismo aunque hable de colapsos', () => {
    assert.equal(
      notas.some((n) => n.titulo.includes('Roldanillo')),
      false,
    );
  });

  it('deja fuera lo que no trae fecha', () => {
    assert.equal(
      notas.some((n) => n.titulo.includes('albergues')),
      false,
    );
  });

  it('conserva la nota buena, con el medio de la configuración', () => {
    assert.equal(notas.length, 1);
    const nota = notas[0];
    assert.equal(nota?.medio, 'El Diario (Pereira)');
    assert.equal(nota?.tipo, 'press');
    assert.equal(nota?.pcode, 'CO66001');
    assert.equal(nota?.fuente_feed, pereira.url);
    assert.equal(nota?.publicado, '2026-08-12T14:03:20.000Z');
  });
});

describe('fechaDe', () => {
  it('entiende el RFC-822 de los feeds de prensa', () => {
    assert.equal(
      new Date(fechaDe('Wed, 12 Aug 2026 14:03:20 +0000')).toISOString(),
      '2026-08-12T14:03:20.000Z',
    );
  });

  /**
   * El CMS de gov.co manda `2026-08-12 09:40:28` sin zona. Interpretarlo como hora local
   * del proceso —UTC en el runner— envejece las notas cinco horas.
   */
  it('interpreta la fecha sin zona de gov.co como hora de Bogotá', () => {
    assert.equal(
      new Date(fechaDe('2026-08-12 09:40:28')).toISOString(),
      '2026-08-12T14:40:28.000Z',
    );
    assert.equal(
      new Date(fechaDe('2026-08-12T09:40:28')).toISOString(),
      '2026-08-12T14:40:28.000Z',
    );
  });

  it('devuelve NaN con lo que no es fecha', () => {
    assert.ok(Number.isNaN(fechaDe('')));
    assert.ok(Number.isNaN(fechaDe('el martes')));
  });
});

describe('CHOCAN_CON_APELLIDOS', () => {
  /**
   * Caso real: en el feed de la Gobernación del Valle, «Toro» aparece en 21 de 100
   * entradas y en todas es el apellido de la gobernadora, Dilian Francisca Toro.
   */
  it('no atribuye a Toro (Valle) lo que dice el apellido de la gobernadora', () => {
    const gobernacion: MedioRegional = {
      nombre: 'Gobernación del Valle del Cauca',
      url: 'https://www.valledelcauca.gov.co/rss',
      tipo: 'official',
      departamentos: ['Valle del Cauca'],
    };
    const conToro: MunicipioRef[] = [
      ...municipios,
      { pcode: 'CO76823', name: 'Toro', admin1_name: 'Valle del Cauca' },
    ];

    assert.equal(
      municipioDeNota(
        'La Gobernadora Dilian Francisca Toro anunció medidas para los damnificados',
        '',
        'https://www.valledelcauca.gov.co/publicaciones/90193/gobernadora-anuncio',
        gobernacion,
        conToro,
      ),
      undefined,
    );
  });

  it('sigue encontrando los cortos que no chocan con apellidos', () => {
    const choco: MedioRegional = {
      nombre: 'Chocó 7 Días',
      url: 'https://choco7dias.com/feed/',
      tipo: 'press',
      departamentos: ['Chocó'],
    };
    const conTado: MunicipioRef[] = [
      ...municipios,
      { pcode: 'CO27787', name: 'Tadó', admin1_name: 'Chocó' },
    ];
    assert.equal(
      municipioDeNota('Tadó sigue sin agua', '', 'https://choco7dias.com/a', choco, conTado)?.pcode,
      'CO27787',
    );
  });
});

describe('MEDIOS_REGIONALES', () => {
  it('incluye la gaceta oficial del Valle, marcada como oficial', () => {
    const gobernacion = MEDIOS_REGIONALES.find((m) => m.url.includes('valledelcauca.gov.co'));
    assert.ok(gobernacion, 'falta la Gobernación del Valle');
    assert.equal(gobernacion?.tipo, 'official');
  });

  it('no repite URLs', () => {
    const urls = MEDIOS_REGIONALES.map((m) => m.url);
    assert.equal(new Set(urls).size, urls.length);
  });

  it('todos son https, que es lo que el runner puede pedir sin proxy', () => {
    for (const m of MEDIOS_REGIONALES) {
      assert.ok(m.url.startsWith('https://'), `${m.nombre} no es https`);
    }
  });

  it('cubre los departamentos con más municipios sobre el umbral de daño', () => {
    const cubiertos = new Set(MEDIOS_REGIONALES.flatMap((m) => m.departamentos));
    for (const d of ['Valle del Cauca', 'Tolima', 'Chocó', 'Risaralda', 'Cauca']) {
      assert.ok(cubiertos.has(d), `sin medio propio para ${d}`);
    }
  });
});
