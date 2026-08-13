# Fuentes de datos

Toda fuente usada por el pipeline, con su licencia y atribución. Si agregas un adaptador,
agrega aquí su entrada en el mismo PR.

Evento de referencia: **USGS `us6000tjl2`** — M7.4, 2026-08-10 12:34:28 UTC,
epicentro `-76.2422, 4.8436`, profundidad 110.3 km, alerta **ROJA**.

---

## USGS — Servicio Geológico de Estados Unidos

**Estado:** verificado y en uso · sin API key

Endpoint del evento:

```
https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us6000tjl2&format=geojson
```

Productos que consumimos:

| Producto | Contenido | Uso |
|---|---|---|
| `shakemap` | `cont_mi.json` (curvas de MMI), `stationlist.json`, `shape.zip` | Coropleta de intensidad por municipio |
| `ground-failure` | Probabilidad de deslizamiento y licuefacción | Capa de riesgo de acceso vial |
| `losspager` | Estimación de damnificados y pérdidas | Contexto de magnitud del desastre |
| `dyfi` | «Did You Feel It» — reportes ciudadanos de percepción | Validación cruzada del MMI |
| `oaf` | Pronóstico de réplicas | Contexto |

Réplicas: mismo endpoint FDSN con `starttime` + bbox.

**Licencia.** Dominio público (obra del gobierno de EE. UU.). Atribución solicitada:
«U.S. Geological Survey».

---

## COD-AB Colombia — límites administrativos (HDX / OCHA)

**Estado:** verificado y en uso

<https://data.humdata.org/dataset/cod-ab-col>

Niveles 0 (país), 1 (departamentos) y 2 (**1.122 municipios**). Origen: DANE, normalizado
por ITOS con financiación de USAID. Última revisión: noviembre de 2024.

Los **P-codes** empatan con DIVIPOLA del DANE, así que sirven como llave de unión tanto
con datos nacionales como con el resto del ecosistema humanitario. Ver
[ADR-006](DECISIONS.md#adr-006--límites-municipales-desde-cod-ab-hdx-no-del-geoportal-del-dane).

**Licencia.** CC-BY-IGO 3.0. Atribución: «OCHA / DANE».

**Nota de formato y rendimiento.** HDX solo publica *shapefiles* (117 MB comprimidos), no
GeoJSON. Como los límites municipales no cambian durante un desastre, su procesamiento
**no va en el cron**: se ejecuta a mano con `npm run boundaries -w @report-cali/ingest`.

El pipeline simplifica preservando topología (`topojson-simplify`, Visvalingam, 4 % de los
puntos) y **cuantiza al final, no al principio** — ese orden importa: al revés, el archivo
queda 7× más grande. El resultado son 222 KB comprimidos para los 1.122 municipios.

Solo se versiona la versión simplificada en TopoJSON. La geometría a resolución completa
serían ~150 MB de GeoJSON: volvería el repositorio inclonable, y es reproducible desde HDX
con ese mismo comando.

---

## SGC — Servicio Geológico Colombiano (RSNC)

**Estado:** por integrar

- Catálogo de sismicidad: <https://bdrsnc.sgc.gov.co/paginas1/catalogo/index.php>
- Portal de datos abiertos: <https://datos.sgc.gov.co/>

La Red Sismológica Nacional de Colombia detecta réplicas pequeñas que el USGS no reporta.
Es la fuente autorizada a nivel nacional.

**Licencia.** Datos abiertos del Estado colombiano (Ley 1712 de 2014). Atribución:
«Servicio Geológico Colombiano».

---

## ReliefWeb (OCHA)

**Estado:** 🚧 **bloqueado — requiere un trámite humano**

Desastre: [`eq-2026-000146-col`](https://reliefweb.int/disaster/eq-2026-000146-col)

Verificado el 2026-08-11:

| Llamada | Respuesta |
|---|---|
| `api.reliefweb.int/v1/...` | **410 Gone** — «The API version 'v1' has been decommissioned. Please use version 'v2'» |
| `api.reliefweb.int/v2/...?appname=report-cali` | **403** — «You are not using an approved appname» |
| `api.reliefweb.int/` sin parámetros | **400** — «Missing appname parameter» |

La v2 **no acepta un `appname` cualquiera**: hay que solicitarlo a ReliefWeb en
<https://apidoc.reliefweb.int/parameters#appname>. Hasta que aprueben uno, no se puede
construir el adaptador. No es un problema de código.

**Licencia.** Contenido de ReliefWeb bajo sus términos de uso; los informes individuales
conservan la licencia de la organización que los publica.

---

## Copernicus EMS — activación EMSR916

**Estado:** por integrar

<https://mapping.emergency.copernicus.eu/news/earthquake-in-colombia-emsr916/>
Activada el 2026-08-10 a las 12:30 UTC.

Cartografía de delineación y **gradación de daño** por satélite para Quibdó, Pereira,
Manizales y Cali.

**⚠️ Verificar la licencia del producto específico antes de redistribuir.** Copernicus
suele ser abierto con atribución, pero las activaciones a demanda pueden tener condiciones
propias. Confirmar antes de publicar los polígonos en `data/`.

---

## UNGRD — Unidad Nacional para la Gestión del Riesgo de Desastres

**Estado:** por integrar

- Portal: <https://portal.gestiondelriesgo.gov.co/Paginas/Datos-abiertos.aspx>
- SNIGRD: <https://sni.gestiondelriesgo.gov.co/>
- Datos abiertos (Socrata): <https://www.datos.gov.co/>

Fuente oficial de conteos de afectación y del **RUNDA** (Registro Único Nacional de
Damnificados), abierto tras la declaratoria de desastre nacional.

**IDs resueltos** consultando el catálogo (no adivinados; un ID supuesto devolvió 404):

| Dataset | Cobertura | Campo DIVIPOLA |
|---|---|---|
| [`rgre-6ak4`](https://www.datos.gov.co/d/rgre-6ak4) | 2023-01-01 → 2024-12-31 · 16.036 filas | `codificaci_n_segun_divipola` |
| [`4t8v-ywmw`](https://www.datos.gov.co/d/4t8v-ywmw) | 2020 | `divipola` |
| [`4fd8-ptcr`](https://www.datos.gov.co/d/4fd8-ptcr) | 2019 | `divipola` |

Búsqueda del catálogo:
`https://api.us.socrata.com/api/catalog/v1?search_context=www.datos.gov.co&q=UNGRD`

> ### ⚠️ Los datos abiertos de la UNGRD llegan hasta 2024
>
> Verificado el 2026-08-11: el dataset más reciente termina el **31 de diciembre de
> 2024**. Los metadatos dicen «actualizado en mayo de 2026», pero eso es la fecha del
> registro, no de los datos: **publican con más de un año de rezago.**
>
> Es decir, **no habrá cifras oficiales de este terremoto por esta vía durante meses.**
> El adaptador queda construido y consultando, para que el día que publiquen 2026 el mapa
> se llene solo. Mientras tanto las cifras entran por
> [`curated/observaciones.json`](../curated/observaciones.json).

**Columnas que usamos.** `fallecidos`, `heridos`, `desaparecidos`, `personas`,
`viviendas_destruidas`, `viviendas_averiadas`, `centros_de_salud`, `vias_averiadas`.
Se omiten a propósito las decenas de columnas de ayuda entregada (kits, colchonetas,
valores): el mapa responde «qué pasó y dónde», no «cuánto se gastó».

**Cuidado con el DIVIPOLA.** Aparece con y sin cero inicial —`5656` y `05656` son el
mismo municipio— así que hay que rellenar a cinco dígitos. Sin eso, los departamentos
cuyo código empieza por cero no cruzan con la geometría.

**Licencia.** Datos abiertos del Estado colombiano (Ley 1712 de 2014).

---

## Prensa regional — feeds propios de los diarios de la zona

**Módulo:** `packages/ingest/src/sources/prensa-regional.ts` · **Verificado:** 2026-08-12

**Por qué existe.** El recolector original consulta el RSS de Google Noticias, que agrega.
Agregar sirve para enterarse de que hubo un terremoto y no sirve para saber qué pasó en
Roldanillo. Medido sobre la recolección en producción: **704 notas y solo 177 (25 %) con
municipio reconocible**, con Infobae de medio más frecuente y con El Universo (Ecuador),
DW, France 24 y el Hoy Diario del Magdalena —a 900 km— entre los repetidos.

La cobertura nacional habla del país; la regional habla de los municipios. «Restringen el
ingreso al campus de la UTP» solo lo publica un diario de Pereira, y es exactamente el
grano que este mapa necesita.

### Feeds activos

Se probaron uno a uno pidiendo el feed y comprobando que devolviera `<item>` con `pubDate`.

| Medio | Departamentos | Feed |
|---|---|---|
| El País (Cali) | Valle del Cauca, Cauca | `elpais.com.co/arc/outboundfeeds/rss/` |
| El Diario (Pereira) | Risaralda | `eldiario.com.co/feed/` |
| Chocó 7 Días | Chocó | `choco7dias.com/feed/` |
| Proclama del Cauca | Cauca, Valle del Cauca | `proclamadelcauca.com/feed/` |
| El Nuevo Día (Ibagué) | Tolima | `elnuevodia.com.co/nuevodia/rss.xml` |
| El Tiempo | nacional | `eltiempo.com/rss/colombia.xml` |

Cubren los departamentos con más municipios sobre el umbral de daño: Valle del Cauca (42),
Tolima (41), Chocó (25), Risaralda (14) y Cauca (9).

### Gacetas oficiales — se buscaron para Cartago, y este es el resultado

**Encontrada una, y sirve:** `valledelcauca.gov.co/rss` — 100 entradas, 34 sobre el sismo,
al día. Va marcada `official`, que en toda la aplicación es un escalón distinto de la
prensa (ADR-003): son los boletines de quien coordina la respuesta.

**Para Cartago no hay ninguna, y el motivo es peor que «no tienen».** Cartago sí expone un
feed —`cartago.gov.co/rss` devuelve 200— pero sus diez entradas son dos páginas
institucionales de febrero y **ocho textos de relleno «lorem ipsum» de 2020**:
«How to make lorem ipsum dolor sit glavrida». Nunca conectaron el feed a su sala de
prensa. El municipio ha publicado sobre la emergencia; su canal automático no lo cuenta.

**El patrón `/rss` no se generaliza.** Se probó en trece municipios golpeados: solo
respondieron Cartago (relleno) y Manizales (real, pero su última entrada es de julio,
anterior al sismo). El resto da 404, 403 o ni resuelve el dominio. La variante
`<municipio>-<departamento>.gov.co` responde 200 pero sirve HTML, no RSS.

**Ninguna otra gobernación tiene feed.** Se probaron las nueve de los departamentos
golpeados en `/rss`, `/publicaciones/rss` y `/feed`: Tolima da 403; Chocó y Cundinamarca
responden con cero entradas; Risaralda, Caldas, Quindío, Cauca y Antioquia dan 404.

**Conclusión para el mapa:** ~~no existe una gaceta municipal legible por máquina~~ —
**esto resultó falso y está corregido abajo.** Sí existe; estaba buscándose mal. Lo que
sigue siendo cierto de este apartado: el patrón `/rss` no se generaliza, la gaceta de
Cartago sirve relleno, y ninguna gobernación salvo el Valle publica feed.

## Alcaldías — MiColombiaDigital, la API que sí existía

**Corrige la conclusión de arriba.** Se buscaba HTML y RSS en los sitios municipales, y no
hay ni lo uno ni lo otro: `www.<municipio>-<departamento>.gov.co` devuelve a `curl` una
cáscara de 2.905 bytes titulada «Territoriales», idéntica en todos ellos. **Son
aplicaciones Angular.** El contenido nunca estuvo en el HTML.

Mirando qué pide el navegador aparece la fuente real: todos cuelgan de una plataforma
compartida del MinTIC con **API REST pública por municipio**.

```
https://<alias>.micolombiadigital.gov.co/api/v1/contents?orderBy=recent&pageSize=25
https://<alias>.micolombiadigital.gov.co/api/v1/contents/<contentID>   ← cuerpo completo
```

El `alias` se deriva del nombre: `Roldanillo` + `Valle del Cauca` → `roldanillovalledelcauca`.
La URL `https://<alias>.micolombiadigital.gov.co/noticias/<slug>` **redirige al dominio
oficial del municipio** —comprobado en el navegador, con la nota renderizada—, así que es
citable y además derivable, que el dominio propio no lo es.

### Lo que rinde, medido sobre los 440 municipios con MMI ≥ 5

| | |
|---|---|
| responden en la plataforma | **317** |
| publicaron algo desde el sismo | **207** |
| publicaciones recogidas | **1.127** |
| hablan del sismo | 203, en **98 municipios** |
| **municipios que no tenían ninguna fuente y ahora sí** | **54** |

**La distribución es complementaria a la prensa, no redundante.** Las que fallan son las
ciudades grandes —Manizales, Pereira, Armenia, Buenaventura, Quibdó, Cartago— que tienen
sitio propio *y* cobertura de prensa. Las que responden son los municipios pequeños, que
es exactamente donde no llegaba nadie. Ataca el hueco que medía `cobertura.json`.

Y no es relleno institucional. Medio San Juan (Chocó, MMI 7) publicó un EDAN completo:
«78 familias damnificadas, 390 personas damnificadas, 3 viviendas totalmente destruidas,
15 viviendas parcialmente destruidas e inhabitables, afectaciones en la farmacia del
Hospital y en la Casa de Víctimas». Lloró, 140 viviendas. Bagadó, 240 familias. Istmina
publicó sus cuatro líneas de emergencia. Son municipios a un paso del epicentro sobre los
que no había absolutamente nada.

### La trampa seria: ADR-001

Entre las 1.127 publicaciones hay **55 avisos administrativos con nombre propio** —«Aviso
de Publicación de Edicto - Pedro Chala Calderón», «NOTIFICACION POR AVISO COBRO
PERSUASIVO»—. Son notificaciones a personas concretas por multas y cobros: nada que ver
con el sismo, y datos personales de ciudadanos identificables. `esAvisoPersonal()` los
descarta **antes que cualquier otro filtro**, y vuelve a comprobarlo sobre el cuerpo, que
a veces trae el nombre que el titular no traía.

### Lo que no hace

**No publica cifras**, por el mismo motivo que `prensa-regional.ts`: sacar números de prosa
con patrones confunde totales con parciales. Las propone en `curated/cifras.sugeridas.json`
(sin versionar) para que una persona las registre a mano. Y **no extrae fallecidos ni
heridos en ningún caso**: esas dos solo entran desde boletín oficial, leídas por una
persona.

**Tampoco da coordenadas.** Los textos nombran lugares —«Puente Mariano Ospina», «farmacia
del Hospital», corregimientos como Suruco o Paimadó— pero ninguno trae coordenada. Pasar
de ahí a un punto en el mapa exige geocodificar por nombre exacto con las revisiones de
`geocodificar.ts`, y para los que no aparezcan, no hay coordenada. Eso está sin construir.

### Dos trampas del feed oficial, medidas

**La fecha no lleva zona horaria.** El CMS de gov.co manda `2026-08-12 09:40:28`, y
`Date.parse` lo interpreta como hora local del proceso — UTC en el runner de CI. Las notas
quedaban **cinco horas más viejas de lo que son**: suficiente para que una recién publicada
caiga del lado equivocado del filtro por fecha del sismo. Colombia es UTC-5 todo el año y
sin horario de verano, así que `fechaDe()` se lo añade.

**«Toro» es la gobernadora, no el municipio.** En el feed de la Gobernación, «Toro»
aparece en **21 de 100 entradas**, y en las 21 es el apellido de **Dilian Francisca Toro**.
Solo hacía daño en el paso relajado a cuatro letras — con el mínimo de cinco ni se
compara—, así que los nombres cortos que además son apellido corriente quedan fuera de la
atribución automática (`CHOCAN_CON_APELLIDOS`). Se pierde la cobertura real de Toro
(Valle) y se acepta: etiquetar mal es peor que no etiquetar.

### Probados y sin feed utilizable

No hace falta volver a intentarlo a ciegas:

- **La Patria (Manizales)** — `rss.xml` responde, pero es el feed de *clasificados*: la
  primera entrada era «VENTA LOTES» de abril. No expone uno de noticias.
- **La Crónica del Quindío**, **El Quindiano**, **El Colombiano** — `/feed`, `/rss` y
  `/rss.xml` devuelven HTML. Quindío (12 municipios) y Antioquia (29) siguen dependiendo
  de Google Noticias, donde ambos medios aparecen con frecuencia.
- **UNGRD** (`portal.gestiondelriesgo.gov.co`) devuelve 403 al RSS; el **SGC** sirve una
  página sin `<item>`. Lo oficial entra por las consultas `.gov.co` de Google Noticias.
- Ninguno expone feeds por sección (`/category/<municipio>/feed`), así que no se puede
  pedir «solo Pereira»: se filtra después de traer.

### Dos medios que nos bloquean, y por qué no los saltamos

**Diario Occidente** y **90 Minutos** (los dos de Cali) devuelven **403 a nuestro
User-Agent** y 200 a `Mozilla/5.0` o a una petición sin identificar. Su WAF no rechaza el
tráfico automático: rechaza al que se identifica como tal.

Hacerse pasar por un navegador los saltaría. **No se hace.** `http.ts` se compromete a
identificarse justo para que quien opera un servidor bajo carga pueda pedirnos que
bajemos el ritmo o llamarnos; falsear el identificador convierte esa promesa en decorado.
Están fuera de la lista activa —pedirles un 403 seguro cada 30 minutos tampoco tiene
sentido— y anotados en `MEDIOS_QUE_NOS_BLOQUEAN`.

**La salida no es técnica: es escribirle al medio y pedir permiso**, el mismo trámite
pendiente con el `appname` de ReliefWeb. Mientras tanto Cali queda cubierta por El País,
que es el medio con más notas de toda la recolección.

### Cómo atribuye municipio

De la señal más limpia a la más sucia, y se queda con la primera que acierta:

1. **La ruta de la URL.** `…/noticias/risaralda/pereira/…` es la sección del propio
   diario: ya clasificó la nota.
2. **El titular.**
3. **El resumen, y solo para municipios del departamento que el medio cubre.**

Ese último límite salió de un error real: «El doble drama de **Sipí, Chocó**» quedó
etiquetada como **Murillo (Tolima)** porque el resumen decía «el alcalde Jairo Antonio
**Murillo**». Un resumen es prosa llena de apellidos, y los apellidos van en mayúscula
igual que los municipios, así que la defensa de la mayúscula inicial no sirve ahí. Acotar
al departamento del medio la reemplaza por una garantía editorial. Hay una prueba de
regresión con ese titular exacto.

En cada paso se prueba primero contra los municipios del propio departamento con la
longitud mínima relajada a cuatro letras: es lo que hace visibles a **Tadó** y **Sipí**,
de los más golpeados del Chocó, que la regla general de cinco letras descartaba siempre.

**Se recogen enlaces, no cifras** — igual que el recolector de Google Noticias, y por el
mismo motivo (ADR-003 y la nota de cabecera de `noticias.ts`).

---

## Mapa base

**OpenFreeMap** o **Protomaps** — teselas vectoriales sin token ni API key.
Datos de OpenStreetMap, © colaboradores de OpenStreetMap, ODbL.

Descartamos Mapbox: exige token, tiene cupo y ata el proyecto a una cuenta personal.

---

## Fuentes descartadas a propósito

| Fuente | Por qué no |
|---|---|
| Instagram, X, Facebook, TikTok | Prohibido por [ADR-002](DECISIONS.md#adr-002--nada-de-scraping-de-redes-sociales) |
| Listas de desaparecidos en medios | Datos personales — [ADR-001](DECISIONS.md#adr-001--no-almacenamos-datos-personales-de-desaparecidos-ni-fallecidos) |
| colombiatebusca.com (scraping) | Se **enlaza**, no se copia. Datos personales |
