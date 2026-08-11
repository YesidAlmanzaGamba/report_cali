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

**Estado:** ⚠️ **por verificar antes de depender de esta fuente**

Desastre: [`eq-2026-000146-col`](https://reliefweb.int/disaster/eq-2026-000146-col)
· API: `https://api.reliefweb.int/v1/`

Durante la planeación, una petición genérica devolvió **HTTP 403**. La API exige un
parámetro `appname` y probablemente un `User-Agent` propio. **Hay que confirmar la llamada
exacta antes de construir el adaptador sobre ella** — no asumir que funciona.

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

**⚠️ Los IDs de dataset hay que resolverlos consultando el catálogo de Socrata, no
adivinarlos.** Durante la planeación un ID supuesto devolvió 404. El adaptador debe buscar
por nombre en el catálogo y registrar el ID que encontró.

**Licencia.** Datos abiertos del Estado colombiano (Ley 1712 de 2014).

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
