# Decisiones de arquitectura

Registro de las decisiones que dan forma al proyecto, con el porqué. El objetivo es que
quien llegue nuevo no tenga que volver a discutir lo ya discutido — sobre todo las cuatro
reglas duras.

---

## ADR-001 — No almacenamos datos personales de desaparecidos ni fallecidos

**Estado:** aceptada, permanente · 2026-08-11

**Contexto.** Al día siguiente del sismo ya había más de 3.500 personas reportadas como
desaparecidas y cuatro canales recogiendo esos reportes: Cruz Roja Colombiana (RCF, el
canal con mandato del CICR), la línea 123, el RUNDA de la UNGRD y la plataforma ciudadana
colombiatebusca.com. Varios medios publicaron además listas y fotos.

**Decisión.** Este proyecto **no recibe, no almacena y no publica** datos personales de
personas desaparecidas o fallecidas. Publicamos conteos agregados por municipio. En la
interfaz, un panel visible enruta a las familias a los canales oficiales.

**Por qué.**

- **Legal.** La Ley 1581 de 2012 (habeas data) clasifica estos datos como sensibles. La
  identidad de una persona fallecida no puede publicarse antes de la identificación por
  Medicina Legal y la notificación a la familia. Publicarla causa un daño irreversible.
- **Operativo.** Un quinto registro fragmenta la búsqueda. Una familia que reporta aquí
  cree que reportó, y el dato no llega a quien busca en terreno.
- **Seguridad.** Los listados de desaparecidos son un blanco conocido de estafas del tipo
  «encontramos a su familiar, envíe dinero». Un sitio nuevo, sin equipo de moderación, es
  el vector ideal.

**Consecuencias.** Perdemos la función que más gente pediría. La aceptamos: el valor que
agregamos está en el cruce geográfico, no en recolectar de nuevo lo ya recolectado.

---

## ADR-002 — Nada de scraping de redes sociales

**Estado:** aceptada · 2026-08-11

**Contexto.** La petición original incluía hacer scraping de imágenes de afectación desde
la web para geolocalizarlas.

**Decisión.** No hacemos scraping de Instagram, X, Facebook ni TikTok. La capa de evidencia
(fase 6) usará RSS y sitemaps de medios, cuentas oficiales, y cargas directas con
geoetiqueta EXIF — todo marcado como **no verificado** hasta que una persona lo revise.

**Por qué.** Viola los términos de servicio de las plataformas y expone legalmente al
proyecto. Pero la razón de fondo es otra: la recirculación de fotos de desastres
anteriores es el modo de falla número uno de los mapas de crisis. Una foto sin procedencia
no es información, es ruido con apariencia de información.

---

## ADR-003 — Toda cifra lleva fuente y hora (el envelope `Observation`)

**Estado:** aceptada · 2026-08-11

**Contexto.** En las primeras 24 horas las cifras de fallecidos circularon como 169, 224 y
234 según la fuente y el momento. Ninguna era mentira; eran cortes distintos.

**Decisión.** Ningún número se guarda pelado. Todo dato es una `Observation` con `source`,
`observed_at` (cuándo la fuente dice que era cierto) e `ingested_at` (cuándo lo trajimos).
La interfaz muestra siempre fuente y antigüedad, y **degrada visualmente** lo que supere
el umbral de obsolescencia en vez de seguir presentándolo como fresco.

**Por qué.** Es lo único que separa este proyecto de cualquier otro sitio de crisis. Una
cifra sin procedencia no es verificable, y en una emergencia lo no verificable termina
siendo desinformación aunque haya nacido con buena intención.

**Consecuencias.** Más trabajo por adaptador y una interfaz más cargada. Vale la pena.

---

## ADR-004 — Estático primero, sin base de datos en la ruta de lectura

**Estado:** aceptada · 2026-08-11

**Decisión.** La ruta de lectura son archivos estáticos servidos por CDN. Una GitHub
Action corre cada 15 minutos, ejecuta los adaptadores y hace commit de `data/` solo si
cambió el contenido.

**Por qué.** Un sitio de desastre recibe su pico de tráfico exactamente cuando más
importa; una base de datos en la ruta de lectura es el punto único de falla más caro
posible. Además el costo tiende a cero, lo que importa en un proyecto voluntario sin
presupuesto.

**Efecto secundario deseado.** Versionar datos generados es contraintuitivo, pero aquí
cada revisión de cada cifra queda como un `git diff`. La auditoría de procedencia sale gratis.

---

## ADR-005 — Coloreamos por MMI, no por magnitud

**Estado:** aceptada · 2026-08-11

**Decisión.** El mapa colorea los municipios por **intensidad Mercalli Modificada (MMI)**
tomada del ShakeMap del USGS, no por la magnitud del evento.

**Por qué.** La magnitud es **un solo número para todo el sismo**: 7.4 en Quibdó y 7.4 en
Bogotá. No dice nada sobre un municipio en particular. El MMI es lo que cada lugar
realmente sintió, y es lo que convierte el mapa en información operativa en vez de
decoración.

---

## ADR-006 — Límites municipales desde COD-AB (HDX), no del geoportal del DANE

**Estado:** aceptada · 2026-08-11

**Decisión.** Usamos el COD-AB de Colombia publicado en HDX (`cod-ab-col`), no una
descarga directa del geoportal del DANE.

**Por qué.** El COD-AB es el dato del DANE ya normalizado con **P-codes**, que es el
identificador que usa todo el ecosistema humanitario (OCHA, ReliefWeb, HDX, HOT). Los
P-codes empatan con DIVIPOLA, así que no perdemos compatibilidad nacional y sí ganamos que
nuestros datos crucen directo con los de cualquier otro actor de la respuesta. 1.122
municipios, revisado en noviembre de 2024.

---

## ADR-007 — Licencia MIT, no AGPL

**Estado:** aceptada · 2026-08-11

**Decisión.** Código bajo MIT. Datos bajo CC-BY-4.0.

**Por qué.** La AGPL protegería mejor contra forks cerrados, pero espanta justo a quienes
queremos que adopten esto: ONG, alcaldías y entidades públicas que no pueden incorporar
código copyleft sin revisión legal, y en una emergencia esa revisión no ocurre a tiempo.
En contexto humanitario **la adopción vale más que la protección**.

---

## ADR-009 — Usamos la paleta del ShakeMap del USGS, no una rampa de un solo tono

**Estado:** aceptada · 2026-08-11

**Contexto.** La buena práctica de visualización dice que una escala secuencial debe ser
**un solo tono de claro a oscuro**, nunca un arcoíris. La escala MMI del USGS es
justamente eso que se desaconseja: blanco → azul → verde → amarillo → naranja → rojo.

**Decisión.** Usamos la escala del USGS tal cual.

**Por qué.** Nuestro usuario primario son socorristas, Cruz Roja, Defensa Civil y
alcaldías. Esa gente lee esta escala todos los días en los productos oficiales del USGS y
del SGC. Una rampa más elegante pero distinta rompería la comparación visual justo cuando
alguien necesita cruzar nuestro mapa con el ShakeMap oficial. **La convención del dominio
le gana a la regla general.**

**Cómo respetamos el principio de fondo.** La razón por la que se desaconseja el arcoíris
es que el color solo no basta para identificar. Eso sí lo cumplimos: el grado en números
romanos aparece en la leyenda, en la ficha de cada municipio y en la tabla. Quien no
distinga los colores sigue leyendo la información completa.

**Consecuencia.** No cambiar estos colores por gusto estético. Si alguien propone una
paleta «mejor», este ADR es la respuesta.

---

## ADR-010 — Sin mapa base de terceros

**Estado:** aceptada · 2026-08-11

**Decisión.** El mapa no carga teselas de ningún proveedor externo. Los polígonos
municipales propios son el mapa.

**Por qué.**

- **Disponibilidad.** Un proveedor de teselas es una dependencia de terceros en la ruta
  crítica justo cuando el sitio más importa. Si se cae o limita el tráfico en el pico de
  la emergencia, nos quedamos sin mapa.
- **Peso.** Descargar teselas sobre un 3G malo es exactamente lo que no queremos.
- **Suficiencia.** La pregunta que responde el mapa —qué municipios recibieron el
  sacudimiento más fuerte— se contesta con los polígonos y sus nombres.

**Consecuencia.** No hay calles ni relieve de referencia. Si en el futuro hacen falta
(por ejemplo para la capa de albergues), la opción es teselas autoalojadas, no un
servicio externo.

---

## ADR-011 — Node ≥ 22.12 y sin framework de pruebas

**Estado:** aceptada · 2026-08-11

**Decisión.** Las pruebas usan el corredor incorporado de Node (`node:test`), no Vitest ni
Jest. El proyecto exige Node ≥ 22.12.

**Por qué.** Vitest 4 arrastra `rolldown`, con binarios nativos que fallan al instalarse en
ciertas versiones de Node y sistemas; Vitest 3 tenía una vulnerabilidad crítica sin
parche. Cambiar a `node:test` eliminó un árbol de dependencias completo: pasamos de 325 a
30 paquetes en el paquete de ingesta, con 0 vulnerabilidades y sin binarios nativos.

Para un proyecto que quiere colaboradores ocasionales, «clonar y que las pruebas corran»
vale más que la comodidad de un corredor con más funciones. El mínimo de Node 22.12 lo
impone Astro, no nosotros.

---

## ADR-012 — Los reportes ciudadanos de daño se agregan a 100 m

**Estado:** aceptada · 2026-08-11

**Contexto.** La fase 4 muestra puntos de daño por edificación. Hay dos orígenes posibles
y no merecen el mismo trato.

**Decisión.**

- **Productos oficiales de Copernicus EMS (EMSR916): se publican en su ubicación exacta.**
  Ya son públicos y oficiales; republicarlos no agrega exposición.
- **Reportes ciudadanos sin verificar: se agregan a una rejilla de ~100 m.** La ubicación
  exacta solo se muestra después de que una persona verifique el caso.

**Por qué.** Un mapa público que señala con precisión qué edificaciones quedaron
colapsadas o desocupadas es, visto de otra forma, una lista de objetivos para saqueo. Es
un daño documentado en respuesta a desastres, y recae sobre familias que ya lo perdieron
casi todo.

**El contraargumento, y por qué no lo seguimos.** Es cierto que buena parte de esas
ubicaciones ya circulan por redes sociales, y que la comunidad local las conoce. Pero
«ya está en internet» justifica muchas cosas que terminan mal: una cosa es que la
información esté dispersa en publicaciones sueltas y otra es publicarla **consolidada,
geoindexada y descargable**, que es precisamente lo que hace útil a este proyecto — y
también lo que lo haría útil para alguien que busque qué casa está vacía. Agregar a 100 m
conserva todo el valor operativo (a un equipo de socorro le sirve igual saber la manzana)
y elimina casi toda la exposición. El costo de equivocarse en un sentido es un mapa un
poco menos preciso; en el otro, es un robo a una familia damnificada.

**Consecuencias.** La rejilla de 100 m se aplica en el pipeline, no en la interfaz: el
dato preciso sin verificar **nunca sale del servidor**. Un error de front-end no puede
filtrarlo.

**Extiende ADR-001** del ámbito de las personas al de sus viviendas: un punto de daño
nunca lleva asociada información de sus ocupantes.

---

## ADR-008 — La fase 1 es solo lectura; escritura y moderación después

**Estado:** aceptada · 2026-08-11

**Decisión.** El registro de albergues y necesidades (fase 5) y la capa de evidencia
fotográfica (fase 6) van en specs aparte y después del mapa.

**Por qué.** Ambas abren una ruta de escritura, y con ella carga de moderación y
superficie de abuso que un agregador de solo lectura no tiene. Publicar primero algo
confiable y verificable es lo que le gana al proyecto los colaboradores que después
sostienen la moderación. Al revés no funciona.
