# Roadmap

Qué sigue, en qué orden y por qué. Cada fase termina en algo desplegable.

**Estado actual — fases 0 a 4 en producción** (2026-08-12). Mapa de intensidad por
municipio sobre los 1.122 municipios, dos modos de color, capa de deslizamientos, tabla y
resumen generados en compilación, panel de búsqueda de personas, recolector de prensa
—Google Noticias más seis diarios regionales y la gaceta del Valle—, registro de cobertura
por municipio, puntos de ayuda, exportación CSV/HXL e incidentes con rejilla de 100 m.
**279 pruebas**, CI en verde. Sitio en vivo en GitHub Pages.

> **Este archivo se quedó atrás y se corrigió el 2026-08-12.** Decía «fase 2 completa» y
> listaba como pendientes cosas que llevaban días entregadas — la exportación HXL, el
> espejo de Pages, el desacople a R2 — y decía que las decisiones de privacidad
> «quedarían como ADR-012» cuando ADR-012 ya estaba aceptado. Un roadmap que miente sobre
> el presente es peor que no tenerlo: manda a construir lo que ya existe.

### El techo que apareció al medir, y lo que cambia

El registro de cobertura (`data/fuentes/cobertura.json`) midió algo que no estaba en
ninguna fase: **de 228 municipios golpeados, 179 no tienen ni una nota de prensa** — 5,6
millones de personas. Cartago, con MMI 8 y 142.255 habitantes, tiene cero.

Se buscaron gacetas oficiales para taparlo y **no existen en forma legible por máquina**.
Ninguna mejora del raspado crea fuentes donde no las hay.

Por eso la fase 6 (evidencia fotográfica) **se adelantó en parte y se redujo**: entró la
recolección de campo por hoja de cálculo (`npm run campo`, `docs/CAMPO.md`) y ADR-013 para
que la radio local pueda ser fuente. Sin fotos publicadas, sin moderación y sin base de
datos — solo el punto, que es lo que hacía falta para que los municipios pequeños existan
en el mapa.

---

## Fase 3 — Cifras de afectación · **parcialmente entregada**

**Objetivo.** Que no solo se vea cuánto se sacudió cada municipio, sino qué se reporta:
fallecidos, heridos, albergues, viviendas afectadas.

### El supuesto que no se sostuvo

La fase asumía que las cifras vendrían automáticamente de UNGRD y ReliefWeb. Verificado
el 2026-08-11, **ninguna de las dos sirve hoy**:

- **UNGRD**: sus datos abiertos terminan el **31 de diciembre de 2024**. Publican con más
  de un año de rezago, así que no habrá cifras de este terremoto por esa vía en meses.
- **ReliefWeb**: la API v1 está **decomisionada** y la v2 exige un `appname` **aprobado
  por ellos**. Es un trámite humano, no un problema de código.

### Lo que se entregó

- ✅ **Adaptador UNGRD** con los IDs resueltos del catálogo y el DIVIPOLA rellenado a
  cinco dígitos. Hoy devuelve cero filas —correcto, no un fallo— y se llenará solo el día
  que publiquen 2026.
- ✅ **`curated/observaciones.json`**: vía humana para registrar cifras desde boletines,
  con las mismas garantías que el resto (fuente con enlace, hora de corte, mismo esquema,
  revisión por pull request). Es lo que permite tener cifras hoy.
- ✅ **Sección «Cifras reportadas»** con procedencia, tipo de fuente y antigüedad, que
  degrada visualmente lo viejo.

- ✅ **Exportación CSV / HXL.** Tres archivos en `data/export/`: observaciones, MMI por
  municipio y cobertura por municipio, todos con la segunda fila de etiquetas HXL de OCHA.
- ✅ **Cifras dentro de la ficha del municipio**, al tocarlo en el mapa, con su fuente y
  su antigüedad.

### Lo que falta

- ⬜ **Solicitar el `appname` a ReliefWeb** en
  <https://apidoc.reliefweb.int/parameters#appname> — trámite, no código.
- ⬜ **Pedir permiso a Diario Occidente y 90 Minutos**, los dos de Cali, que devuelven 403
  a nuestro User-Agent y 200 a un navegador. No se falsea el identificador (ver
  `DATA_SOURCES.md`); la salida es escribirles. Mismo tipo de trámite que el de ReliefWeb.
- ⬜ **Escribir a la Alcaldía de Cartago**: su feed existe pero sirve texto de relleno de
  2020 en vez de su sala de prensa. Es el municipio más golpeado sin cobertura, y
  arreglarlo cuesta un correo, no código.
- ⬜ **Exportación GeoJSON** de incidentes y puntos de ayuda como descarga directa.

---

## Fase 4 — Detalle por municipio (el submapa)

**Objetivo.** Tocar un municipio y entrar: acercarse a su territorio y ver los puntos
concretos —edificaciones colapsadas, albergues, infraestructura afectada— con su
intensidad y el reporte asociado.

### Cómo se arma

```
Vista nacional          →  tocar municipio  →  Vista de municipio
1.122 polígonos            (vuela al límite)    puntos de daño + reportes
222 KB, ya cargado                              data/damage/CO17001.geojson
                                                 se descarga solo al entrar
```

- **Un archivo por municipio**, `data/damage/{pcode}.geojson`, descargado únicamente al
  abrirlo. La vista nacional no engorda: quien nunca entra a un municipio no paga esos
  bytes.
- **Manifiesto** `data/damage/index.json` con los P-codes que tienen detalle, para que la
  interfaz sepa cuáles se pueden abrir y cuáles no.
- **Página propia por municipio**, `/municipio/co17001/`, generada en compilación. Esto
  importa más de lo que parece: da una **URL que se comparte por WhatsApp**, funciona sin
  JavaScript y aparece en buscadores cuando alguien busca «daños terremoto Manizales».
  Se pre-generan solo los municipios con intensidad ≥ VI, no los 1.122.
- **Estado en la URL** también en el mapa (`#/municipio/CO17001`), para que un coordinador
  mande el enlace exacto de lo que está mirando.

### De dónde salen los puntos de daño

| Fuente | Qué aporta | Cobertura |
|---|---|---|
| **Copernicus EMS EMSR916** | Gradación de daño por edificación, derivada de satélite. Autoritativa y ya pública. | Solo las áreas que activaron: Quibdó, Pereira, Manizales, Cali |
| **OpenStreetMap / HOT** | Huellas de edificaciones sobre las que anclar el daño | Creciendo con la activación de HOT |
| **UNGRD / alcaldías** | Conteos oficiales | Agregado por municipio, no por punto |
| **Reportes ciudadanos** | Lo que ve la gente en terreno | Fase 5, con moderación |

> **Restricción honesta que hay que diseñar de frente:** Copernicus solo cartografía las
> áreas que activó. Vamos a tener detalle a nivel de edificación para **unas pocas
> ciudades**, no para los 1.122 municipios. La interfaz tiene que distinguir con claridad
> **«no hay cartografía detallada aquí»** de **«aquí no hubo daño»**. Confundir esas dos
> cosas en un mapa de emergencia hace daño real.

### Dos decisiones que hay que tomar antes de construir esto

**1. Riesgo de saqueo.** Un mapa público que señala con precisión qué edificaciones
quedaron colapsadas o desocupadas es, visto de otra forma, una lista de objetivos. Es un
daño documentado en respuesta a desastres.

- Los productos de Copernicus **ya son públicos y oficiales**: republicarlos es
  defendible.
- Los **reportes ciudadanos sin verificar, no**. Propuesta: agregarlos a una rejilla de
  ~100 m hasta que alguien los verifique, y mostrar el punto exacto solo después.

**2. Datos de propiedad.** Un punto de daño en una vivienda dice algo de un hogar
concreto. Nunca se asocia información de sus ocupantes. Esto extiende ADR-001 del ámbito
de las personas al de sus viviendas.

Ambas quedarían como **ADR-012** antes de escribir código.

**Depende de:** verificar la licencia de los productos EMSR916 antes de redistribuirlos.

---

## Fase 5 — Albergues y necesidades

**Objetivo.** La pregunta más operativa de todas: *qué se necesita, dónde, ahora.*

Primer camino de escritura del proyecto, y con él la primera carga de moderación.

- Registro de albergues y centros de acopio, con lo que a cada uno le falta hoy.
- Datos sobre **lugares**, nunca sobre personas (ADR-001).
- Requiere antes: herramienta de moderación, control anti-spam, y alguien que modere.
- Infraestructura: Workers + D1. Es la primera vez que aparece una base de datos.

**Depende de:** que haya comunidad. Una función que necesita moderación humana sin gente
que modere es peor que no tenerla.

---

## Fase 6 — Evidencia fotográfica

Fotos geolocalizadas con procedencia y cola de verificación humana. Cargas directas con
geoetiqueta EXIF y fuentes de prensa; **nunca scraping de redes** (ADR-002).

**Depende de:** fase 5 en operación, porque reutiliza la misma moderación.

---

## Transversal, en cualquier momento

- ~~**Desacoplar los datos de la compilación** (R2)~~ — **decidido que no, por ahora
  (ADR-014).** El motivo que figuraba aquí era falso: «sin ello el cron agota la cuota de
  compilaciones» no aplica, porque compilamos en GitHub Actions y no en Cloudflare, así
  que la cuota de 500 compilaciones nunca entra en juego. Medido lo que R2 sí aportaría
  —unos 2–3 min de latencia sobre datos que el cron refresca cada 30— no compensa la
  tarjeta de crédito ni las cuatro piezas nuevas. ADR-014 lista las tres condiciones que
  lo reabren.
- ~~**Espejo en GitHub Pages** para redundancia~~ — **hecho.** En vivo y sirviendo como
  segundo origen.
- **Inglés** como segundo idioma, para socorristas internacionales y para HDX.
- **Publicar el conjunto de datos en HDX** y archivarlo en Zenodo con DOI.
- **Accesibilidad**: revisión con lector de pantalla; ya hay tabla, texto alternativo y
  grados en romanos para no depender del color.

---

## Lo que deliberadamente no vamos a hacer

- Un registro propio de personas desaparecidas (ADR-001).
- Scraping de redes sociales (ADR-002).
- Depender de un proveedor externo de teselas (ADR-010).
- Cambiar la escala de color del USGS por una más bonita (ADR-009).

## Pendiente — separar exposición modelada de afectación reportada

`packages/ingest/src/sources/deslizamientos.ts:111` publica la población expuesta a
deslizamiento del **modelo** del USGS bajo `metric: 'people_affected'`, a nivel `CO`, con
`observed_at` = hora de actualización del evento. Como esa hora se refresca en cada
corrida, esa observación gana siempre cualquier orden por recencia.

Consecuencia real, vista en producción: la tira de cifras del encabezado mostraba
**«4.400 personas afectadas»** cuando el balance vigente de la UNGRD decía **53.816**.
Una estimación de exposición y un conteo de damnificados no son la misma cantidad y no
deberían compartir métrica.

**Arreglo:** métrica propia (`people_exposed_landslide` o similar) en `METRICS`. Es un
cambio al contrato de datos: hay que actualizar `packages/ingest/src/freshness.ts` y
`apps/web/src/lib/metricas.ts` a la vez —están tipados como `Record<Metric, …>` justo
para que el compilador lo exija— y anunciarlo en `COORDINACION.md`.

**Mientras tanto:** `people_affected` está excluida de la tira del encabezado
(`apps/web/src/pages/index.astro`), con el motivo escrito ahí. Sigue apareciendo en el
módulo «Cifras», donde cada observación se muestra con su fuente y su nota, así que ahí no
engaña.
