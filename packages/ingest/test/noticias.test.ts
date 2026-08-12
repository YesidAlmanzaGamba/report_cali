import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  consultasPara,
  municipioDe,
  nombresAmbiguos,
  normalizar,
  parsearFeed,
  type MunicipioRef,
} from '../src/sources/noticias.js';

const municipios: MunicipioRef[] = [
  { pcode: 'CO17001', name: 'Manizales' },
  { pcode: 'CO66001', name: 'Pereira' },
  { pcode: 'CO76001', name: 'Cali' },
  { pcode: 'CO27001', name: 'Quibdó' },
  { pcode: 'CO66682', name: 'Santa Rosa de Cabal' },
  { pcode: 'CO66045', name: 'Rosa' }, // inventado, para probar el desempate por longitud
  { pcode: 'CO20011', name: 'La Paz' },
];

const feed = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Terremoto en Manizales: 12 edificios colapsados &amp; 3 v&#39;ias cerradas</title>
  <link>https://ejemplo.co/a</link>
  <pubDate>Mon, 11 Aug 2026 14:00:00 GMT</pubDate>
  <source url="https://www.eltiempo.com">El Tiempo</source>
</item>
<item>
  <title>UNGRD entrega balance nacional</title>
  <link>https://portal.gestiondelriesgo.gov.co/b</link>
  <pubDate>Mon, 11 Aug 2026 10:00:00 GMT</pubDate>
  <source url="https://portal.gestiondelriesgo.gov.co">portal.gestiondelriesgo.gov.co</source>
</item>
<item>
  <title>Nota sin enlace</title>
  <pubDate>Mon, 11 Aug 2026 09:00:00 GMT</pubDate>
  <source>Blog cualquiera</source>
</item>
</channel></rss>`;

describe('parsearFeed', () => {
  const candidatos = parsearFeed(feed);

  it('extrae los artículos que traen título y enlace', () => {
    assert.equal(candidatos.length, 2);
  });

  it('decodifica las entidades HTML del titular', () => {
    assert.ok(candidatos[0]?.titulo.includes('&'));
    assert.ok(!candidatos[0]?.titulo.includes('&amp;'));
    assert.ok(candidatos[0]?.titulo.includes("'"));
  });

  it('convierte la fecha a ISO', () => {
    assert.equal(candidatos[0]?.publicado, '2026-08-11T14:00:00.000Z');
  });

  it('clasifica un portal .gov.co como fuente oficial', () => {
    assert.equal(candidatos[1]?.tipo, 'official');
  });

  it('clasifica un medio conocido como prensa, sin suavizarlo', () => {
    // Un medio serio sigue siendo prensa y no una cifra oficial.
    assert.equal(candidatos[0]?.tipo, 'press');
  });

  it('marca como no verificado lo que no reconoce', () => {
    const otro = parsearFeed(`<rss><item><title>Algo</title><link>https://x.co/1</link>
      <source>Portal desconocido</source></item></rss>`);
    assert.equal(otro[0]?.tipo, 'unverified');
  });

  it('no revienta con un feed vacío', () => {
    assert.deepEqual(parsearFeed('<rss></rss>'), []);
  });
});

describe('municipioDe', () => {
  it('reconoce el municipio mencionado en el titular', () => {
    const m = municipioDe('Terremoto en Manizales: 12 edificios colapsados', municipios);
    assert.equal(m?.pcode, 'CO17001');
  });

  it('funciona sin tildes en el titular', () => {
    assert.equal(municipioDe('Daños graves en Quibdo', municipios)?.pcode, 'CO27001');
  });

  it('prefiere el nombre más largo cuando hay varios', () => {
    // «Santa Rosa de Cabal» debe ganarle a «Rosa».
    const m = municipioDe('Emergencia en Santa Rosa de Cabal tras el sismo', municipios);
    assert.equal(m?.pcode, 'CO66682');
  });

  it('no confunde un giro común con el municipio del mismo nombre', () => {
    // «La Paz» es municipio y también expresión corriente. La minúscula lo delata.
    assert.equal(municipioDe('Marchas por la paz en Bogotá', municipios), undefined);
  });

  it('sí reconoce ese mismo nombre cuando va como nombre propio', () => {
    assert.equal(municipioDe('Emergencia en La Paz tras el sismo', municipios)?.pcode, 'CO20011');
  });

  it('incluye Cali pese a ser corto, por ser una de las ciudades afectadas', () => {
    assert.equal(municipioDe('Cali reporta 16 estructuras colapsadas', municipios)?.pcode, 'CO76001');
  });

  it('respeta los límites de palabra', () => {
    // «Pereira» no debe coincidir dentro de otra palabra.
    assert.equal(municipioDe('El apellido Pereiraldo no es un municipio', municipios), undefined);
  });

  it('devuelve undefined si no menciona ninguno', () => {
    assert.equal(municipioDe('Balance nacional del terremoto', municipios), undefined);
  });

  describe('nombres ambiguos con el país o los departamentos', () => {
    // Salió de mirar la salida real: 477 notas quedaron etiquetadas y muchas decían
    // «Colombia» o «Risaralda», que son municipios de verdad (Huila y Caldas) pero en un
    // titular significan el país y el departamento.
    const conAmbiguos: MunicipioRef[] = [
      ...municipios,
      { pcode: 'CO41206', name: 'Colombia', admin1_name: 'Huila' },
      { pcode: 'CO17614', name: 'Risaralda', admin1_name: 'Caldas' },
      { pcode: 'CO66001', name: 'Pereira', admin1_name: 'Risaralda' },
    ];

    it('no etiqueta «Colombia» como municipio', () => {
      assert.equal(
        municipioDe('Colombia: al menos 240 muertos tras el terremoto', conAmbiguos),
        undefined,
      );
    });

    it('no etiqueta un nombre de departamento como municipio', () => {
      assert.equal(municipioDe('Alivios para damnificados en Risaralda', conAmbiguos), undefined);
    });

    it('sigue reconociendo municipios sin conflicto', () => {
      assert.equal(municipioDe('Daños en Pereira tras el sismo', conAmbiguos)?.pcode, 'CO66001');
    });
  });
});

describe('nombresAmbiguos', () => {
  it('incluye el país y los departamentos presentes en los datos', () => {
    const set = nombresAmbiguos([
      { pcode: 'CO66001', name: 'Pereira', admin1_name: 'Risaralda' },
      { pcode: 'CO17001', name: 'Manizales', admin1_name: 'Caldas' },
    ]);

    assert.ok(set.has('colombia'));
    assert.ok(set.has('risaralda'));
    assert.ok(set.has('caldas'));
    assert.ok(!set.has('pereira'));
  });
});

describe('normalizar', () => {
  it('quita tildes y baja a minúscula', () => {
    assert.equal(normalizar('Quibdó'), 'quibdo');
    assert.equal(normalizar('MANIZALES'), 'manizales');
  });
});

describe('consultasPara', () => {
  const consultas = consultasPara(municipios);

  it('incluye consultas generales y por municipio', () => {
    assert.ok(consultas.some((c) => c.includes('damnificados')));
    assert.ok(consultas.some((c) => c.includes('Manizales')));
  });

  it('se limita a los municipios más golpeados', () => {
    // Doce consultas por municipio ya son bastantes peticiones a un servicio ajeno.
    assert.ok(consultas.length <= 5 + 12);
  });
});
