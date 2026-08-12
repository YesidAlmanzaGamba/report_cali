import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extraer } from '../src/extraccion/reglas.js';

describe('extraer — qué pasó', () => {
  it('reconoce una edificación colapsada', () => {
    assert.equal(extraer('Edificación derrumbada en el barrio Egipto')?.tipo, 'edificacion_colapsada');
  });

  it('distingue colapso de daño', () => {
    assert.equal(extraer('Vivienda agrietada tras el sismo')?.tipo, 'edificacion_danada');
    assert.equal(extraer('Vivienda se desplomó tras el sismo')?.tipo, 'edificacion_colapsada');
  });

  it('reconoce vías bloqueadas', () => {
    assert.equal(extraer('Vía a Quibdó bloqueada por derrumbe')?.tipo, 'via_bloqueada');
  });

  it('prefiere la regla específica sobre la genérica', () => {
    // «Hospital colapsado» coincide también con el patrón de edificación; debe ganar la
    // de centro de salud, que es la que da más información.
    assert.equal(extraer('Hospital colapsado en Pereira')?.tipo, 'centro_salud_afectado');
  });

  it('reconoce albergues y centros de acopio', () => {
    assert.equal(extraer('Habilitan albergue en el coliseo')?.tipo, 'albergue');
    assert.equal(extraer('Nuevos puntos de acopio en la ciudad')?.tipo, 'centro_acopio');
  });

  it('devuelve undefined si el titular no habla de un incidente', () => {
    assert.equal(extraer('Cómo donar a los damnificados del terremoto'), undefined);
    assert.equal(extraer('El presidente anunció medidas económicas'), undefined);
  });
});

describe('extraer — dónde', () => {
  it('saca el barrio del titular que motivó la regla', () => {
    const r = extraer('Edificación derrumbada en el barrio Egipto');
    assert.equal(r?.clase, 'barrio');
    assert.equal(r?.lugar, 'Egipto');
  });

  it('reconoce vereda, corregimiento y comuna', () => {
    assert.equal(extraer('Casa colapsada en la vereda La Aurora')?.lugar, 'La Aurora');
    assert.equal(extraer('Vivienda derrumbada en corregimiento de Villapaz')?.lugar, 'Villapaz');
    assert.equal(extraer('Edificio se cayó en la comuna 13')?.lugar, '13');
  });

  it('no toma un nombre de carretera como localidad', () => {
    // Falso positivo real de la primera corrida: «vía Quito-Lago Agrio» es un oleoducto
    // en Ecuador. El conector de «vía X» se quitó por eso.
    const r = extraer('Vía Quito-Lago Agrio colapsó por erosión');
    assert.equal(r?.tipo, 'via_bloqueada');
    assert.equal(r?.lugar, undefined);
  });

  it('corta el nombre en la primera coma', () => {
    // Sin corte, la sugerencia arrastra media frase y alguien tiene que limpiarla.
    assert.equal(
      extraer('Edificación derrumbada en el barrio Medrano, según la Cruz Roja')?.lugar,
      'Medrano',
    );
  });

  describe('lo que NO debe capturar', () => {
    it('descarta adjetivos donde debería ir un nombre propio', () => {
      // «el barrio más afectado» no nombra ningún barrio.
      const r = extraer('Edificación derrumbada en el barrio más afectado de la ciudad');
      assert.equal(r?.tipo, 'edificacion_colapsada');
      assert.equal(r?.lugar, undefined);
    });

    it('exige mayúscula inicial', () => {
      const r = extraer('Casa colapsada en el barrio donde vivía la familia');
      assert.equal(r?.lugar, undefined);
    });
  });

  it('devuelve el tipo aunque no encuentre lugar', () => {
    // Saber que hubo un colapso ya sirve, aunque el titular no diga dónde exactamente.
    const r = extraer('Varias edificaciones colapsaron tras el sismo');
    assert.equal(r?.tipo, 'edificacion_colapsada');
    assert.equal(r?.lugar, undefined);
  });
});
