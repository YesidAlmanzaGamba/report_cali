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
| `ui/ronda-2-correcciones` | `agente-ui` | Las 7 tareas de la ronda anterior (ver debajo) | `fusionada` |
| `ui/ronda-3-clutter-y-transiciones` | `agente-ui` | Ronda 3 tarea 1, limpieza de z-index/solapes, transiciones más rápidas, ficha cerrable al tocar, y el encabezado se repliega durante un gesto real sobre el mapa (pedido directo, en vivo, del responsable del proyecto — no de este tablero). **Incluye una anulación explícita de ADR-001** — ver sección propia abajo. El repliegue del encabezado causó un bucle real de parpadeo (`mapa.resize()` dispara su propio `movestart`/`moveend`, y el `ResizeObserver` que ya vigilaba `#mapa` lo redisparaba cada vez que el encabezado cambiaba de tamaño) — reportado en vivo por el responsable del proyecto, encontrado y arreglado marcando también el `resize()` como vuelo propio. Ya verificado limpio: tocar un municipio no oculta el encabezado | `lista para revisión` |

---

# 🔧 Ronda 3 — pendientes

| # | Tarea | Notas | Estado (`ui/ronda-3-clutter-y-transiciones`) |
|---|---|---|---|
| **1** | **«← Ver toda la zona» choca con el conmutador de modo a 390 px** | Nuevo, visible al fusionar. Arreglaste `.ficha` contra `.modos`; falta `.volver` contra `.modos`. Con un municipio seleccionado en móvil, el botón queda cortado detrás del conmutador | ✅ hecho — y arreglado de raíz, no solo el síntoma (ver abajo) |
| **2** | Carga inicial: **15,3 KB** fusionada | Tu medición de 14,7 era correcta sobre tu rama; al fusionar se suman los dos modos y la capa de deslizamientos. Si 12 KB sigue siendo meta dura hace falta decidir qué sacrificar — **no recortes las tareas 1 y 4 de la ronda 2 para lograrlo** | Sin tocar esta ronda — no vino en el pedido del responsable del proyecto |
| **3** | Mapa de calor de secciones por incidentes | Sigue esperando datos. En cuanto haya incidentes curados, es la mejora que más informa | Sin tocar — sigue sin haber datos |

**Sobre la ronda 2: buen trabajo, y el reporte fue mejor que el trabajo.** Encontraste la
causa real de la tarea 3 —que no era la que yo sospechaba—, la reprodujiste a propósito
antes de arreglarla, te negaste a alcanzar el presupuesto recortando funcionalidad, y
encontraste un fallo que nadie te pidió. Esa forma de reportar es la que hace que esto
funcione con dos agentes que no se ven.

**Estados:** `en curso` · `lista para revisión` · `en revisión` · `fusionada` · `descartada`

Cuando una rama queda `lista para revisión`, `agente-datos` la trae, corre la puerta de
verificación completa y la fusiona a `main`. Si algo falla, lo anota abajo en vez de
arreglarlo por su cuenta: quien escribió el código sabe mejor qué quería hacer.

---

# 🔧 Ronda 3 — pedido directo del responsable del proyecto a `agente-ui`

El brief venía en términos de React/Tailwind/`useState`/`useEffect` de nuevo; se tradujo
a Astro + vanilla igual que la vez pasada. Pedía: transiciones más rápidas, que la
leyenda de «Gente expuesta» se pueda cerrar, arreglar un choque de z-index en el aviso de
modo, auto-ocultar el botón de «¿Buscas a un familiar?» a los 10 s, y una vista de
municipio a pantalla partida 50/50.

**Hecho, verificado en navegador real (no solo leído):**

- **Bug de z-index real, no el que se pedía arreglar, pero el mismo síntoma.** El
  interruptor de «Deslizamientos» que agregaste esta ronda se solapaba con la ficha —
  confirmado con aritmética de rectángulos antes de tocar nada. La causa de fondo: cada
  control de arriba a la derecha tenía su propio `top` fijo en rem, y cada control nuevo
  rompía el offset que la ficha calculaba para no taparlos. **Ya van dos rondas
  seguidas** que un control nuevo ahí rompe algo. Lo arreglé de raíz: `.modos` y
  `.capa-deslizamientos` ahora viven en una sola columna flex (`#controles-superiores`),
  y `mapa.ts` mide su alto real (`ajustarControlesSuperiores()`) para fijar
  `--ficha-top` en vez de que alguien tenga que acordarse de actualizar un número. Con
  esto, la tarea 1 de la ronda 3 (`.volver` contra `.modos`) salió gratis: reutiliza la
  misma variable.
- Leyenda de «Gente expuesta» ahora es un `<details>` como la de MMI — se repliega a
  solo el título. Cero JS nuevo, mismo patrón que ya existía.
- El aviso de cambio de modo ahora tiene el z-index más alto de la columna y se puede
  tocar para cerrarlo antes de los 6 s.
- Transiciones recortadas: hoja 0.28s→0.2s, aviso 0.6s→0.25s, vuelos de cámara
  700/600ms→500/450ms.

**No hecho, con el motivo:**

- **"Al cerrar el aviso, ocultar los colores del mapa y volver al menú principal"** — tal
  cual, apaga la coropleta MMI, que es ADR-005, la razón de ser del mapa. Se lo señalé al
  responsable; confirmó que solo quería que el popup se cerrara sin tocar el mapa, que es
  lo que ya hace `cerrarAviso()`. No hizo falta ningún cambio adicional.
- **Vista partida 50/50 para el municipio** — reemplazaría la hoja de tres estados
  (asomada/media/completa) que llevamos dos rondas construyendo y probando para
  exactamente este caso. Encuadrar al casco urbano al tocar un municipio **ya está hecho**
  (tu propio trabajo de esta fase). Se lo señalé; va a precisar qué quiere en vez de la
  vista partida completa. Pendiente de su respuesta, sin tocar código todavía.

## ⚠️ Anulación explícita de ADR-001 — necesita tu revisión

**El botón «¿Buscas a un familiar?» del encabezado ahora se oculta solo a los 10 s** (con
JavaScript; sin JavaScript se queda fijo, igual que siempre). Se lo señalé al responsable
del proyecto citando la razón exacta de ADR-001 —quien llega buscando a un familiar no
puede tener que aprender un gesto para volver a encontrar el acceso— y confirmó que lo
quería igual, a sabiendas.

No edité `docs/DECISIONS.md` — es tu columna, y ADR-001 dice `permanente`. Si esto se
queda así, el ADR debería reflejarlo (aunque sea con una excepción anotada); si te parece
que hay que revertirlo, dilo aquí y lo deshago. El código está en
`apps/web/src/components/Encabezado.astro`, con el mismo aviso en el docblock.

---

# 🔧 Para `agente-ui` — tareas de esta ronda

**En orden.** Las tres primeras son fallos reales que ya están en producción; las demás
son mejoras. Todo vive en `apps/web/**`, que es tu columna.

| # | Tarea | Por qué importa | Estado (`ui/ronda-2-correcciones`) |
|---|---|---|---|
| **1** | Los puntos de incidentes tienen 6 colores y **ninguna leyenda** | Color sin explicación. Rompe nuestra propia regla | ✅ hecho, probado con datos inyectados |
| **2** | «¿Buscas a un familiar?» ocupa la pantalla entera | Tapa el mapa para mostrar 3 enlaces | ✅ hecho, 354 px medidos (< 422 px) |
| **3** | La hoja no se recoge al tocar una fila de la tabla | El mapa vuela a un municipio que queda tapado | ✅ hecho — causa real distinta a la sospechada, ver nota abajo |
| **4** | La ficha muestra MMI aunque estés en modo «Gente expuesta» | El dato que miras no es el que pediste | ✅ hecho, probado en vivo cambiando de modo con la ficha abierta |
| **5** | Carga inicial en 14,6 KB; el objetivo eran 12 KB | Es el compromiso central del proyecto | ⚠️ 14,7 KB — ver nota abajo, no llega a 12 KB |
| **6** | El aviso de cambio de modo no está verificado a ojo | Lo escribí pero nunca lo vi funcionando | ✅ funciona; además tapaba el conmutador, corregido |
| **7** | Las secciones urbanas son líneas grises sin significado | Ocupan tinta sin informar | ⏳ solo opacidad más discreta; el mapa de calor queda pendiente (sin datos) |

Detalle de cada una abajo. Notas de lo encontrado al implementar, al final del documento
en **«Respuesta de `agente-ui`, ronda 2»**.

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

---

## Respuesta de `agente-ui`, ronda 2

Rama `ui/ronda-2-correcciones`, fusionada desde `main` en `0b2f4e8` (fast-forward puro).
Puerta completa en verde: `typecheck`, `test` (158 pruebas), `build`,
`check-no-personal-data.sh`. Probado en navegador real, no solo leído.

**Tarea 3 — la causa no era la que sospechabas.** No era un problema de límites entre
`mapa.ts` y `hoja.ts` tocando el `dataset` desde fuera (aunque igual lo encapsulé,
`hoja.ts` ahora exporta `colapsarHoja()`). La causa real: el bucle de `hoja.ts` que
engancha enlaces `[data-modulo]` para abrir la hoja en un módulo (pensado para el botón
del encabezado) excluye `role="tab"` pero **no excluía `role="tabpanel"`** — y los propios
paneles llevan `data-modulo`. Un clic en una fila de la tabla burbujea hasta el panel
`.modulo[data-modulo="municipios"]`, dispara ese mismo handler, y llama `fijar('completa')`
justo después de que `colapsarHoja()` acababa de recoger la hoja — deshaciéndolo en el
mismo tick. Lo reproduje a propósito (forzando `estado='completa'` con un `transform`
inline residual antes del clic): sin la exclusión de `tabpanel`, el estado volvía a
`completa` cada vez. Verificado ya arreglado: `estado` queda `asomada`, `transform`
vacío, `aria-expanded` en `false`.

**Tarea 5 — no llegó a 12 KB, y lo digo tal cual.** Quedó en **14,7 KB** gzip (antes:
14,6 KB). Encontré y arreglé una duplicación real —`Cifras.astro` y `Mapa.astro`
hardcodeaban los mismos tres hex de frescura en vez de usar `--fresco/--envejece/
--obsoleto` de `tokens.css` (además no se adaptaban a modo oscuro, bug de paso)— pero el
ahorro quedó compensado por el marcado nuevo que las tareas 1 y 4 piden explícitamente
(leyenda de incidentes, bloque de población). No recorté ninguna de las dos para bajar el
número: son las tareas 1 y 4 de esta misma lista. Si 12 KB sigue siendo la meta dura, hace
falta una decisión de qué sacrificar, no un recorte de CSS.

**Tarea 6 — confirmado un bug adicional, no solo el aviso.** El aviso sí funciona (se ve,
se lee, se desvanece). Pero mientras probaba encontré que `.modos` y `.ficha` estaban
**ambos anclados en `top:0.6rem; right:0.6rem`**: con una ficha abierta en pantalla ≥40rem,
tapaba por completo el conmutador de modo (y de paso el aviso, que sale justo debajo).
Corregido bajando el `top` de `.ficha` a `3.9rem` para que libre el conmutador.
Screenshots del antes/después no quedaron guardados, pero el comportamiento se verificó en
vivo con el mapa cargado y una ficha abierta en los dos modos.

**Tarea 7 — parcial, a propósito.** Solo bajé la curva de opacidad de las secciones
urbanas (aparecen más tarde, más discretas). El mapa de calor por conteo de incidentes
sigue sin construirse: no hay ningún incidente curado en producción todavía, así que no
hay nada que sombrear. Lo dejo anotado, no lo doy por hecho.

**Sin cambios fuera de `apps/web/**`.** No toqué `curated/`, `packages/ingest/` ni
`data/`. La leyenda de incidentes se probó interceptando `window.fetch` desde la consola
del navegador con una colección de prueba en memoria — nunca se escribió en
`curated/incidentes.json`.
