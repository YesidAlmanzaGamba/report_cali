import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aliasCandidatos,
  cifrasDe,
  esAvisoPersonal,
  hablaDelSismo,
  limpiarHtml,
  urlPublica,
} from '../src/sources/alcaldias.js';

describe('aliasCandidatos', () => {
  it('deriva la forma que acierta en la mayoría: municipio + departamento', () => {
    assert.equal(aliasCandidatos('Roldanillo', 'Valle del Cauca')[0], 'roldanillovalledelcauca');
    assert.equal(aliasCandidatos('La Victoria', 'Valle del Cauca')[0], 'lavictoriavalledelcauca');
    assert.equal(aliasCandidatos('Medio San Juan', 'Chocó')[0], 'mediosanjuanchoco');
  });

  it('quita tildes y eñes, que en el alias no aparecen', () => {
    assert.equal(aliasCandidatos('Chinchiná', 'Caldas')[0], 'chinchinacaldas');
    assert.equal(aliasCandidatos('Lloró', 'Chocó')[0], 'llorochoco');
    assert.equal(aliasCandidatos('Belalcázar', 'Caldas')[0], 'belalcazarcaldas');
  });

  it('ofrece formas alternativas sin repetir', () => {
    const cs = aliasCandidatos('Toro', 'Valle del Cauca');
    assert.equal(new Set(cs).size, cs.length);
    assert.ok(cs.includes('torovalle'));
  });
});

describe('esAvisoPersonal — ADR-001', () => {
  // Vistos tal cual en la recolección real. Son notificaciones a personas concretas.
  const reales = [
    'Aviso de Publicación de Edicto - Pedro Chala Calderón',
    'NOTIFICACION POR AVISO COBRO PERSUASIVO',
    'Notificación por aviso de cobro coactivo de comparendos de tránsito',
    'PUBLICACION POR AVISO MANDAMIENTOS DE PAGO POR CONCEPTO DE MULTAS',
    '126 AVISO MARIA LILIANA OCAMPO GALLEGO notificación por aviso',
  ];

  for (const t of reales) {
    it(`descarta: ${t.slice(0, 46)}`, () => {
      assert.equal(esAvisoPersonal(t), true);
    });
  }

  it('no descarta un informe de afectaciones', () => {
    assert.equal(esAvisoPersonal('🚨 REPORTE PRELIMINAR DE EMERGENCIAS – SISMO'), false);
    assert.equal(
      esAvisoPersonal('POR MEDIO DEL CUAL SE DECLARA LA SITUACIÓN DE CALAMIDAD PÚBLICA'),
      false,
    );
  });
});

describe('hablaDelSismo', () => {
  it('reconoce los boletines de la emergencia', () => {
    assert.equal(hablaDelSismo('Decreto por el cual se declara la calamidad pública'), true);
    assert.equal(hablaDelSismo('Reporte preliminar de afectaciones por sismo en Bagadó'), true);
    assert.equal(hablaDelSismo('Continúa el EDAN en los corregimientos'), true);
  });

  it('deja fuera lo que no es del sismo', () => {
    assert.equal(hablaDelSismo('Jornada de atención a la población migrante'), false);
    assert.equal(hablaDelSismo('Hoy celebramos nuestros 191 años de historia'), false);
  });
});

describe('limpiarHtml', () => {
  it('convierte el HTML del editor en texto legible', () => {
    const html = '<p>140 viviendas&nbsp;afectadas</p><br><p>4 con da&ntilde;o grave</p>';
    assert.equal(limpiarHtml(html), '140 viviendas afectadas\n\n4 con daño grave');
  });

  it('tolera vacío', () => {
    assert.equal(limpiarHtml(''), '');
  });
});

describe('cifrasDe', () => {
  it('saca las cifras del EDAN de Medio San Juan', () => {
    // Texto real, recortado.
    const texto =
      'hasta el momento se registran: 78 familias damnificadas, 390 personas damnificadas, ' +
      '3 viviendas totalmente destruidas, 15 viviendas parcialmente destruidas e inhabitables.';
    const cs = cifrasDe(texto);
    const pares = cs.map((c) => `${c.valor} ${c.unidad}`);

    assert.ok(pares.includes('78 familias'));
    assert.ok(pares.includes('390 personas damnificadas'));
    assert.ok(pares.includes('3 viviendas'));
    assert.ok(pares.includes('15 viviendas'));
  });

  it('el punto es separador de miles, no un cero', () => {
    // Sin esto la extracción devolvía «000», que es el bug que tenía la primera versión.
    const cs = cifrasDe('se reportan 1.000 viviendas afectadas');
    assert.equal(cs.length, 1);
    assert.equal(cs[0]?.valor, 1000);
  });

  it('guarda la frase para que una persona pueda juzgar sin abrir el enlace', () => {
    const cs = cifrasDe('Como resultado del despliegue se identificaron 140 viviendas afectadas en el municipio');
    assert.equal(cs[0]?.valor, 140);
    assert.match(cs[0]?.frase ?? '', /despliegue/);
  });

  it('no inventa cifras donde no las hay', () => {
    assert.deepEqual(cifrasDe('La comunidad debe mantener la calma'), []);
  });

  it('no extrae fallecidos ni heridos: esos se registran a mano', () => {
    const cs = cifrasDe('se reportan 2 personas fallecidas y 5 heridos');
    assert.deepEqual(cs, []);
  });
});

describe('urlPublica', () => {
  it('arma la forma con alias, que redirige al dominio oficial', () => {
    assert.equal(
      urlPublica('lavictoriavalledelcauca', 'sexto-informe-preliminar--sismo'),
      'https://lavictoriavalledelcauca.micolombiadigital.gov.co/noticias/sexto-informe-preliminar--sismo',
    );
  });
});
