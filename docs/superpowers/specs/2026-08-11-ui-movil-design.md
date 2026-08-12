# Diseño — Interfaz móvil, mapa primero

**Fecha:** 2026-08-11 · **Fase 4a**

## Problema

La página actual se diseñó pensando en escritorio y creció hasta 914 líneas en un solo
archivo. En un celular obliga a desplazarse bastante antes de ver el mapa, que es
justamente lo que la gente viene a mirar, y las secciones se apilan en una columna cada
vez más larga.

El usuario primario son socorristas y familias en zona de desastre. **Están en un
celular, con mala conexión.** Esta fase reorganiza la interfaz alrededor de eso.

## Decisiones tomadas

| Pregunta | Decisión | Por qué |
|---|---|---|
| ¿Migrar a React + Tailwind? | **No.** Seguimos en Astro con CSS propio | La página pesa 7,5 KB comprimidos y funciona sin JavaScript. React más react-dom son ~45 KB antes de escribir una línea nuestra. Para el usuario que nos importa, eso es una regresión, no una mejora |
| ¿Cómo se llega a los módulos? | **Hoja inferior** sobre el mapa | Es el patrón que la gente ya conoce de Google y Apple Maps, y deja el mapa visible mientras se leen las cifras |
| ¿Qué va arriba? | El mapa, ocupando la pantalla | Es lo que responde la pregunta operativa |

## Distribución

```
┌──────────────────────────┐
│ Terremoto M7.4 · ROJA    │  Encabezado compacto (~52 px)
│ [ ¿Buscas a un familiar? ]│  Botón permanente
├──────────────────────────┤
│                          │
│          MAPA            │  Ocupa el resto de la pantalla
│                          │
├──────────────────────────┤
│ ▬▬▬  234 fallecidos  ▲   │  Hoja, estado «asomada»
└──────────────────────────┘
```

**Estados de la hoja:** asomada (~110 px, con la cifra principal), media (55vh) y
completa (92vh). Se arrastra o se toca. En asomada y media, el mapa sigue a la vista.

**Módulos dentro de la hoja**, con un control segmentado: Cifras · Municipios ·
Descargas · Sobre esto.

### El panel de búsqueda de personas no entra a la hoja

Meterlo como una pestaña más debilitaría ADR-001 en silencio: quien llega buscando a un
familiar no puede tener que aprender un gesto primero. Por eso tiene **botón permanente
en el encabezado**, siempre visible, que abre la hoja directamente en ese módulo.

Es la única excepción a «todo vive en la hoja», y es deliberada.

### Escritorio

Los mismos componentes. La hoja se convierte en panel fijo a la derecha del mapa. No hay
un segundo árbol de plantillas ni una versión «de escritorio» aparte.

## Preservar el funcionamiento sin JavaScript

La hoja necesita JavaScript, y eso amenaza una propiedad que hoy tenemos: la página sirve
con JavaScript desactivado, que es el caso real de una conexión que falla a medias.

**Solución: CSS primero, JavaScript como mejora.** Por defecto el CSS dibuja la hoja como
contenido apilado normal. Un script mínimo en línea agrega la clase `js` al documento y
ahí sí se convierte en hoja arrastrable.

Sin JavaScript se obtiene la página de hoy: todo apilado y legible. Es un requisito, no
una cortesía.

## Estructura de archivos

```
src/
  layouts/Base.astro              cáscara html, tokens, script de la clase `js`
  components/
    Encabezado.astro              encabezado compacto + botón ¿Buscas?
    Mapa.astro                    contenedor, leyenda, ficha de municipio
    Hoja.astro                    cáscara de la hoja + conmutador de módulos
    BuscasAlguien.astro           (existente)
    Cifras.astro                  (existente)
    TablaMunicipios.astro         extraído de index.astro
    Descargas.astro               extraído de index.astro
    Alcance.astro                 extraído de index.astro
  styles/
    tokens.css                    color, espaciado, escala tipográfica
    base.css                      reinicio, tipografía, utilidades
  lib/
    hoja.ts                       arrastre, anclajes, foco, Escape
```

`index.astro` queda en unas 80 líneas: cargar datos y componer.

## Accesibilidad

- La hoja es `role="dialog"` solo en estado completo; en asomada y media es contenido
  normal y no debe atrapar el foco.
- `aria-expanded` en el asa; **Escape** colapsa.
- El conmutador de módulos son botones reales con `aria-selected`, navegables con teclado.
- Se respeta `prefers-reduced-motion`: sin animación de arrastre.
- Objetivos táctiles de 44 px como mínimo.

## Presupuesto y verificación

La lógica de la hoja no debe pasar de ~3 KB, dejando la carga inicial **bajo 12 KB
comprimidos** (hoy 7,5 KB).

Verificación en Playwright a 390×844:

1. El mapa se ve sin desplazarse.
2. La hoja asomada es visible y muestra la cifra principal.
3. «¿Buscas a un familiar?» se alcanza con **un toque**.
4. La hoja expande, colapsa y responde a Escape.
5. No hay desplazamiento horizontal.
6. Sin errores de consola.
7. Con JavaScript desactivado, todo el contenido sigue siendo legible.

## Fuera de alcance

El submapa por municipio con puntos de daño (fase 4b), las fuentes múltiples y el archivo
de índice del repositorio van aparte, cada uno con su propio ciclo.
