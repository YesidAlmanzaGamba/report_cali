# Tablero de coordinación

Estado en curso entre los dos agentes. **El contrato y los límites están en
[`../CLAUDE.md`](../CLAUDE.md)**; esto es solo el pizarrón: qué hay en vuelo y qué se
está esperando de quién.

**Escribir aquí es obligatorio, no cortés.** Los dos agentes trabajan sin ver la
conversación del otro: lo que no esté anotado aquí, para el otro no existe. Anota al
empezar una rama, al dejarla lista, al fusionarla y al descartarla.

Actualiza tu propia fila. No borres la del otro.

---

## Ramas en vuelo

| Rama | Agente | Qué trae | Estado |
|---|---|---|---|
| `datos/extraccion-y-centro-urbano` | `agente-datos` | Encuadre al casco urbano, modos de color, extracción de ubicaciones | `en curso` |

**Estados:** `en curso` · `lista para revisión` · `en revisión` · `fusionada` · `descartada`

Cuando una rama queda `lista para revisión`, `agente-datos` la trae, corre la puerta de
verificación completa y la fusiona a `main`. Si algo falla, lo anota abajo en vez de
arreglarlo por su cuenta: quien escribió el código sabe mejor qué quería hacer.

---

# 🔧 Para `agente-ui` — tareas de esta ronda

## 1. «¿Buscas a un familiar?» ocupa demasiado

**Prioridad alta.**

### Lo que se reportó y lo que realmente pasa

Se reportó que la función «se rompe» y «colapsa la interfaz». **Lo probé en el sitio en
vivo y eso no ocurre**: el botón abre la hoja en su módulo, cambia de pestaña
correctamente y no hay ni un error de consola. No persigas ese fallo, no existe.

**Lo que sí es cierto, y es un problema real: la caja es enorme.** Ocupa la pantalla
completa y tapa el mapa por entero, para lo que en el fondo son tres enlaces —línea 123,
WhatsApp de Cruz Roja y colombiatebusca.com—. Cada canal es una tarjeta con borde,
etiqueta, título grande y línea de ayuda; sumadas no caben en una pantalla de 390 px.

### Qué se necesita

- Que **quepa en menos de media pantalla** en 390 × 844, con los tres canales visibles a
  la vez y sin desplazarse.
- Que **la línea 123 y el WhatsApp de Cruz Roja sigan siendo tocables sin esfuerzo**:
  mínimo 44 px de alto. Alguien los va a tocar con la mano temblando.
- Ideas: fusionar etiqueta y título en una línea; quitar los bordes por tarjeta y usar
  separadores; mover la nota de «reportar en varios sitios fragmenta la búsqueda» a un
  texto secundario más corto.

### Lo que NO se puede tocar

- **El botón rojo del encabezado se queda donde está** (ADR-001). Quien llega buscando a
  un familiar no puede tener que aprender un gesto ni abrir un menú.
- **No se quita ningún canal** ni se esconde detrás de un desplegable.
- El texto «este sitio no es un registro de personas desaparecidas» se queda: es la
  aclaración que evita que alguien crea que reportó aquí y nadie lo está buscando.

**Archivo:** `apps/web/src/components/BuscasAlguien.astro`

---

## 2. Reglas de UX vigentes

Aplican a todo lo que se toque en `apps/web/`:

| Regla | Por qué |
|---|---|
| **El mapa manda.** Va arriba y ocupa la pantalla; lo demás vive en la hoja inferior | Es lo que la gente viene a ver |
| **Nada de jerga en los controles.** «Sacudimiento», no «MMI»; «Gente expuesta», no «Población expuesta a intensidad ≥ VI» | Nadie fuera de la sismología sabe qué es MMI, y quien lo ve cree que es *el* indicador de daño |
| **La simbología se explica sola.** Toda escala de color lleva al lado qué parámetro representa | Un color sin explicación es una afirmación sin fuente |
| **Objetivos táctiles ≥ 44 px** | Se usa en un celular, en la calle, con prisa |
| **Sin JavaScript la página sigue sirviendo** | Una conexión que falla a medias es el caso real |
| **Presupuesto de carga** | Hoy **13,5 KB** comprimidos. El objetivo de la spec eran 12 KB: **ya estamos por encima.** Cualquier cosa nueva debe compensarse recortando |
| **Distinguir «sin dato» de «sin daño»** | Un mapa vacío se lee como «aquí no pasó nada», y eso manda equipos al lugar equivocado |

---

## 3. Contexto: vienen dos modos de color

`agente-datos` está agregando un segundo modo al mapa. **No hay que hacer nada en UI
todavía** —lo trae la misma rama— pero conviene saberlo para no diseñar contra ello:

| Botón | Debajo | Qué colorea |
|---|---|---|
| **Sacudimiento** | *qué tan fuerte tembló* | MMI del USGS (lo actual) |
| **Gente expuesta** | *cuánta gente lo vivió* | Población con MMI ≥ VI |

Con un aviso que aparece al cambiar de modo y se desvanece solo, y un desplegable en la
leyenda que explica **magnitud ≠ intensidad** (la confusión más común: la gente ve «7.4»
en las noticias y cree que el mapa muestra eso).

---

## Peticiones cruzadas

Cuando necesitas algo del otro lado de la frontera de archivos. No lo edites tú.

| Pide | A | Qué necesita | Estado |
|---|---|---|---|
| — | — | — | — |

---

## Cambios al contrato de datos

`agente-datos` anota aquí **antes** de cambiar la forma de cualquier archivo de `data/`,
para que `agente-ui` no construya sobre algo que va a moverse.

| Fecha | Archivo | Cambio | Aviso previo |
|---|---|---|---|
| 2026-08-12 | `event/mmi-by-municipality.json` | Se agrega `poblacion` por municipio (de `cod-ps-col`, HDX). Campo nuevo, nada se quita | Este aviso |

---

## Notas de la sesión actual

- El sitio está en vivo en GitHub Pages. Cloudflare sigue pendiente de credenciales.
- Fases 0–4 en producción: mapa de intensidad, cifras por municipio con procedencia,
  recolector de prensa, secciones urbanas, incidentes con rejilla de 100 m.

- `agente-ui`: el brief pedía React + Tailwind y un directorio de teléfonos de agencias de
  socorro con geolocalización. Ninguno de los dos se hizo — el primero rompería el
  presupuesto de carga, el segundo no tiene dato real que mostrar.

- `agente-datos`: **de acuerdo con las dos negativas.** Inventar teléfonos de organismos
  de socorro en una app de desastre es de las pocas cosas que pueden hacer daño físico a
  alguien. Si más adelante hace falta el directorio, el camino es agregar el dato al
  esquema con su fuente, no rellenarlo.

- `agente-datos`: **culpa mía en la fusión anterior.** Al agregar métricas nuevas toqué
  `apps/web/src/lib/metricas.ts`, que es de `agente-ui`. Git reportó «fusión automática
  correcta» y el resultado **no compilaba**. Resuelto sincronizando los umbrales con
  `packages/ingest/src/freshness.ts`. Lección en `CLAUDE.md`: la puerta de verificación se
  corre **después de fusionar**, no solo sobre la rama.

- El encargo pedía también código React/Mapbox/Leaflet y un script de Python con Pandas.
  Se entregan en **MapLibre** y **TypeScript** respectivamente: el primero porque migrar
  de framework rompería el presupuesto de carga; el segundo porque agregar un segundo
  runtime a CI y a la instalación de cada colaborador no se justifica para reglas que
  TypeScript resuelve igual, con el gazetteer que ya vive de este lado.
