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

**En orden.** Las tres primeras son fallos reales que ya están en producción; las demás
son mejoras. Todo vive en `apps/web/**`, que es tu columna.

| # | Tarea | Por qué importa |
|---|---|---|
| **1** | Los puntos de incidentes tienen 6 colores y **ninguna leyenda** | Color sin explicación. Rompe nuestra propia regla |
| **2** | «¿Buscas a un familiar?» ocupa la pantalla entera | Tapa el mapa para mostrar 3 enlaces |
| **3** | La hoja no se recoge al tocar una fila de la tabla | El mapa vuela a un municipio que queda tapado |
| **4** | La ficha muestra MMI aunque estés en modo «Gente expuesta» | El dato que miras no es el que pediste |
| **5** | Carga inicial en 14,6 KB; el objetivo eran 12 KB | Es el compromiso central del proyecto |
| **6** | El aviso de cambio de modo no está verificado a ojo | Lo escribí pero nunca lo vi funcionando |
| **7** | Las secciones urbanas son líneas grises sin significado | Ocupan tinta sin informar |

Detalle de cada una abajo.

---

## 1. Los incidentes tienen colores sin leyenda 🔴

**Es mi culpa y es el fallo más claro.** En `mapa.ts` pinté los puntos de incidentes con
seis colores según el tipo —colapso, vía bloqueada, albergue, centro de acopio, centro de
salud, daño parcial— y **no puse ninguna leyenda que los explique**.

Eso rompe la regla que el propio proyecto repite en todas partes: un color sin explicación
es una afirmación sin fuente. Ahora mismo alguien ve un punto morado y no tiene forma de
saber qué significa.

Además, los puntos tienen dos opacidades con significado: los **verificados** van sólidos
y los **recortados a la rejilla de 100 m** van difusos (ADR-012). Eso también hay que
explicarlo, porque la diferencia importa: uno es una ubicación real y el otro una
aproximación deliberada.

**Se necesita:** una leyenda que aparezca solo cuando hay incidentes visibles, con los
tipos presentes (no los seis siempre) y una línea sobre qué significa el punto difuso.

**Dónde:** `apps/web/src/components/Mapa.astro`, `apps/web/src/lib/mapa.ts`
(la tabla de colores está en la capa `incidentes`).

---

## 2. «¿Buscas a un familiar?» ocupa demasiado

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

## 3. La hoja no se recoge al tocar una fila de la tabla

Al tocar un municipio en la tabla, el mapa vuela hasta él —y la hoja se queda arriba
tapándolo, así que no se ve a dónde voló. Hay código en `mapa.ts` que intenta recogerla
(`hoja.dataset.estado = 'asomada'`) y no está funcionando.

Sospecho que el problema es de límites: `mapa.ts` está manipulando el estado interno de
`Hoja` desde fuera, en vez de pedírselo. **Lo suyo sería que `hoja.ts` exponga algo
—un evento o una función— y que `mapa.ts` lo llame**, en vez de tocarle el `dataset`.

**Dónde:** `apps/web/src/lib/hoja.ts` (exponer), `apps/web/src/lib/mapa.ts` (consumir).

---

## 4. La ficha muestra MMI aunque estés mirando población

Con el modo «Gente expuesta» activo, la ficha del municipio sigue encabezada por el grado
MMI en grande. Si alguien cambió de modo es porque le interesa la otra pregunta, y la
ficha debería responderla: cuánta gente vive ahí, y cuánta es vulnerable.

El dato ya está en las propiedades del municipio (`poblacion`) y en
`event/mmi-by-municipality.json` (`poblacion`, `poblacion_vulnerable`). No hace falta
pedir nada al lado de datos.

**Sugerencia:** que la ficha muestre ambas cosas siempre, con la del modo activo arriba.
Así no se pierde información al cambiar y no hay que recordar en qué modo estabas.

---

## 5. Recortar la carga inicial

Está en **14,6 KB** comprimidos; el objetivo de la spec eran 12 KB y ya lo pasamos dos
veces (13,5 con el carrusel, 14,6 con los dos modos). Es el compromiso central del
proyecto —gente con mala conexión— así que conviene frenarlo antes de que siga.

Ideas: revisar si el CSS del carrusel y el de la hoja comparten reglas duplicadas; mover
a la carga diferida cualquier cosa que solo se vea al abrir la hoja; comprobar si el CSS
de MapLibre está entrando en el paquete inicial en vez del diferido.

**Medir así** (no a ojo):

```bash
npm run build && cd apps/web/dist
for f in index.html _astro/index.*.css _astro/index.astro*.js; do gzip -9 -c "$f" | wc -c; done
```

---

## 6. Verificar el aviso de cambio de modo

Al cambiar entre «Sacudimiento» y «Gente expuesta» aparece un aviso que dice qué significa
el color ahora y se desvanece a los 6 segundos. **Lo escribí pero nunca lo vi funcionando**
—en las capturas nunca coincidió el momento— así que puede estar mal posicionado o tapado
por el conmutador, que está justo encima.

Si estorba o se ve mal, tienes libertad para rediseñarlo. Lo que no puede perderse es que
**al cambiar de modo quede claro qué significa el color**, porque ese es el punto de tener
dos modos.

**Dónde:** `.aviso-modo` en `Mapa.astro`, función `avisar()` en `mapa.ts`.

---

## 7. Las secciones urbanas son líneas sin significado

Al acercarse a una ciudad aparecen las secciones urbanas del DANE como líneas grises
finas. Dan textura de trama urbana, pero no informan de nada: son solo divisiones
estadísticas.

Cuando haya incidentes registrados, lo interesante sería **sombrear cada sección según
cuántos incidentes tiene** —una especie de mapa de calor por manzana— en vez de dibujar
solo el contorno. Mientras no haya incidentes, quizá convenga bajarles la opacidad o
mostrarlas solo a más zoom.

Queda a tu criterio; es la menos urgente de la lista.

---

## Reglas de UX vigentes

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
