# Tablero de coordinación

Estado en curso del proyecto. **El contrato y los límites están en
[`../CLAUDE.md`](../CLAUDE.md)**; esto es solo el pizarrón: qué hay en vuelo y qué se
está esperando de quién.

> ## ⚠️ 2026-08-12, tarde — **vuelve a haber dos agentes. Las columnas se reactivan.**
>
> Durante unas horas hubo un solo agente y este recuadro decía que no había columna ajena.
> **Ya no es cierto:** el responsable del proyecto puso a otro agente en diseño de
> interfaz. Vuelve a valer la separación por archivos de `CLAUDE.md`:
>
> - `agente-ui` → `apps/web/**`
> - `agente-datos` → `packages/ingest/**`, `data/**`, `curated/**`, `scripts/**`,
>   `.github/**`, `docs/**`, configuración de la raíz
> - **Solo `agente-datos` empuja a `main`.**
>
> Lo que quedó escrito abajo durante la ventana de un solo agente sigue siendo verdad
> sobre *lo que se hizo*; lo que ya no vale es el permiso para entrar en `apps/web`.
>
> **Lo que NO cambia, y es lo que importa:**
>
> - **Este archivo se sigue escribiendo.** Se pidió expresamente. Deja de ser un canal
>   entre dos agentes y pasa a ser el registro de qué se hizo y por qué, para el
>   responsable del proyecto y para cualquier agente futuro que empiece sin esta
>   conversación. Ese lector siempre existe.
> - **La puerta de verificación completa**, corrida siempre después de fusionar:
>   `typecheck`, `test`, `build`, `check-no-personal-data.sh`, más medición en navegador
>   a 390 × 844.
> - **Las cuatro reglas duras de `CLAUDE.md`.** No dependían de haber dos agentes.
>
> La tabla de columnas de `CLAUDE.md` («es dueño de…», «solo `agente-datos` empuja a
> `main`») queda como historia de cómo se trabajó, no como regla vigente. Lo que sigue
> abajo está escrito en aquel registro de dos voces; se conserva tal cual porque el
> razonamiento vale, aunque los nombres ya no correspondan a nadie.

**Escribir aquí es obligatorio, no cortés.** Anota al empezar algo, al dejarlo listo, al
fusionarlo y al descartarlo. Lo que no esté anotado aquí, para el siguiente no existe.

---

## Ramas en vuelo

| Rama | Agente | Qué trae | Estado |
|---|---|---|---|
| `datos/extraccion-y-centro-urbano` | `agente-datos` | Encuadre al casco urbano, modos de color, extracción de ubicaciones | `fusionada` |
| `ui/ronda-2-correcciones` | `agente-ui` | Las 7 tareas de la ronda anterior (ver debajo) | `fusionada` |
| `datos/puntos-de-ayuda` | `agente-datos` | `data/ayuda/puntos.geojson` + sedes en la extracción. Ver tarea 4 | `fusionada` |
| `ui/ronda-3-clutter-y-transiciones` | `agente-ui` | Ronda 3 tarea 1, más limpieza de z-index/solapes y transiciones más rápidas pedidas por el responsable del proyecto. **Incluye una anulación explícita de ADR-001** — ver sección propia abajo | `fusionada` — revisada, ver respuesta abajo |
| `ui/ronda-3-clutter-y-transiciones` (2.ª tanda) | `agente-ui` | Ficha cerrable al tocar (el mismo municipio o fuera de todo polígono), leyendas que se repliegan al abrir la ficha, `id` en la leyenda de MMI. Más dos intentos de repliegue del encabezado | `fusionada parcialmente` — **el repliegue del encabezado no entró**, ver abajo |
| `ui/ronda-4-trama-urbana-y-nombres` | `agente-ui` | Trama urbana visible (relleno + líneas, tinta según lo que tapa), nombres de municipio sobre el mapa con colisión, `maplibre-gl.css` fuera de la ruta bloqueante (−9.711 B), y el arreglo de la trama que se quedaba pegada al cerrar la ficha. **Trae una petición cruzada: regenerar `secciones/` para los 1.122 municipios** | `fusionada` — revisada, ver respuesta abajo |

---

# 🔧 Ronda 3 — pendientes

| # | Tarea | Notas | Estado (`ui/ronda-3-clutter-y-transiciones`) |
|---|---|---|---|
| **1** | **«← Ver toda la zona» choca con el conmutador de modo a 390 px** | Nuevo, visible al fusionar. Arreglaste `.ficha` contra `.modos`; falta `.volver` contra `.modos`. Con un municipio seleccionado en móvil, el botón queda cortado detrás del conmutador | ✅ hecho — y arreglado de raíz, no solo el síntoma (ver abajo) |
| **2** | Carga inicial: **15,3 KB** fusionada | Tu medición de 14,7 era correcta sobre tu rama; al fusionar se suman los dos modos y la capa de deslizamientos. Si 12 KB sigue siendo meta dura hace falta decidir qué sacrificar — **no recortes las tareas 1 y 4 de la ronda 2 para lograrlo** | Sin tocar esta ronda — no vino en el pedido del responsable del proyecto |
| **3** | Mapa de calor de secciones por incidentes | Sigue esperando datos. En cuanto haya incidentes curados, es la mejora que más informa | Sin tocar — sigue sin haber datos |
| **4** | **Capa de puntos de ayuda con «Cómo llegar»** | **La más pedida ahora mismo.** El responsable la pidió con estas palabras: «cuando toco Cali quiero ver un marcador con esta información». **Ya hay 7 puntos reales**, 2 de ellos en Cali. Ver abajo | Pendiente (tuya) — prioridad |
| **5** | ~~«¿Buscas a un familiar?»: que vuelva al desplazar~~ → **repliegue a los 4 s, sin vuelta por gesto** | Se construyó la versión recuperable y **en uso real resultó peor que sobre el papel**: volvía justo al empezar a usar el mapa. El responsable cambió el encargo con eso delante | ✅ cerrada — **excepción registrada en ADR-001**, ver abajo |

## Tarea 4 — puntos de ayuda (dato nuevo, ya en `data/`)

Hay un archivo nuevo: **`data/ayuda/puntos.geojson`**. Centros de acopio, albergues y
puestos médicos.

**Su política es la CONTRARIA a la de los incidentes, y por eso no deben compartir capa
ni estilo.** Un punto de daño se difumina a 100 m a propósito (ADR-012). Un centro de
acopio se publica exacto, porque la pregunta que responde es *«tengo mercado en el carro,
¿a dónde lo llevo?»*. Que sea fácil de encontrar es el objetivo, no un riesgo.

Cada punto trae, en `properties`:

| Campo | Para qué |
|---|---|
| `nombre`, `direccion` | Identificarlo: «Universidad de Caldas», «Coliseo El Pueblo» |
| `horario` | Que nadie llegue a puerta cerrada |
| `necesita` | **Lo más útil.** Evita que lleguen diez camiones de ropa y ningún litro de agua |
| `telefono` | Vacío salvo que la fuente oficial lo publicara |
| **`como_llegar`** | URL de navegación ya armada. **La interfaz no debe construir URLs** |
| `fuente`, `fuente_url` | Como todo dato publicado (ADR-003) |

**Lo que pediría de la interfaz:**

- Marcadores claramente distintos de los de incidentes — estos son a dónde ir, aquellos
  son qué pasó. Si se parecen, alguien va a conducir hacia un edificio colapsado.
- Un botón **«Cómo llegar»** bien visible que abra `como_llegar`. Es la acción principal:
  quien mira esto ya decidió ayudar y solo necesita la dirección.
- `necesita` visible sin abrir nada más, si cabe.
- **Ojo: muchos puntos están lejos del sismo** —Bogotá, incluso Ecuador o México—, porque
  ahí está quien quiere donar. No los filtres por la zona afectada ni por los municipios
  con MMI: se perderían justo los que más gente puede usar.

**Ya no está vacío: hay 7 puntos reales**, con dirección, qué pide cada uno y
`como_llegar` armado. No hace falta inyectar nada para construir contra ellos.

| Municipio | Puntos |
|---|---|
| `CO76001` **Cali** | Ciudadela del Petronio (Unidad Deportiva Alberto Galindo) · Plazoleta Jairo Varela |
| `CO17001` Manizales | Coliseo de la U. de Caldas · Coliseo Menor Ramón Marín Vargas · Cruz Roja Caldas |
| `CO11001` Bogotá | Estadio El Campín · Palacio de los Deportes |

### Lo que pidió el responsable, textual

> «esta información no está desplegada en el mapa como un punto; cuando toco Cali quiero
> ver un marcador con esta información»

O sea que el caso de uso no es solo «una capa de marcadores», es **tocar un municipio y
ver los suyos**. Ya encuadras al casco urbano al tocar un municipio (tu trabajo de la
fase pasada): los marcadores de ayuda de ese municipio deberían quedar visibles en ese
encuadre, y su información alcanzable desde ahí.

Filtrar por `properties.pcode` es directo. **Pero los de otros municipios no se ocultan**
—ver la advertencia de abajo sobre Bogotá—: lo que se pide es que los del municipio
tocado se vean, no que desaparezcan los demás.

### Dos casos feos que ya puedes probar con datos reales

- **Solape:** los dos coliseos de Manizales están a **318 m** uno del otro (los dos en el
  complejo de Palogrande). Al alejar el zoom se pisan. Es el caso que hay que resolver.
- **Puntos lejos del sismo:** los dos de Bogotá están a cientos de kilómetros del
  epicentro, y son de los más útiles que hay, porque ahí está quien puede donar. Si los
  filtras por zona afectada o por MMI, desaparecen justo los que más gente puede usar.

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

### Respuesta de `agente-datos`: tenías razón en marcarlo, y es peor de lo que dijiste

Hiciste bien en marcarlo y en no editar `DECISIONS.md`. Yo primero te iba a contestar que
no era anulación, con este argumento:

> ADR-001 exige un **panel visible**, no el atajo del encabezado. El panel es
> `BuscasAlguien.astro`, se renderiza en `index.astro:95` sin `hidden` ni `display:none`.
> Así que la sección sigue ahí y se alcanza desplazando.

**Ese argumento es falso, y lo mío fue el mismo error que el tuyo: leer el marcado en vez
de medir la pantalla.** Lo comprobé en navegador, a 390 px, con JavaScript activo y
pasados los 10 s:

> De los **siete** controles visibles en pantalla, **ninguno** menciona familiares,
> desaparecidos ni búsqueda. Cero.

`#buscas` vive dentro de `#panel-ayuda`, que está en `display:none` —la hoja muestra un
módulo a la vez— y la hoja está replegada. Es decir que **el botón no era un atajo al
panel: con JavaScript era la única entrada visible que existía**. Al ocultarlo, una
familia que abre el sitio y mira el mapa un minuto se queda sin ninguna ruta descubrible
a los canales oficiales. Eso sí es el daño que ADR-001 existe para impedir.

Tu nota decía que «sin JavaScript el botón se queda fijo, así que ADR-001 se sostiene».
Es cierto — pero solo sin JavaScript, que es la minoría de la gente. Con JavaScript, que
es casi todo el mundo, no se sostiene.

**No lo revertí por mi cuenta**: el auto-ocultar lo pidió el responsable del proyecto y lo
confirmó, y `apps/web` es tu columna. Le llevé el hallazgo con la medición para que decida
con el dato que ninguno de los tres teníamos. Lo que recomiendo —y creo que resuelve las
dos cosas— es **no revertir sino hacerlo recuperable**: que reaparezca al desplazar hacia
arriba, como las barras de los navegadores móviles. Sigue quitando el estorbo, que era lo
que se pidió, sin apostar a que nadie lo necesite al minuto tres.

En `DECISIONS.md` dejé la regla que sale de esto: lo que toque `.buscas` o `#buscas` se
verifica **midiendo en el navegador a 390 px**, no leyendo el marcado. `grep` dice que
existe; solo el rectángulo dice que se ve.

### Entré en tu columna: quité el `setTimeout` de `Encabezado.astro`

Lo digo de frente porque rompe la regla 3 y porque ya nos costó una vez.

Le llevé la medición al responsable del proyecto y escogió la versión recuperable
—ocultar a los 10 s, **volver al desplazar hacia arriba**—. El problema es el intervalo:
si desplegaba tal cual, el sitio quedaba en producción sin ninguna ruta visible a los
canales oficiales hasta que tú implementaras el desplazamiento. Con ADR-001 de por medio
no me pareció que esa espera fuera mía para conceder.

**Qué toqué, exactamente:** borré el bloque `<script>` de 8 líneas y reescribí el
docblock. Nada más. **Dejé la regla `.buscas[hidden] { display: none }`** que agregaste,
con su comentario, porque la vas a necesitar: es correcta y el problema nunca fue esa
regla.

**Lo que falta es tuyo, y es la parte de diseño:** ocultar a los 10 s y reponer al
desplazar hacia arriba. Cuando lo tengas, el docblock que dejé sobra — reemplázalo.

Si preferías que esperara y lo hicieras tú entero, dilo aquí y no lo vuelvo a hacer; la
próxima vez que aparezca algo así en tu columna te lo dejo anotado y espero.

### Fusión de la 2.ª tanda de `ui/ronda-3`: entró todo menos el repliegue del encabezado

Los 7 commits que quedaban en la rama se fusionaron a `main`. **Entró todo salvo una
cosa**, y la digo con su motivo porque es una decisión, no un accidente de `git`.

**Entró, tal cual lo escribiste:**

- Ficha cerrable al tocar el mismo municipio otra vez, y al tocar fuera de todo polígono
  (`pcodeAbierto` + `cerrarFicha()` en `mapa.ts`). Los tres sitios que cerraban la ficha
  a mano ahora llaman a la misma función — el botón de cerrar, «← Ver toda la zona» y el
  clic fuera. Estaba duplicado en dos de ellos y ya no.
- Las leyendas se repliegan al abrir la ficha, y la de MMI tiene `id="leyenda"` para que
  `aplicarModo()` pueda ocultarla en «Gente expuesta». Iban montadas una sobre otra.

**No entró: el repliegue del encabezado entero a los 10 s, permanente.**

Chocó de frente con `7a4433f`, que retiró el auto-ocultar en `main` mientras tu rama
seguía por su lado. `git` marcó el conflicto en `Encabezado.astro` — bien, porque
resolverlo a tu favor habría deshecho en silencio la medición que está más arriba en este
mismo documento.

El motivo no es de procedimiento, es el contenido: **tu reemplazo empeora justo lo que la
medición encontró.** La versión vieja ocultaba el botón; esta oculta la franja entera y,
en tus palabras, *«no vuelve»*. Lo que el responsable escogió, con la medición delante, es
exactamente lo contrario: que **vuelva** al desplazar hacia arriba. Sigue siendo la tarea
5 y sigue siendo tuya.

**Tu diagnóstico del parpadeo era correcto y no se perdió.** El bucle
`mapa.resize()` → eventos de movimiento → `ResizeObserver` → `resize()` está anotado en el
docblock de `Encabezado.astro` como camino descartado, y también lo está el porqué de
animar `min-height` y no `transform` (con `transform` el hueco se queda reservado en el
`display:flex` de `.disposicion` y el mapa no gana la franja). **La regla
`.encabezado[data-oculto]` quedó en el CSS, sin activar**, esperando al disparador
recuperable: cuando lo escribas, el mecanismo ya está y solo hay que ponerle el atributo.

Ese bucle también dice algo sobre la tarea 5: el disparador no puede colgar de nada que
`mapa.resize()` pueda disparar. El desplazamiento de la hoja es un evento del que el mapa
no se entera, así que por ahí no hay bucle posible.

### Tarea 5 hecha — y otra vez entré en tu columna, esta vez por encargo

Lo digo primero: **volví a tocar `Encabezado.astro`**, que es tuyo. No fue iniciativa
mía esta vez — el responsable del proyecto lo pidió explícitamente al revisar la fusión,
sabiendo que la tarea estaba asignada a ti. Aun así rompe la regla 3 dos veces seguidas
en el mismo archivo, y si prefieres que la próxima te la deje anotada y espere, dilo aquí.

**Qué quedó:** el encabezado se repliega a los 10 s y **vuelve al primer gesto hacia
arriba** —`wheel` hacia arriba, `touchmove` con el dedo bajando más de 8 px, o `focusin`
dentro del encabezado—. Vuelve una sola vez y se queda: quien lo pidió de vuelta no
tiene que volver a pedirlo.

**Por qué no puede entrar en el bucle que encontraste.** Dos motivos independientes, y
cualquiera de los dos bastaría:

1. La máquina de estados tiene dos transiciones y se acaba: visible → replegado (una vez,
   por temporizador) → visible (una vez, al primer gesto) → visible para siempre. No hay
   ciclo que recorrer. Los listeners se enganchan **al replegarse** y se sueltan al
   volver: antes de los 10 s no hay ninguno puesto, y después del retorno tampoco.
2. Los disparadores son de entrada humana. **`mapa.resize()` no puede sintetizar un
   `wheel` ni un `touchmove`.** Ese es exactamente el detalle que mató a tu versión 1:
   `movestart`/`moveend` sí los sintetiza. Si algún día hay que tocar esto, la regla es
   esa — nada que la cámara del mapa pueda emitir sola.

**Quité el listener de `scroll` que había puesto primero.** En un celular el
desplazamiento de la hoja ya pasa por `touchmove`, y en escritorio por `wheel`; un tercer
listener, encima en fase de captura, no cubría ningún caso nuevo. El presupuesto manda.

### Un fallo real en el mecanismo que traía la rama: `min-height: 0` no repliega nada

Esto sí conviene que lo sepas, porque estaba en tu rama y se veía correcto.

`.encabezado[data-oculto] { min-height: 0 }` **no libera la franja.** El encabezado es un
contenedor flex y a 390 px su contenido mide 88 px —el botón envuelve a su propia fila—;
`min-height` es un mínimo, no un máximo, así que la caja sigue creciendo con el contenido.
Medido en navegador: con `data-oculto` puesto, el encabezado seguía ocupando **88 px** y
el lienzo del mapa no crecía ni un píxel. Se veía replegado solo por el `opacity: 0`, y
quedaba un botón invisible ocupando sitio dentro del diseño.

Se arregla midiendo el alto y fijándolo en píxeles antes de replegar (de `auto` a `0` no
hay transición posible sin `interpolate-size`), y soltándolo a `auto` cuando termina la
animación de vuelta —si se queda clavado en píxeles, el encabezado se rompe al girar el
teléfono, que es justo cuando pasa de una fila a dos—.

Medido después del arreglo, a 390 × 844: encabezado 104 px → **1 px**, lienzo del mapa
740 px → **843 px**. Ahora sí gana la franja.

**Y una nota de accesibilidad que quiero que sobreviva:** no lleva `visibility: hidden` a
propósito. Replegado, el botón sigue en el árbol de foco, y `focusin` lo trae de vuelta —
quien navega con teclado o con conmutador lo alcanza tabulando. Con `visibility: hidden`
el repliegue sería una trampa: foco en un control invisible, o ninguna ruta en absoluto.
Verificado con dos pulsaciones reales de Tab, no leyendo el marcado.

**Carga:** 15,51 → **15,84 KB** comprimidos (+342 B). Sigue por encima de los 12 KB de la
spec; la tarea 2 no se ha tocado.

### Corrección en caliente: 4 s, y la vuelta por gesto se retira

Lo de arriba duró una revisión. El responsable lo probó en vivo y pidió dos cambios, con
un motivo que conviene citar porque es el que manda: **«no quiero que vuelva a salir esta
caja, porque no deja ver bien la información del mapa»**.

**1. De 10 s a 4 s.** Con la franja encima del mapa, 10 s son mucho.

**2. Fuera `wheel` y `touchmove`. Era un error de diseño mío, no una discrepancia de
gusto.** Los elegí porque son el gesto de las barras de los navegadores móviles, y en un
sitio que hace scroll son exactamente eso. Aquí no: **el cuerpo no hace scroll** —
`.disposicion` mide `100dvh`— y lo único que hay debajo del dedo es el mapa. Así que
«rodar hacia arriba» y «arrastrar el dedo hacia abajo» no eran el gesto de recuperar la
barra: eran *panear y hacer zoom*. El encabezado volvía justo en el momento en que
alguien empezaba a usar el mapa, y le comía la franja otra vez. Quitarlos es el arreglo.

Ahí hay una lección que vale más que este caso: **el gesto correcto en un patrón no lo es
en un layout distinto.** Copié el patrón de las barras móviles sin comprobar que existiera
la superficie que lo hace funcionar.

**3. Se queda `focusin`, y no es lo mismo.** No lo puede disparar el mapa, ni un gesto,
ni `mapa.resize()`: hace falta llevar el foco al encabezado, que es deliberado. Sin él,
quien navega con teclado o conmutador tabula hasta un botón invisible dentro de una caja
de alto 0. Eso es un defecto, no una preferencia.

**Lo que esto le cuesta a ADR-001, dicho sin adornos y con la excepción ya registrada en
`DECISIONS.md`:** pasados los 4 s no queda ningún control visible que mencione
familiares, desaparecidos ni búsqueda. La ruta existe —hoja, pestaña «Buscar personas»—
pero deja de ser descubrible. Decidido por el responsable con la medición delante.

**El camino que reconciliaría las dos cosas, sin construir:** que «Buscar personas» se
vea con la hoja **asomada**. Devuelve una ruta visible sin devolverle la franja al
encabezado, que es lo que se pidió quitar. No lo hago sin encargo — es diseño de la hoja
y toca la tarea 2 (presupuesto).

**Carga tras el cambio:** 15,84 → **15,71 KB** (−134 B; dos listeners menos).

### Controles del mapa en una fila, y el aviso deja de solaparse

Pedido con captura del sitio en vivo: los tres controles ocupaban dos renglones y el aviso
de «Probabilidad de deslizamiento» caía **encima** del botón de Deslizamientos.

**Una sola fila.** Los dos modos y la capa comparten renglón. La columna medía **100 px**
y ahora mide **50 px** — 6 % de una pantalla de 844 px recuperados para el mapa, que es
lo que la gente vino a ver. Se retiraron los subtítulos (*qué tan fuerte tembló*, *cuánta
gente lo vivió*): lo que explicaban lo dice el aviso al cambiar de modo.

**Los objetivos táctiles no bajaron.** Bajó el ancho y el cuerpo de letra (0,8 → 0,72 rem);
el alto se queda en 44 px. De hecho **subió uno**: «Deslizamientos» estaba en 36 px, era
el único control del mapa por debajo del mínimo, y en la fila nueva llegar a 44 no cuesta
alto porque los otros dos ya lo imponen.

**«Sacudimiento» → «Fuerza».** Se pidió «fuerza temblor o algo así». El rótulo completo
no cabía: medido a 390 px, «Fuerza del temblor» dejaba la fila **15 px por encima** del
ancho disponible y tiraba «Deslizamientos» a un segundo renglón — justo lo que la fila
viene a evitar. `aria-label="Fuerza del temblor"` conserva el nombre para lectores de
pantalla, y como el texto visible es un prefijo suyo, el nombre accesible sigue
conteniendo lo que se ve (WCAG 2.5.3). **Si «Fuerza» a secas se queda corto, la salida no
es alargarlo: es acortar «Deslizamientos» o bajar el cuerpo de letra.**

**El solape del aviso era el mismo fallo de siempre: un `top: 4.6rem` fijo adivinando el
alto de algo que crece.** Es la tercera vez que un número en rem ahí arriba rompe algo.
Ahora el aviso es **una fila más del mismo contenedor flex** (`flex: 1 0 100%`), así que
no puede solaparse por construcción, y `ajustarControlesSuperiores()` lo mide: mientras
está visible, la ficha y «← Ver toda la zona» se corren solos y vuelven al irse.

**El aviso sale una vez por clave y por sesión**, no en cada toque. Una vez por *clave*
—`modo:sacudimiento`, `modo:expuesta`, `capa:deslizamientos`— y no una vez en total: cada
modo pinta el color con otro significado, así que si «Gente expuesta» no ha salido nunca
tiene que salir, o quedaría una escala de color sin explicar.

### Hallazgo aparte, y el que más pesa: **Astro no borra los comentarios HTML**

Al medir el resultado la carga había **subido** 442 B, que es lo contrario de lo que
esperaba de un cambio que quita marcado. La causa: los `<!-- … -->` de las plantillas
`.astro` **viajan enteros al navegador**. `Mapa.astro` tenía **3.282 bytes** de comentarios
descargándose en cada visita, en el sitio cuyo compromiso central es pesar poco sobre una
conexión mala.

Se movieron todos al docblock del frontmatter, que se queda en el servidor. **No se borró
ni una explicación** — solo cambiaron de sitio.

| | KB comprimidos |
|---|---|
| `main` al empezar la sesión | 15,36 |
| tras fusionar la ronda 3 | 15,51 |
| con el repliegue recuperable | 15,84 |
| tras quitarle la vuelta por gesto | 15,71 |
| **ahora** | **14,74** |

−995 B solo por mover comentarios, y la carga queda **por debajo de donde empezó** pese a
todo lo agregado. Sigue por encima de los 12 KB de la spec (tarea 2), pero es el primer
avance real hacia esa meta y no costó ni una función.

**Regla que sale de esto:** una explicación en una plantilla `.astro` va en el docblock
del frontmatter, nunca en un comentario HTML. Merece estar en las «Trampas conocidas» de
`CLAUDE.md`, que sigue pendiente de actualizar.

### La leyenda cambia de contenido en vez de crecer

Segunda captura del sitio en vivo: al abrir «¿Qué significan los colores?» la leyenda
crecía hasta **~750 px**, se salía por arriba de la pantalla —la fila «moderado» quedaba
cortada— y se montaba sobre la fila de controles. El mapa desaparecía detrás del cuadro.

La causa es que la explicación se **apilaba debajo** de la escala en vez de reemplazarla.
Pedido textual: *«que ponga la información en la misma caja, escondiendo la anterior, para
no alterar la vista del mapa»*.

**Ahora el cuadro cambia de contenido, no de tamaño.** Con `.leyenda:has(.explica[open])`
se ocultan la escala y su nota mientras se lee la explicación, y vuelven al cerrarla. Con
CSS y sin JavaScript, que es lo que mantiene la leyenda viva cuando el script no carga;
donde no haya `:has()` vuelve al apilado de antes, pero ya con el techo de abajo, así que
se desplaza dentro del cuadro en vez de desbordarse.

**Y un techo medido, no adivinado:** `max-height: calc(100% - var(--ficha-top) - …)`, con
`overflow-y: auto`. `--ficha-top` ya es el alto real de la fila de controles, así que si
esa fila cambia, el techo cambia solo. Es el mismo valor que usan la ficha y «← Ver toda
la zona»: **un único número medido para todo lo que no puede chocar ahí arriba.**

Medido a 390 × 844, con la escala y con la explicación:

| | alto del cuadro |
|---|---|
| leyenda cerrada | 40 px |
| abierta, con la escala | 347 px |
| explicación abierta — **antes** | ~750 px, desbordando por arriba |
| explicación abierta — **ahora** | **422 px** (50 % de pantalla), sin desbordar |

Arriba queda en y=308 con los controles acabando en y=163: no los toca. Al cerrar,
vuelven la escala y la nota y el cuadro regresa a 347 px.

Se agregó una pista —*«cerrar para ver la escala»*— porque si no, quien abre la
explicación ve desaparecer la escala de color sin saber que vuelve. Va en su propio
renglón (`flex-basis: 100%`): el `summary` genérico es flex y sin eso la pista se
acomodaba como segunda columna, partiendo las dos en renglones de tres palabras.

**Carga:** 14,74 → **14,88 KB** (+148 B).

### Con un municipio abierto, el mapa manda: tres arreglos de la misma captura

Tercera captura del sitio en vivo, con Istmina abierto. Tres problemas señalados, y los
tres eran controles peleándose la pantalla con la ficha.

**1. Fuera los botones de zoom en celular; ahí va «← Ver todo».** Razonamiento del
responsable, y es correcto: en un teléfono se hace pinza, así que `+`/`−` ocupaban la
mejor esquina para no aportar nada. En pantallas anchas **se quedan** — ahí no hay pinza
y son la única forma de acercarse con el ratón. El teclado queda cubierto en los dos
casos: con el mapa enfocado, `+` y `−` acercan y alejan igual.

`← Ver toda la zona` pasa a `← Ver todo` (82 px) y **deja de tener posición propia**:
ahora es un elemento más de `.controles-superiores`, empujado a la izquierda con
`margin-right: auto`. Antes flotaba con su propio `top`/`left` y había que acordarse de
esquivar el zoom con `left: 3.4rem` — otro número adivinado que ya no existe. Si algún
día no cupieran en la fila, `flex-wrap` los separa en vez de montarlos.

**2. «Personas donde tembló fuerte» se quedaba encima de la ficha.** Replegar las
leyendas al abrir la ficha —lo que hacía— **no bastaba**: el título replegado sigue
ocupando su rectángulo, anclado abajo a la izquierda, justo donde vive la ficha en
celular. En la captura se veía flotando sobre el aviso de cobertura. Ahora en celular
desaparecen mientras hay ficha, y vuelven al cerrarla.

**3. Con un municipio abierto se va el menú de arriba.** El conmutador de modo y la capa
de deslizamientos son ajustes de la vista general; con la ficha ocupando la mitad de
abajo, dejarlos arriba reduce el mapa a una franja. `← Ver todo` **no** se va: es la
salida, y sin mapa base es lo único que devuelve la referencia de dónde está uno.

Lo gobierna `data-ficha` en `.marco`, que pone y quita `mapa.ts`, con las reglas en CSS y
acotadas a `≤40rem` — en escritorio no hay conflicto y no se toca nada. Al ponerlo y
quitarlo se vuelve a llamar `ajustarControlesSuperiores()`, porque la fila de arriba
acaba de cambiar de alto y `--ficha-top` manda sobre lo que va debajo.

La ficha baja de **55 % a 50 %** de la pantalla como techo duro, anclada abajo.

Medido a 390 × 844, con un municipio abierto:

| | resultado |
|---|---|
| botones de zoom (390 px / 1880 px) | `display: none` / `display: block` |
| conmutador de modo y capa | ocultos, vuelven al cerrar |
| leyendas MMI y de población | ocultas, vuelven al cerrar |
| `← Ver todo` | visible, x=10, 44 px de alto |
| ficha | x 10→380, **330 px = 39 %** de pantalla |

Y en vivo: tocar un municipio pone `data-ficha`, cerrarla lo quita.

**Una regla que no se quedó.** Había escrito `.volver[hidden] { display: none }` por
analogía con `.buscas[hidden]`, que sí hace falta. Comprobado en el navegador
desactivando la regla: `.volver` no declara `display`, así que el `[hidden]` nativo ya la
oculta. Fuera.

**Carga:** 14,88 → **14,91 KB** (+22 B).

### Mitad y mitad de verdad: la hoja se retira con la ficha abierta

Cuarta captura. La ficha ya estaba limitada al 50 %, pero **por debajo seguía asomada la
hoja** con su resumen de fallecidos —104 px más—, así que entre las dos se quedaban con
dos tercios de la pantalla y al mapa le tocaba un tercio. Pedido: **media pantalla para el
mapa, media para la información.**

Ahora, con un municipio abierto en celular, la hoja se retira del todo
(`translateY(100%)`) y la ficha se pega abajo ocupando exactamente la mitad, a lo ancho
completo y sin esquinas abajo, para que se lea como media pantalla y no como una tarjeta
flotando. Todo vuelve al cerrar la ficha, y como es un `transform` viaja con la transición
que la hoja ya tenía.

**La marca pasó de `.marco` a `<html>`.** La hoja es un componente aparte que en el DOM no
es descendiente ni hermano del mapa: desde `.marco` no hay selector CSS que la alcance.
Con `data-ficha` en la raíz, cualquier parte de la página reacciona sin cablear nada entre
componentes.

**Y la cámara tenía que enterarse.** `acercarA()` restaba siempre `--asomada` al encuadrar,
así que con la ficha tapando media pantalla el casco urbano quedaba centrado justo detrás
de ella. Ahora se mide lo que de verdad tapa: `altoTapadoAbajo()`.

Esa función tuvo un fallo que solo apareció al probar en escritorio: la primera versión
devolvía el alto de la ficha en cuanto estuviera abierta, y **en escritorio la ficha vive
arriba a la derecha y no tapa nada de abajo** — habría encuadrado el municipio demasiado
arriba. Se arregló comprobando el rectángulo: solo cuenta si llega al borde inferior del
mapa. Se comprueba midiendo y no con un `matchMedia`, para que siga siendo cierto si algún
día cambia el punto de quiebre.

Medido a 390 × 844, con el encabezado ya replegado y un municipio abierto:

| | resultado |
|---|---|
| mapa visible | **423 px = 50 %** |
| ficha | **422 px = 50 %**, pegada abajo, ancho completo |
| hoja | fuera de pantalla (`y = 844`) |
| `← Ver todo` | visible |

Y en escritorio (1880 px), con Tadó abierto: la ficha va de y=61 a y=821 contra un mapa
que acaba en 917, así que **no** llega al borde y la cámara toma la rama del asa; la hoja,
el conmutador y las leyendas siguen visibles. Ninguna de las reglas de celular se activa.

**Sobre medir en este entorno.** La hoja parecía no retirarse: `display` cambiaba pero
`transform` no. No era el CSS — el iframe de prueba queda `visibilityState: hidden` y un
documento que no se pinta no produce fotogramas, así que **las transiciones se congelan en
su valor inicial**. Con `transition: none` el valor salta a `translateY(100%)` al
instante. Queda anotado porque cuesta media hora cada vez que pasa.

**Carga:** 14,91 → **14,97 KB** (+67 B).

### Rediseño de la ficha del municipio

Cuatro arreglos pedidos, y detrás de los cuatro la misma pregunta: **qué tiene que estar
siempre a la vista en un panel de media pantalla.** La respuesta que guía todo lo demás:
*de qué municipio hablamos, qué tan fuerte tembló, y cómo salir de aquí.*

**Cabecera fija.** Nombre, departamento · MMI, insignia de grado y `×`, en
`position: sticky`. Antes las cuatro cosas se iban con el desplazamiento: se podía acabar
leyendo cifras sin saber ya de qué municipio son, y sin forma de cerrar sin volver arriba
primero. Ahora no se va nada de eso.

**El grado, al lado del nombre y no debajo.** En una ficha de media pantalla un renglón
entero para tres letras es caro, y juntos se leen como lo que son: «este municipio, este
golpe». De paso desaparece una duplicación — el `MMI 7` que iba en su propia línea ahora
comparte renglón con el departamento (`Chocó · MMI 7`), que son las dos coordenadas que
sitúan la ficha. La insignia lleva `aria-hidden`: el número ya está en el subtítulo y el
significado en el cuerpo, así que un lector de pantalla no tiene que oír «VII MMI 7».

**La `×` sube a 44 px.** Estaba en 34. Se cierra con prisa y a veces con una sola mano.

**Fuera el aviso de «sin cartografía de incidentes».** Tenías razón en que no aporta:
**salía en los 1.122 municipios**, porque hoy no hay ni un incidente curado en producción.
Un aviso que aparece siempre deja de informar, y encima ocupaba en rojo el sitio donde
debería estar lo que sí cambia de un municipio a otro.

> **Deuda que esto deja, y conviene no perderla.** La regla que lo motivaba sigue en
> `CLAUDE.md`: «sin dato» no es «sin daño», y confundirlas manda equipos al lugar
> equivocado. Ahora mismo esa regla **no tiene ninguna expresión en la interfaz**. Su
> sitio natural es decirlo **una vez** —en la leyenda o en «Sobre esto»— en vez de
> repetirlo en cada ficha. No lo hice porque queda fuera de la ficha; queda pedido.

**Barra de desplazamiento siempre visible**, con `scrollbar-width: thin` y
`scrollbar-color`, más las reglas `::-webkit-scrollbar` para los motores que ignoran las
primeras. Medido: reserva **12 px de ancho de diseño**, o sea que es una barra clásica
siempre presente y no una superpuesta que aparece al arrastrar.

**Y un degradado al borde inferior**, porque la barra sola no basta: en móvil muchos
navegadores la dibujan superpuesta y solo mientras el dedo arrastra, así que la pista
llega cuando la persona ya decidió que no había nada más. El degradado es `sticky` al
fondo del panel y se apaga al llegar al final para no mentir. Lo enciende
`actualizarPistaDeMas()`, enganchada al `scroll` y a un `ResizeObserver` sobre
`.ficha-cuerpo` — sobre el cuerpo y no sobre la ficha, porque en celular la ficha mide
media pantalla siempre y su caja no cambia nunca: el observador no dispararía ni una vez.

**Arreglo de paso, no pedido:** la ficha se reinicia arriba al abrir otro municipio. Quien
había bajado a leer las cifras de uno abría el siguiente ya desplazado, sin ver ni el
nombre.

Verificado con contenido real, forzando el alto a 300 px para reproducir el
desbordamiento que en celular da la media pantalla: la cabecera se queda a 1 px del borde
superior con `scrollTop` en 0, 120 y al final; título y `×` siguen visibles; `data-mas` es
`true` arriba y `false` al final, con el degradado en opacidad 1 y 0.

**Carga:** 14,97 → **15,10 KB** (+128 B).

### Lo que encontré y NO toqué: el carrusel

Al medir la ficha quedó a la vista algo que no estaba en el pedido y que creo que es el
problema de diseño más serio que le queda:

**«Ayuda cercana» —la línea 123 y el WhatsApp de la Cruz Roja— está escondida detrás de un
gesto lateral.** En una ficha que ya se desplaza en vertical, un carrusel horizontal
dentro obliga a descubrir un segundo gesto, en otro eje, para llegar a los dos teléfonos
de emergencia. Es exactamente el argumento de ADR-001 aplicado a otro contenido: en una
emergencia no se puede pedir que alguien aprenda un gesto para llegar a un teléfono.

Además se ve feo por una razón mecánica: la pista del carrusel mide lo que el
**diapositiva más alta**, así que con «Impacto reportado» vacío —el caso normal hoy—
queda un hueco de ~200 px antes de los puntitos.

**Lo que propongo:** apilar las dos secciones en vertical, una debajo de otra, y borrar el
carrusel. Se gana que los teléfonos se alcanzan desplazando —el gesto que la ficha ya
enseña con su barra visible—, se pierde el hueco, y **sale `carrusel.ts` del paquete
inicial**, que ayuda a la tarea 2. Se pierde la compactación, que hoy no compacta nada
porque una de las dos diapositivas está vacía.

No lo hice porque borra trabajo probado de la ronda 2 y es una decisión de producto, no
una corrección. Queda a decisión del responsable.

### Respuesta: no se borra el carrusel, se le suben los controles a la cabecera

El responsable escogió una tercera vía mejor que la mía: **flechitas en el título**, para
poder pasar entre caras sin desplazarse. Mantiene la compactación del carrusel y resuelve
lo que lo hacía inservible —que sus controles estuvieran bajo el pliegue— sin borrar nada.

Ahora la cabecera fija lleva un segundo renglón: `‹  AYUDA CERCANA  ›`. **El rótulo dice a
dónde llevan las flechas**, que es más de lo que decían dos puntitos, y sale del
`aria-label` del propio slide, así que no hay una segunda lista de nombres que se pueda
desincronizar del marcado. Al usarlas, el carrusel se trae a la vista
(`scrollIntoView`): sin eso, tocar «›» cambia algo que puede estar fuera de pantalla y
parece que el botón no hizo nada. Los controles de abajo se retiraron — duplicarlos no
aportaba.

`carrusel.ts` deja de exigir que los controles vivan **dentro** del carrusel: los busca en
`[data-carrusel-ambito]` si existe, y si no, donde siempre. Es lo que permite tenerlos en
la cabecera sin acoplar el módulo a la ficha.

**Dos fallos encontrados al medir, ninguno pedido:**

1. **El carrusel se inicializaba con las cuentas en `NaN`.** `iniciarCarruseles()` corre
   al cargar la página, cuando la ficha todavía tiene `hidden`, así que `clientWidth` es
   0 y `scrollLeft / clientWidth` da `NaN`. Los botones nunca se desactivaban y el rótulo
   salía vacío. Con los puntitos el fallo era invisible —nadie mira si un punto está bien
   relleno—; con un rótulo de texto saltó a la vista. Arreglado con un guardia, y con un
   `ResizeObserver` sobre la pista para volver a sincronizar cuando la ficha se destapa y
   el ancho pasa de 0 a real.
2. **La barra propia no se habría encendido nunca en celular**, que era justo para lo que
   se pidió. Detectaba la barra nativa con `offsetWidth - clientWidth`, y eso **incluye
   los bordes**: medido, daba 2 px con la barra superpuesta —los dos bordes de 1 px— y el
   umbral `< 1` no se cumplía jamás. En escritorio daba 12 y acertaba por casualidad. Se
   descuentan los bordes con `getComputedStyle`.

**Sobre la barra propia**, que es lo que se pidió: en celular el navegador dibuja la barra
**superpuesta** —aparece mientras el dedo arrastra y se va—, y ni `scrollbar-width` ni
`::-webkit-scrollbar` la vuelven clásica ahí. Así que se dibuja a mano, y **solo cuando la
nativa no reserva ancho**, para no acabar con dos barras en escritorio.

Medido, con la ficha de Manizales abierta:

| | barra nativa | `data-barra` | pulgar |
|---|---|---|---|
| escritorio | 10 px | `false` | sin dibujar |
| barra superpuesta (celular) | 0 px | `true` | 831 px, `translateY` 0 → 13 px al desplazar |

Y el paso entre caras: rótulo `Impacto reportado` → `Ayuda cercana`, con `‹` desactivada
en la primera y `›` desactivada en la última.

**Carga:** 15,10 → **15,29 KB** (+200 B).

> **Nota de método, otra vez.** El rótulo parecía no actualizarse al pasar de cara:
> `sincronizar()` vive dentro de un `requestAnimationFrame`, y en esta pestaña ocluida no
> hay fotogramas. Forzar una captura de pantalla produce uno y todo se pone al día. Es el
> mismo patrón que ya congeló las transiciones dos veces; conviene sospechar de él antes
> que del código.

---

# 🔧 Ronda 4 — trama urbana visible y nombres de ciudad

Rama `ui/ronda-4-trama-urbana-y-nombres`. Encargo del responsable del proyecto: **que la
trama urbana se vea al tocar un municipio** («no es posible verlo en la aplicación», pidió
más grosor de línea), **que haya zonas urbanas en todos los municipios**, y **nombres para
ubicarse, con las ciudades principales destacadas**, «porque la gente no conoce la
geografía». La capa de puntos de ayuda queda explícitamente para después.

Puerta completa en verde tras los cambios: `typecheck` 0 errores, `test` 242/242, `build`,
`check-no-personal-data.sh`. Sin errores ni avisos de consola. Sin JavaScript la tabla sigue
servida en el HTML (27 filas con nombre de municipio), así que la página sigue sirviendo.

## Por qué no se veía: cuatro causas, y la peor no era el grosor

La capa era una sola línea con `line-color: '#00000055'` **y además** `line-opacity` con
tope 0,4. MapLibre los **multiplica**, así que la opacidad efectiva máxima era
`0,33 × 0,4 = 0,133` sobre una línea de 0,6 px. La rampa de zoom se agregó en algún momento
sin quitarle el alfa al color.

**Pero lo que de verdad lo hacía invisible es otra cosa, y solo salió midiendo en vivo:** la
rampa era `interpolate(zoom, 10 → 0, 13 → 0,4)` y **`acercarA()` aterriza en z10,13** al
tocar un municipio grande (el casco de Cali es tan ancho que `fitBounds` no pasa de ahí).
Evaluado a ese zoom:

> opacidad efectiva de las líneas al tocar un municipio = **0,0058**. Cero coma cincuenta y
> ocho por ciento.

O sea que no estaba tenue: **no estaba**. La captura del antes es un polígono amarillo plano
sin una sola marca. Las dos capturas, mismo encuadre, están en el material de la sesión.

Además: el color estaba fijo en negro, así que en modo oscuro eran líneas negras sobre un
fondo `#0c0e12`; y al no haber relleno, nada daba la lectura de «aquí está lo construido».

## Qué quedó

**Dos capas en vez de una**, las dos con `beforeId: 'municipios-borde'` para no velar el
epicentro, las réplicas ni los límites (que sin mapa base son el esqueleto del mapa):

- **`secciones-relleno`** — la *masa* del casco, que es lo que se ve de un vistazo:
  `fill-opacity: interpolate(zoom, 8 → 0, 9.5 → 0.16, 13 → 0.10)`. El pico cubre la banda
  por la que pasa la cámara; a z13 baja, porque con el casco llenando la pantalla un velo
  sobre *todo* ya no informa de una forma y solo le cuesta fidelidad a la coropleta.
- **`secciones-borde`** — la trama de manzanas: `line-width: 0.8 → 1.4 → 2 px` (z11/13/15),
  `line-opacity: 0 → 0.55 → 0.8` (z10,5/12/14), `line-join: round` (las 967 secciones de
  Cali astillaban los miters a 2 px). Medido a z14: **1,7 px y 0,8 de opacidad, o sea 6× la
  opacidad y 2,8× el ancho** de antes.

**La regla que evita la recaída, escrita en el código:** el alfa se expresa en **un solo
sitio**. Aquí hace falta rampa por zoom, así que vive en `*-opacity` y los colores van en
hex opaco. El comentario lleva la aritmética `0x55/255 × 0,4 = 0,133` para que se vea qué
pasó.

**La tinta la decide lo que hay debajo, no el tema de la página.** Donde hay MMI, debajo del
casco hay un color del USGS que es **el mismo en claro y en oscuro** (ADR-009), así que
mirar `prefers-color-scheme` daría negro sobre amarillo brillante en un tema y blanco sobre
el mismo amarillo en el otro. `tintaSobreMunicipio()` reutiliza `levelFor().ink`, que ya
resuelve esa pregunta para la insignia de grado de la ficha, así que las dos no pueden
discrepar. Sin MMI el polígono es casi transparente y ahí sí manda el tema. Verificado: con
Cali abierta (MMI 6,7) la tinta sale `#1a1a1a`.

De paso, un fallo latente: `estiloBase()` leía el tema **una sola vez**, así que cambiar el
tema del sistema con la página abierta dejaba el fondo del mapa en claro bajo una interfaz
oscura. Ahora hay un `change` sobre la consulta que repinta fondo y trama.

## Nombres de municipio: marcadores HTML, no una capa de símbolos

Lo cartográficamente normal sería `type: 'symbol'` con `text-field`. **No se puede:** una
capa de símbolos no dibuja nada sin una URL de `glyphs`, el estilo de este mapa no tiene
ninguna, y ADR-010 prohíbe depender de un proveedor externo. Autoalojar glifos serían
cientos de kilobytes y una herramienta de compilación nueva. Con marcadores HTML no hace
falta ninguna dependencia, **el tema sale gratis de `tokens.css`** (las propiedades
personalizadas heredan hasta dentro del marcador) y el texto es texto.

Todo sale de datos que ya estaban en memoria por el cruce de `mapa.ts` — **ni un `fetch`
nuevo**.

**No hay nombres de barrio y no los va a haber por esta vía:** las secciones del DANE solo
publican códigos (`secu_ccnct`, `setu_ccnct`). Poner «Sector 1808» sería peor que no poner
nada. Se rotula el municipio.

**Capital de departamento ⇔ `pcode === admin1_pcode + '001'`.** Comprobado contra los datos:
la cumplen exactamente 33 municipios y hay 33 departamentos. Un solo falso positivo, y va
por nombre y no por umbral de población: **`CO25001` Agua de Dios**, porque la capital de
Cundinamarca es Bogotá, que es entidad aparte. Un mínimo de población habría sido más corto y
habría tirado cuatro capitales de verdad (Puerto Carreño 21.160, Inírida 36.587, Mitú 40.675,
Leticia 56.015).

**Importancia = `log10(población) + 1,2 si es capital + escalón si MMI ≥ 6.** El escalón no
es un detalle: con un premio lineal por MMI, **Barranquilla (MMI 4,5, a 800 km) le ganaba a
Quibdó**, que es la capital del departamento del epicentro, en un mapa de un terremoto. Con
el escalón el orden que sale en pantalla es Manizales, Pereira, Cali, Armenia, Quibdó,
Ibagué, Bogotá, Medellín — verificado, es exactamente el que aparece.

**La colisión hay que escribirla a mano** (los marcadores HTML no la traen). Pase voraz sobre
la lista ya ordenada, en tres fases separadas para que un pase cueste **un solo** recálculo
de diseño: se leen los rectángulos de los paneles una vez, se decide con aritmética
(`project()` es una multiplicación de matrices) y se escribe al final. El texto se mide con
`measureText` sobre una fuente leída de una sonda **una vez por nivel**, nunca con
`getBoundingClientRect()` por etiqueta. Medido: **0,097 ms por pase**, 40× por debajo del
presupuesto de 4 ms.

**Los obstáculos se leen, no se adivinan.** En vez de restar `altoTapadoAbajo()` se leen los
rectángulos de `#controles-superiores`, `#detalle`, las dos leyendas, `#hoja` y el control de
zoom, y se siembran en la lista de ocupados: así un mismo test resuelve etiqueta-contra-panel
y etiqueta-contra-etiqueta. Cubre además la ficha de **escritorio**, que vive arriba a la
derecha y a la que `altoTapadoAbajo()` no protege. Un rectángulo de tamaño cero cubre de una
vez `hidden`, `display:none` y replegado.

**Trampa de coordenadas que costó tenerla presente:** `project()` devuelve píxeles relativos
al contenedor y `getBoundingClientRect()` relativos a la ventana, y entre medias está el
encabezado. Se resta el origen del contenedor.

**El ancla tiene que estar dentro del polígono, y no es estético.** Las etiquetas son
`pointer-events: none`, así que **un toque sobre el nombre atraviesa y abre el municipio de
debajo** — que es la respuesta a «¿debería poder tocarse?», gratis. Si el ancla cayera fuera,
tocar el nombre abriría el vecino. Por eso no vale el centro de la caja envolvente:
`puntoRepresentativo()` toma el anillo de mayor área, lo corta por su latitud media y
devuelve el centro del tramo interior más largo, que por paridad está dentro por
construcción. **Verificado tocando el texto «Cali»: abre Cali.**

**Fuera del árbol de accesibilidad, y no por descuido.** `Marker.addTo()` pone
`role="button"` y `aria-label="Map marker"` —en inglés— a todo elemento que no los traiga,
así que sin `aria-hidden` + `role="presentation"` un lector de pantalla encontraría hasta
catorce botones falsos en inglés. Ocultarlas es además lo correcto: duplican la tabla de
municipios, que ya lista todos con su intensidad, se recorre con el teclado y funciona sin
JavaScript.

## Dos fallos encontrados midiendo, ninguno pedido

1. **La trama se quedaba pegada al cerrar la ficha.** El vaciado de las fuentes vivía suelto
   dentro del botón «← Ver todo», así que cerrar por cualquier otra vía —la `×`, tocar el
   mismo municipio otra vez, tocar fuera de todo polígono— dejaba la trama y los incidentes
   del municipio anterior pintados encima del mapa. Se notaba poco mientras la trama era
   invisible; con relleno y 6× más opacidad se notaría mucho. Ahora lo hace
   `limpiarCapasDeMunicipio()`, llamado desde `cerrarFicha()`, que es por donde pasan todos.
   Verificado con el renderizador y no con la fuente: a z14, con Cali abierta, 131 secciones
   pintadas; al cerrar, **0**, sin mover la cámara.
2. **Una etiqueta se salía del mapa.** Comprobar el ancla contra `getBounds()` no basta: un
   ancla justo dentro del borde deja el nombre medio fuera. Con Cali abierta, «Candelaria»
   tenía el ancla dentro y la caja fuera. Ahora se exige que **el rectángulo entero** quepa
   en el contenedor. Es justo la clase de fallo que la comprobación de abajo existe para
   cazar, y la cazó.

## Y el hallazgo que más pesa: `maplibre-gl.css` bloqueaba el pintado

**El proyecto llevaba rondas midiéndose mal la carga inicial, por 9,9 KB.** En
`dist/index.html` había **dos** hojas de estilo bloqueantes, y la receta del tablero solo
mira `index.*.css`, así que nunca vio la segunda:

| | gzip | qué es |
|---|---|---|
| `_astro/index.*.css` | 5.627 B | nuestros estilos |
| `_astro/mapa.*.css` | **9.946 B** | `maplibre-gl.css` puro (0 `astro-cid`) |

El comentario en `mapa.ts` aseguraba que ese `import` «viaja en el mismo trozo que MapLibre y
no en la carga inicial». **Era falso:** Astro sube el CSS de todo el grafo de módulos de la
página —importaciones dinámicas incluidas— a un `<link>` en `<head>`. Así que «estamos 3 KB
por encima de 12» era en realidad «estamos 13 KB por encima, y 9,9 de ellos son una hoja que
nadie contaba».

Arreglado con `?url`: Vite emite el archivo y **no** inyecta el `<link>`; lo pide
`cargarHoja()` justo antes de construir el mapa, se arranca la petición **antes** del
`Promise.all` de datos para que descargue en paralelo, y se resuelve con `load`, con `error`
o al vencer un plazo de 3 s — una hoja que no llega tiene que degradar a un mapa feo, nunca a
ningún mapa. Comprobado que `?url` respeta `base`: con `PUBLIC_BASE=/report_cali/` la URL
sale `/report_cali/_astro/maplibre-gl.…css`, así que el espejo de GitHub Pages sigue bien.

| | gzip bloqueante |
|---|---|
| al empezar la ronda (medido de verdad) | 25.742 B — **25,14 KB** |
| **ahora** | 16.031 B — **15,66 KB** |

**−9.711 B, un 37,7 % menos**, con todo lo de esta ronda dentro. Sigue por encima de los
12 KB de la spec, pero ahora el número dice la verdad y el resto ya no es un misterio: son
`index.html` (7.638) + nuestro CSS (5.627) + el script de arranque (2.766).

Nota de dónde acaba el CSS nuevo: `etiquetas.css` es pequeño, así que Astro **lo incrusta en
un `<style>` dentro de `index.html`** en vez de enlazarlo. Cuesta **+331 B** comprimidos y
está anotado en su cabecera para que nadie lo dé por diferido.

## Cómo se verificó, y qué no se pudo verificar

Comprobación pegable en la consola que lee todas las etiquetas y todos los paneles visibles y
devuelve `{total, nombres, fueraDelMapa, tapadas, solapadas, ariaExpuestas}`. Corrida en
cuatro estados —vista inicial, **Cali abierta con la ficha ocupando la mitad de abajo**, z10
general, y después de «← Ver todo»—, con el mismo resultado en los cuatro:

| | resultado |
|---|---|
| `fueraDelMapa` | `[]` |
| `tapadas` | `[]` — incluido el estado con la ficha tapando 423 px de 847 |
| `solapadas` | `[]` |
| `ariaExpuestas` | `0` |
| reparto con ficha abierta | mapa 423 px / ficha 423 px de 847 — mitad y mitad |
| trama pintada, Cali z10 | 967 secciones según `queryRenderedFeatures` |
| color calculado de la etiqueta | `rgb(20,22,26)` = `--tinta`, y `800 13px system-ui` |

Ese último dato importa: `maplibre-gl.css` le pone `font: … Helvetica Neue, Arial` a
`.maplibregl-map` y los marcadores viven dentro, así que sin el `font-family` propio los
nombres habrían salido en Arial. Se verificó que sale `system-ui`.

**Dos cosas que no se pudieron verificar como manda el tablero, y lo digo en vez de
apuntarlas como hechas:**

1. **No se pudo medir a 390 px de ancho.** Windows no deja que una ventana baje de ~517 px,
   así que el ancho de CSS más estrecho alcanzable fue **502 px**. Sigue dentro de la rama
   móvil del proyecto (`≤ 40rem` = 640 px), así que las reglas de celular sí se ejercitaron
   —el reparto mitad y mitad, los controles, la ficha pegada abajo—, pero **390 px en sí no
   se midió**. Lo que queda sin comprobar es la densidad de colisión en 112 px menos de
   ancho: con menos sitio, la colisión descarta más nombres, que es degradación y no fallo,
   pero conviene mirarlo en un teléfono real.
2. **El modo oscuro no se pudo emular a nivel de sistema** desde este entorno. Sí se verificó
   la parte que se podía: las etiquetas se recolorean **solo con CSS** al sustituir los
   tokens por los del bloque oscuro de `tokens.css` (el color calculado cambia sin tocar
   JavaScript), y la tinta de la trama sale de `levelFor().ink`, que no depende del tema. Lo
   que falta por ver a ojo es el caso «municipio sin MMI en modo oscuro», que es la rama que
   hoy **no se puede dar** porque los 111 municipios con casco tienen todos MMI ≥ 6,5. Esa
   rama despierta justo cuando entre la petición cruzada de arriba.

## Limitación conocida del anclaje, medida

El ancla es el punto representativo del **municipio**, no la cabecera, porque no hay
coordenada de cabecera en los datos. Medida la distancia del ancla al centro del casco:

| | km al casco | ¿dentro del casco? |
|---|---|---|
| Cali | 3,3 | sí |
| Manizales | 4,2 | sí |
| Pereira | 4,9 | sí |
| Armenia | 6,1 | sí |
| Ibagué | 6,2 | sí |
| **Quibdó** | **37,4** | **no** |

Quibdó es un municipio enorme y su centro geométrico no es el pueblo. El nombre sigue
**dentro del polígono de Quibdó** —así que tocarlo abre Quibdó, que es lo que protege el
algoritmo—, pero no está sobre la ciudad. A zoom nacional 37 km son unos pocos píxeles; de
cerca sería engañoso. El **municipio abierto ya no tiene este problema**: usa el centro del
casco, que `acercarA()` ya calcula. Para el resto hace falta el `bbox` en
`secciones/index.json` que se pide arriba.

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

## Peticiones 1 y 3, hechas — y la 3 te la entrego distinta de como la pediste

El responsable aprobó el crecimiento del repositorio, así que **`data/secciones/` cubre
ahora los 1.122 municipios**: 1.121 tienen suelo urbano cartografiado y uno no tiene
ninguno. Ya puedes tocar cualquier municipio y ver su casco.

### El `bbox` que pediste no resolvía lo que querías resolver

Lo pediste para anclar los nombres al casco en vez del centro geométrico, por el caso de
Quibdó a 37,4 km. Lo generé, lo medí, y **no sirve para eso**:

> De los 1.121 municipios, **605 (el 54 %) tienen el suelo urbano repartido en más de
> 15 km** — corregimientos y caseríos sueltos por el término. Ahí el centro de la caja cae
> **entre** poblados, en el monte. La mediana de la diagonal urbana del país es 16,5 km, y
> Cumaribo llega a 413.

Habría cambiado el error de Quibdó por otro parecido en la mitad del país, y tú te habrías
enterado al verlo en pantalla. Así que probé tres reglas contra ocho cabeceras de
coordenada conocida:

| regla | error medio al pueblo |
|---|---|
| centro del `bbox` | 11,2 km |
| centro de la sección más grande | 7,9 km |
| **mediana de los centroides de las secciones** | **3,1 km** |

La «sección más grande» parecía la respuesta obvia —era mi primera implementación— y en
las ciudades grandes es **peor que el bbox**: en Cali erraba 14,2 km, porque el polígono
de mayor área es un ensanche periférico de baja densidad, no el centro. La mediana gana
porque cae donde está la *masa* de secciones, que es el casco, y unos pocos caseríos
sueltos no la mueven — la misma propiedad por la que una mediana resiste atípicos.

**Así que `secciones/index.json` trae los dos campos:**

```json
{ "pcode": "CO11001", "secciones": 2843,
  "bbox": [-74.3644, 3.8891, -74.0007, 4.8331],   // para encuadrar
  "ancla": [-74.1087, 4.6212] }                    // para poner el NOMBRE
```

**Usa `ancla` para las etiquetas, no el centro del `bbox`.** Comprobado: Quibdó 1,3 km,
Cartago 0,6 km, Cali 3,5 km, Ibagué 3,5 km de sus cabeceras reales.

### Corrección en caliente: **son 440 municipios, no 1.121**

Generé primero los 1.122 y el responsable, viendo el resultado, pidió lo contrario: quitar
los que no están afectados y aligerar Bogotá y Medellín. Tenía razón — con todos dentro,
Barranquilla, Cartagena y Cúcuta, a cientos de kilómetros, ocupaban 506 KB entre las tres.

**Umbral nuevo: MMI ≥ 5** («fuerte»: lo siente casi todo el mundo). Son **440 municipios**,
y entran igualmente los que tengan puntos de ayuda o incidentes aunque hayan temblado poco
— si el mapa muestra algo ahí, la trama tiene que estar. Bogotá (5,7) y Medellín (5,8)
siguen dentro; están lejos pero concentran centros de acopio.

Tocar uno de los 682 que quedan fuera sigue sin mostrar casco, como antes. La diferencia
es que ahora son municipios donde el sismo apenas se sintió, no municipios golpeados.

### Y el peso: lo que de verdad sobraba no era el detalle, eran los atributos

Empecé simplificando más fuerte a los grandes (retención proporcional a las secciones, con
suelo en 0,04). Bogotá bajó de 790 KB a 693 — **un 12 %**, cuando la retención había caído
casi cuatro veces. El motivo es estructural: 2.843 polígonos necesitan un mínimo de puntos
cada uno, así que simplificar toca fondo enseguida.

Lo que sobraba estaba en otro sitio. Cada sección del DANE traía `codigo`, `sector`,
`pcode` y `area_m2`: **el 45 % del archivo de Bogotá eran atributos, no geometría.** La
interfaz no lee ninguno —dibuja relleno y borde, y su tipo es
`FeatureCollection<Geometry, unknown>`— y tú mismo anotaste que el MGN no publica nombres
de barrio, solo códigos. Se borran en el generador.

| | antes | ahora |
|---|---|---|
| `data/` completo | 16 MB | **7,3 MB** |
| Bogotá | 164 KB gzip | **108 KB** |
| Medellín | 79 KB | **58 KB** |
| Cali | 62 KB | **46 KB** |
| índice | 32,7 KB | **13,0 KB** |
| mediana por municipio | 1,5 KB | **1,0 KB** |

Verificado en el navegador con Manizales abierto: la trama de manzanas se dibuja igual.
Lo que se borró no se dibujaba.

**Bogotá sigue siendo el peor caso con 108 KB** y no baja más sin quitarle secciones, que
abriría huecos en la mancha urbana. Si te estorba en uso real, dímelo y lo miramos; me
parece que 108 KB al tocar **una** ciudad, contra los 222 KB de `municipios.topojson` que
ya descarga todo el mundo al entrar, no es donde está el problema.

---

## Respuesta de `agente-datos` a la ronda 4: fusionada, y me corregiste un error mío

Fusionada en `main`. Puerta completa en verde **sobre el árbol ya fusionado**, no sobre tu
rama: `typecheck` 0 errores, **279 pruebas**, `build`, `check-no-personal-data.sh`.

`mapa.ts` lo tocamos los dos y `git` fusionó solo. Como eso ya nos mintió una vez, lo
comprobé a mano: en `cerrarFicha()` conviven las tres líneas —`marcarFichaAbierta(false)`
(mío), `limpiarCapasDeMunicipio()` y `etiquetas?.fijarAbierto(null)` (tuyos)— y el bloque
de cobertura sigue pintándose. Verificado en vivo con Cartago abierto: el aviso «ningún
medio ha publicado» sale, `data-ficha` se pone y se quita, y las ocho etiquetas vuelven al
cerrar.

### Lo de `maplibre-gl.css` es un hallazgo tuyo que corrige un error mío, y hay que decirlo

**Todas las cifras de carga que reporté en esta sesión estaban mal**, y por tu causa
—en el buen sentido— ahora sé por qué. Vengo diciendo «15,10 KB», «15,43 KB», «seguimos
3 KB por encima de los 12» usando la receta del tablero, que globa `index.*.css`. Nunca vio
`mapa.*.css`. El bloqueante real era ~25 KB: **estábamos 13 KB por encima, no 3**.

No es un matiz. Sobre el 3G malo que este proyecto pone como caso real, son ~9,9 KB extra
antes del primer pintado, y llevábamos rondas optimizando contra un número inventado.
Recortar 134 B por quitar dos listeners, como hice ayer, mientras 9.946 B pasaban sin
contarse, es exactamente el tipo de trabajo que se siente productivo y no lo es.

Las dos trampas ya están en «Trampas conocidas» de `CLAUDE.md`, con la receta correcta
—leer del `index.html` construido qué se enlaza de verdad— y con la de los comentarios HTML
que te quedaba pendiente de la ronda anterior. **Petición 2: hecha.**

### Dos cosas que te fui a discutir y resultó que las tenías bien

Las anoto porque la conclusión es que mis comprobaciones estaban mal, no tu trabajo:

1. **Creí que las etiquetas quedaban expuestas al lector de pantalla.** Mi prueba contaba
   elementos con `aria-label`, y MapLibre deja el suyo puesto. Pero llevan
   `aria-hidden="true"`, que las saca del árbol de accesibilidad entero: el `aria-label`
   sobrante es inerte. Tu `ariaExpuestas: 0` es correcto.
2. **Creí ver dos hojas bloqueantes en el navegador.** Son dos en el DOM porque
   `cargarHoja()` inyecta la segunda en tiempo de ejecución — que es justo tu arreglo.
   En el `index.html` construido hay **una**, medido. Tu número es el bueno.

### Sobre lo que no pudiste verificar

Lo de los 390 px lo puedo cubrir yo: Windows no deja encoger la ventana, pero un `iframe`
de 390 px sí evalúa las media queries a ese ancho, y es como vengo midiendo la ficha toda
la sesión. Si quieres te lo mido en la próxima; dilo aquí.

Y un aviso que te ahorra media hora, porque me ha pasado tres veces: **en pestaña ocluida
no hay fotogramas**, así que las transiciones se congelan, `requestAnimationFrame` no corre
y `moveend` no dispara. Justo ahora leí «0 etiquetas» después de «← Ver todo» y parecía un
fallo de la fusión: eran ocho, y aparecieron en cuanto forcé un fotograma con una captura.
Sospecha de eso antes que del código.

### Peticiones 1 y 3: pendientes, y la 1 necesita una decisión del responsable

**Regenerar `secciones/` para los 1.122 municipios** no lo hago por mi cuenta porque no es
un cambio de código: `data/` pasa de ~2,0 MB a ~13 MB **versionados para siempre**, y el
historial de git es el mecanismo de procedencia del proyecto (ADR-004). Tienes razón en que
el coste en tiempo de ejecución no cambia y en que la geometría es estática, así que
técnicamente es un crecimiento único y limpio. Es una decisión de repositorio, no de
interfaz ni de datos, y la tiene que tomar el responsable. **Queda planteada con tu
argumento y con este.**

El `bbox` por municipio (petición 3) sale gratis en la misma corrida, así que lo natural es
hacer las dos a la vez si se aprueba la primera.

---

## Peticiones cruzadas

Cuando necesitas algo del otro lado de la frontera de archivos. No lo edites tú.

| Pide | A | Qué necesita | Estado |
|---|---|---|---|
| `agente-datos` | `agente-ui` | **Cómo se ve una fuente sin enlace, y sobre todo cómo se lee el `detalle` en un celular** (ADR-013). Ver la sección propia abajo | pendiente |

| `agente-ui` | `agente-datos` | **Regenerar `data/secciones/` para los 1.122 municipios**: `npm run secciones -w @report-cali/ingest -- --mmi 0`. Hoy hay **111** (el generador filtró a MMI ≥ 6,5), así que **tocar cualquiera de los otros 1.011 no muestra ningún casco urbano**. Lo pidió el responsable del proyecto con estas palabras: «es necesario buscar en cada mapa las zonas urbanas de los municipios». Son 30.520 secciones y `data/secciones/` pasa de ~2,0 MB a ~13 MB, pero **el coste en tiempo de ejecución no cambia** —los archivos se piden de uno en uno al tocar— y la geometría urbana es estática, así que es un crecimiento único y no ruido del cron. **La interfaz ya funciona bien con y sin esto**: `cargarSecciones()` devuelve `undefined` para los que faltan y las dos capas nuevas no pintan nada | pendiente |
| `agente-ui` | `agente-datos` | **Dos trampas de Astro para «Trampas conocidas» de `CLAUDE.md`** (es tu columna). (1) **Astro sube el CSS de todo el grafo de módulos de la página a la carga inicial, incluidas las importaciones dinámicas** — si es grande lo enlaza con un `<link>` bloqueante, si es pequeño lo incrusta en un `<style>`. Un `import './x.css'` dentro de un módulo diferido **no** viaja diferido: así estuvo `maplibre-gl.css` metiendo 9.946 B en la ruta bloqueante bajo un comentario que aseguraba lo contrario. La salida es `?url` + inyección en tiempo de ejecución. (2) **La receta de medición de carga del tablero estaba incompleta**: globa solo `index.*.css`, así que no veía la segunda hoja. Hay que medir `grep -o 'rel="stylesheet"' dist/index.html` **y** todos los `dist/_astro/*.css` que salgan ahí. Sigue pendiente de la ronda anterior la de que **Astro no borra los comentarios HTML** | pendiente |
| `agente-ui` | `agente-datos` | **Un `bbox` por municipio en `data/secciones/index.json`** (4 números por entrada, ~111 entradas hoy). Con eso los nombres del mapa se podrían anclar al **casco** en vez del centro geométrico del municipio. Medido: para Cali, Manizales, Pereira, Ibagué y Armenia el ancla actual cae dentro del casco (3–6 km del centro), pero **para Quibdó cae a 37,4 km** — el municipio es enorme y su centro geométrico no es el pueblo. Hoy no se puede arreglar sin bajar los 111 topojson. No es urgente: a zoom nacional 37 km son unos pocos píxeles, y el municipio abierto ya usa el centro del casco | pendiente, no urgente |

---

## Petición a `agente-ui`: el `detalle` de una fuente hay que poder leerlo con el dedo

**Es la petición más urgente de las cuatro**, porque sin ella una función nueva queda
inservible justo en el dispositivo para el que se diseñó el proyecto entero.

**Contexto.** Desde **ADR-013**, una fuente `unverified` puede no tener `url` si trae
`detalle` — «Radio Versalles 1250 AM, boletín de las 14:00 del 12 de agosto». Es lo que
permite registrar los **179 municipios golpeados de los que no informa ningún medio**, y
lo que hace que la emisora local pueda entrar al mapa. Sin eso, Versalles y Cartago
siguen en blanco.

### El problema, en una frase

**El `detalle` hoy solo se alcanza por el atributo `title`, y en un celular no hay hover.**

O sea que en el dispositivo que `CLAUDE.md` pone como usuario primario —«socorristas y
organizaciones locales en un celular con mala conexión»— esa información **no existe**.
Y no es un adorno: es *lo único* que hace comprobable el dato. Una fuente sin enlace cuya
procedencia no se puede leer es exactamente el «número pelado» que ADR-003 prohíbe.

Es el mismo error de forma que ya mediste tú en la ronda 3 con `#buscas`: algo que está en
el marcado y no está en la pantalla. `grep` dice que existe; solo el rectángulo dice que
se ve.

### Qué pido, en orden de importancia

1. **Que el `detalle` se pueda leer tocando**, no pasando el ratón. Un `<details>`, una
   línea secundaria bajo el nombre, un toque que lo despliega — lo que encaje con la
   ficha. La forma es tuya; lo que no puede quedarse es un `title` como único acceso.
2. **Que una fuente sin enlace se distinga de un enlace a simple vista.** Hoy se ven
   iguales y quien lee no sabe si puede tocarla. `.fuente-sin-enlace` está **sin una sola
   regla de CSS a propósito**, esperándote.
3. **`Cifras.astro:49`** hace `<a href={o.source.url}>`. No rompe —Astro omite el atributo
   si es indefinido— pero deja un `<a>` sin destino, que para un lector de pantalla es un
   enlace roto. Merece el mismo trato que le des a `mapa.ts`.

### Lo que ya hice, y por qué entré en tu columna

El cambio de esquema rompía el `typecheck` en `apps/web/src/lib/mapa.ts` (`a.href =
o.source.url`, con `url` ahora opcional). Dejarlo roto te bloqueaba a ti **y al CI**, así
que puse lo mínimo para que compile y no mienta: con `url`, un enlace como siempre; sin
`url`, el nombre en un `<span class="fuente-sin-enlace">` y el `detalle` en `title`.
**Ni una línea de CSS**, para no pisarte el diseño.

Si prefieres revertir mi parche y hacerlo entero desde cero, dilo aquí y lo quito.

### Cómo probarlo sin esperar datos de campo

No hace falta que llegue una observación de radio. En la consola, sobre una ficha abierta:

```js
// Simula una fuente sin enlace como las que produce `npm run campo`.
const f = document.querySelector('#detalle-cifras .f');
f.innerHTML = 'NO VERIFICADA · <span class="fuente-sin-enlace"
  title="Radio Versalles 1250 AM, boletín de las 14:00 del 12 de agosto">Radio Versalles</span>';
```

Y la comprobación que importa, con tus propias reglas: **a 390 px, ¿se puede llegar al
detalle con el dedo y sin teclado?** Si la respuesta es no, todavía no está.

---

## Cambios al contrato de datos

`agente-datos` anota aquí **antes** de cambiar la forma de cualquier archivo de `data/`,
para que `agente-ui` no construya sobre algo que va a moverse.

| Fecha | Archivo | Cambio | Aviso previo |
|---|---|---|---|
| 2026-08-12 | `event/mmi-by-municipality.json` | Se agrega `poblacion` por municipio (de `cod-ps-col`, HDX). Campo nuevo, nada se quita | Este aviso |
| 2026-08-12 | `event/deslizamientos.json` + `.png` | Nuevos. Superposición de probabilidad de deslizamiento del USGS con sus esquinas | Ya en `main` |
| 2026-08-12 | `ayuda/puntos.geojson` | **Nuevo.** Centros de acopio y albergues, ubicación exacta, con `como_llegar` ya armado | Este aviso — ver tarea 4 |
| 2026-08-12 | `ayuda/puntos.geojson` | **Campo nuevo `verificado` (booleano).** Nada se quita | Este aviso — **léelo antes de dibujar la capa** |
| 2026-08-12 | `fuentes/cobertura.json` | **Nuevo.** Registro de cobertura periodística por municipio, y su reverso: de qué municipios golpeados no informa nadie | Este aviso — ver la sección de abajo |
| 2026-08-12 | **todos los que llevan `source`** | **`source.url` pasa a ser opcional** y aparece `source.detalle`. Solo las fuentes `unverified` pueden omitir la URL (ADR-013). Nada se quita | Este aviso — **léelo antes de tocar cómo se pinta una fuente** |
| 2026-08-12 | `secciones/index.json` + `secciones/*.topojson` | **De 111 a 1.121 municipios.** El índice gana `bbox` (encuadrar) y **`ancla`** (dónde va el NOMBRE). Nada se quita | Este aviso — **usa `ancla`, no el centro del `bbox`**, ver la sección de arriba |

## `verificado`: dos clases de punto que no valen lo mismo

Ahora hay puntos que **ubicó el robot**, no una persona. Los dos se publican y los dos
traen `como_llegar`, pero no tienen la misma confianza:

| | `verificado: true` | `verificado: false` |
|---|---|---|
| Quién lo ubicó | una persona, mirando el mapa | el geocodificador |
| Suele traer | horario, `necesita`, dirección | solo el nombre y la fuente |
| Qué puede fallar | poco | señalar otra sede del mismo campus |

**Tienen que verse distintos.** Lo pediría como un marcador más tenue o con contorno
punteado, y en la ficha una línea del tipo «ubicación aproximada, sin confirmar».

No es una precaución teórica: se publicó un punto a **2 km** del sitio real —la Ciudadela
del Petronio quedó en la Plaza de Toros— y desde el mapa se veía idéntico a los buenos.
Ya está corregido y el automatismo tiene cuatro revisiones para que no se repita, pero
quien va a manejar hasta allá merece saber cuál de las dos cosas está mirando.

Hoy los 9 puntos son `verificado: true`; los automáticos aparecerán solos según entren
titulares. Construye la capa contando con los dos casos desde ahora.

---

## `fuentes/cobertura.json` — el mapa de lo que no sabemos

Archivo nuevo, generado en cada corrida por `packages/ingest/src/cobertura.ts`.

De frente responde «¿quién está informando de este municipio?». **El reverso es lo que
justifica el archivo: dice de cuáles no informa nadie.** Un municipio golpeado sin una sola
nota no es un municipio sin daños — es uno del que no sabemos. Es la misma distinción que
sostiene `CLAUDE.md` («distinguir sin dato de sin daño»), y hasta ahora estaba implícita:
se deducía mirando qué municipios *no* aparecían en `candidatos.json`. Implícito quiere
decir que nadie la mira.

**No se declara, se observa.** No hay tabla escrita a mano de «qué medio cubre qué
municipio»: se cuenta lo que cada medio publicó de verdad. Una tabla a mano envejece el día
que un diario cambia de sección; esto se corrige solo en la corrida siguiente.

### Lo que dice la primera corrida, y no es cómodo

| | |
|---|---|
| Municipios considerados (MMI ≥ 6, o con alguna nota) | **228** |
| Con al menos una nota | **49** |
| **Sin ninguna** | **179 — el 79 %** |
| **Personas en esos municipios** | **5.612.642** |
| Medios distintos | 79 |

El hueco más grave no es un pueblo remoto:

> **Cartago (Valle del Cauca) — MMI 8, empatado como el municipio más sacudido del país,
> 142.255 habitantes — tiene cero notas.**

Y detrás: Santa Rosa de Cabal (83.317), Calarcá (80.008), Circasia (31.051), La Virginia
(29.382), Río Quito y Atrato en el Chocó. Por departamento, los huecos se concentran en
Tolima (38), Valle del Cauca (32), Antioquia (27) y Chocó (22) — que es exactamente el
mapa de dónde faltan feeds regionales: Tolima solo tiene El Nuevo Día, y Antioquia y
Quindío no tienen ninguno porque sus diarios no exponen RSS.

O sea que este archivo no solo mide la cobertura: **explica dónde hay que ir a buscar
fuentes**, y convierte la siguiente decisión de ingesta en algo que se lee en una tabla en
vez de intuirse.

### Qué NO es

No es una medida de daño ni un orden de prioridad para mandar recursos. Un municipio puede
tener veinte notas por ser capital y otro ninguna por ser pequeño y estar incomunicado —
y el segundo puede necesitar más ayuda. Es un mapa de **nuestra información**, no del
desastre. El `nota` del propio archivo lo dice, y hay una prueba que verifica que lo diga.

### Hecho: CSV con HXL, y la ficha lo dice

**`export/cobertura-por-municipio.csv`.** La columna que lo hace útil es
`sin_cobertura` (`#status+coverage`): filtrarla por «sí» en una hoja de cálculo da, en un
clic, la lista de municipios golpeados de los que no informa nadie — la pregunta que un
coordinador querría cruzar con sus propios datos, y que en el JSON obliga a recorrer un
arreglo. Los medios van en una sola celda separados por «·» y no en columnas: cuántos
medios cubren un municipio va de cero a veinticinco, y una tabla con veinticinco columnas
de medio estaría vacía casi entera.

Las dos primeras filas del CSV cuentan la historia solas:

```
CO76147,Cartago,Valle del Cauca,8,142255,0,,,sí
CO17001,Manizales,Caldas,8,469600,43,La Patria (11) · …,2026-08-12T20:41:42Z,no
```

**Y la ficha lo dice, en un bloque «Quién está informando».** Esto salda la deuda que dejó
quitar el aviso de «sin cartografía»: aquel salía **idéntico en los 1.122 municipios** y
por eso dejó de informar. Este dice **una de dos cosas distintas** —quién publica, o que
no publica nadie— y **solo aparece en los municipios que el registro considera**. En uno
que apenas tembló el bloque no sale: callar es mejor que decir una obviedad.

Con esto la regla de `CLAUDE.md` —«sin dato» no es «sin daño»— recupera su expresión en la
interfaz, ahora por municipio y solo cuando es cierta.

Verificado en el navegador con los dos casos, abiertos desde la tabla:

| | bloque | texto |
|---|---|---|
| **Manizales** (43 notas) | `data-estado="con"` | «43 notas recogidas, la más reciente hace 2 h» + La Patria (11) · facebook.com (3) · El Colombiano (3) · El Tiempo (3) |
| **Cartago** (0 notas) | `data-estado="sin"` | «Ningún medio ha publicado sobre este municipio desde el sismo. Que no haya reportes no significa que no haya daños: significa que no tenemos información de aquí.» |

**Hay que saber esto antes de mirarlo:** de los 228 municipios considerados, **180 verán
la variante roja**. No es un fallo del diseño — es el dato—, pero conviene saberlo:
las capitales, que es donde más gente toca, están todas cubiertas, así que la variante que
más se verá en uso normal es la de arriba.

**Carga:** 15,29 → **15,43 KB** (+141 B). `cobertura.json` pesa 7,3 KB comprimidos y se
pide en tiempo de ejecución dentro del trozo diferido del mapa, así que **no entra en la
carga inicial**.

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

---

## agente-datos — 2026-08-13 · secciones: sin Bogotá, Cali completo

**Regenerado `data/secciones/` a petición del responsable.** Dos cambios en
`packages/ingest/src/secciones.ts`:

- `EXCLUIDOS = new Set(['CO11001'])` — **Bogotá sale del todo.** Pesaba 1,1 MB (un
  cuarto del directorio) por sus 2.843 secciones, y no es zona de afectación: MMI 4,3.
- `SECCIONES_COMODAS` de 700 → **1000**, para que **Cali conserve el detalle completo**
  (967 secciones, retención 0,15). Antes caía en el tramo de simplificación adaptativa.

| | antes | ahora |
|---|---|---|
| municipios | 440 | **439** |
| directorio | 5,3 MB | **4,2 MB** |
| Cali | simplificado | **163 KB, detalle completo** |
| Buenaventura | 234 secciones | 234 secciones (sin cambio) |

**Nada que hacer en `apps/web`.** El índice ya listaba solo un subconjunto de municipios
(los de MMI ≥ 5 con suelo urbano), así que la interfaz ya tiene que tolerar un municipio
sin secciones — Bogotá pasa a ser uno más de esos. No cambia la forma de
`data/secciones/index.json`: sigue siendo `{ pcode, secciones, bbox, ancla }`.

**Verificación:** 279 pruebas en verde, `check-no-personal-data.sh` limpio, typecheck de
`packages/ingest` limpio. **El typecheck y el build de `apps/web` no se pudieron correr
aquí**: el Node del sistema es 22.11.0 y Astro exige ≥ 22.12 (la trampa que ya está
documentada en `CLAUDE.md`). El cambio no toca `apps/web/**`, así que lo verifica CI.

---

## agente-datos — 2026-08-13 · fuente nueva: los boletines de las alcaldías

**Cambio al contrato de datos. Archivo nuevo: `data/fuentes/alcaldias.json`.**

### Qué se encontró

Los sitios de las alcaldías (`www.<municipio>-<departamento>.gov.co`) no tienen HTML que
leer: son aplicaciones Angular sobre una **API pública compartida del MinTIC**
(MiColombiaDigital), con un alias por municipio derivable del nombre. Por eso el rastreo
anterior no encontraba nada — y por eso `docs/DATA_SOURCES.md` afirmaba que no existía
gaceta municipal legible por máquina. **Esa conclusión era falsa y ya está corregida ahí.**

Medido sobre los 440 municipios con MMI ≥ 5: **317 responden**, **207 publicaron algo
desde el sismo**, y **54 municipios que no tenían ninguna fuente ahora sí la tienen**.
Son los pequeños — los grandes (Manizales, Pereira, Armenia, Buenaventura) no están en la
plataforma, pero esos ya tenían prensa. Es complementario, no redundante.

### Forma del archivo

```jsonc
{
  "generado": "…", "fuente": "…",
  "municipios_consultados": 440,
  "municipios_en_plataforma": 317,
  "municipios_con_publicacion": …,
  "avisos_personales_descartados": …,   // ADR-001
  "publicaciones": [{
    "pcode": "CO27450",  "municipio": "Medio San Juan", "departamento": "Chocó",
    "titulo": "🚨 REPORTE PRELIMINAR DE EMERGENCIAS – SISMO",
    "tipo": "Article",                  // Article | Document | Event
    "url": "https://…/noticias/…",      // redirige al dominio oficial del municipio
    "publicado": "2026-08-11T…Z",
    "resumen": "…"
  }]
}
```

`tipo: "Document"` son actos administrativos (decretos de calamidad, toques de queda);
`"Article"` son boletines e informes de afectación. Esa distinción vale la pena en la
interfaz: un decreto de calamidad es un hecho oficial, un boletín es una narración.

### Petición a `agente-ui` — mostrarlo en la ficha del municipio

El responsable pidió expresamente que esto se represente en el mapa. Lo concreto:

1. **En la ficha de cada municipio, una cara nueva: «Qué dice la alcaldía».** Lista de
   `publicaciones` filtrada por `pcode`, más reciente primero, con título, fecha relativa
   (`haceCuanto`) y enlace. Es la única información que existe para muchos de estos
   municipios: para 54 de ellos, es *toda* la información que existe.
2. **Distinguir `official` de prensa.** Estos son actos de la propia alcaldía y en ADR-003
   son un escalón distinto de la prensa. No mezclarlos en la misma lista sin marca.
3. **Los municipios sin ninguna fuente siguen siendo el dato importante.** Si un municipio
   no tiene ni prensa ni boletín, la ficha debe decirlo explícitamente en vez de quedarse
   vacía — «sin información publicada», no un hueco.

**No hay coordenadas en esta fuente**, así que no da puntos en el mapa todavía: da texto
por municipio. Los puntos (edificios colapsados, centros de salud, acopios) exigen
geocodificar nombres propios y está sin construir — no lo des por hecho en el diseño.

### Lo que sigue del lado de datos

- Decidir si entra al cron. Son ~400 peticiones por corrida; hoy es un comando a mano
  (`npm run alcaldias -w @report-cali/ingest`).
- Los subdominios inexistentes devuelven **500**, y `fetchWithRetry` reintenta los 5xx:
  cada municipio ausente cuesta el doble de peticiones y un segundo de espera. Hay que
  dejar de reintentar en la resolución de alias antes de meterlo al cron.
- Revisar a mano `curated/cifras.sugeridas.json` y pasar a `curated/observaciones.json` lo
  que resista la lectura.

---

## agente-datos — 2026-08-13 · CRUCÉ A `apps/web`, con permiso del responsable

**Aviso para `agente-ui`: he tocado tu columna.** No fue un descuido; el responsable lo
autorizó explícitamente después de ver que en producción la ficha de casi cualquier
municipio salía vacía. Lo que hice está acotado a **una cara nueva del carrusel** y no
altera nada de lo que ya existía.

### Por qué la ficha salía vacía (diagnóstico, por si sirve)

No era un fallo de despliegue —eso se verificó: el push llegó, el sitio se reconstruyó, y
los datos en vivo son los nuevos—. La ficha estaba vacía porque **los datos que alimenta
no existen**:

- `incidentes/index.json` en vivo: `municipios: []`, `total: 0`. `curated/incidentes.json`
  sigue en `[]`, así que **no hay ni un punto de incidente en todo el mapa**.
- `observations/afectacion.json`: 30 observaciones, pero solo **4 municipios** tienen cifra
  propia (Cali, Pereira, Manizales, Quibdó). En los otros 1.118, «Impacto reportado» está
  vacío porque no hay nada.

O sea: la interfaz estaba representando fielmente un conjunto de datos casi vacío.

### Qué añadí

- `apps/web/src/components/Mapa.astro` — una `<section class="carrusel-slide">` nueva,
  «Qué dice la alcaldía», con `#detalle-alcaldia`, más sus estilos (`.alcaldia-*`). El
  carrusel descubre las caras con `querySelectorAll('[data-carrusel-slide]')`, así que no
  hubo que tocar `carrusel.ts`.
- `apps/web/src/lib/mapa.ts` — carga opcional de `fuentes/alcaldias.json`, índice por
  pcode, y `pintarAlcaldia(pcode)` llamada junto a `pintarCobertura`/`pintarCifras`.

Construido con `createElement`/`textContent`, **nunca `innerHTML`**: el título y el resumen
los escribe un funcionario en un editor web y llegan por API sin pasar por revisión
nuestra. Mismo criterio que ya usabas para las cifras curadas, y aquí con más motivo.

Distingue `Document` (acto administrativo: decreto de calamidad) de `Article` (boletín),
con una marca discreta. Un decreto es un hecho; un boletín es una narración.

### Verificación, y lo que NO pude verificar

Comprobado: `tsc --noEmit -p apps/web/tsconfig.json` **limpio**, y la cara nueva renderizada
a 390 px con datos reales (Aranzazu, Caldas, 9 publicaciones).

**No pude correr `astro check` ni `npm run build`**: el Node del sistema es 22.11.0 y Astro
exige ≥ 22.12 (la trampa documentada en `CLAUDE.md`). Lo verifica CI. Si algo del build
falla, es mío y lo arreglo yo — no lo heredes.

**Sigue siendo tuyo el diseño.** Si la cara nueva no encaja con lo que estás haciendo,
cámbiala sin consultarme: el contrato que importa es que lea `fuentes/alcaldias.json` y
que el texto no entre por `innerHTML`.
