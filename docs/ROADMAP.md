# Roadmap

Qué sigue, en qué orden y por qué. Cada fase termina en algo desplegable.

**Estado actual — fase 2 completa.** Mapa de intensidad por municipio, 1.122 municipios
cruzados contra el ShakeMap del USGS, tabla y resumen generados en compilación, panel de
búsqueda de personas enrutando a los canales oficiales. 77 pruebas, CI en verde.

---

## Fase 3 — Cifras oficiales por municipio

**Objetivo.** Que al abrir un municipio no solo se vea cuánto se sacudió, sino qué
reportan las autoridades: fallecidos, heridos, albergues abiertos, viviendas afectadas.

- Adaptador **UNGRD** vía Socrata. Los IDs de dataset hay que resolverlos consultando el
  catálogo, no adivinarlos (ver `DATA_SOURCES.md`).
- Adaptador **ReliefWeb** para los informes de situación. Requiere resolver el `appname`;
  una petición genérica devolvió 403.
- Panel de procedencia por cifra, con antigüedad y degradado visual cuando envejece.
- **Exportación CSV / GeoJSON / HXL.** Es lo que convierte el sitio en herramienta de
  trabajo: un coordinador se lleva la tabla a su propio análisis. HXL es el estándar de
  etiquetado humanitario y hace que los datos entren directo al ecosistema de OCHA.

**Depende de:** nada. Se puede empezar ya.

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

- **Desacoplar los datos de la compilación** (R2). Es lo primero de la lista de despliegue
  y sin ello el cron agota la cuota de compilaciones. Ver `DESPLIEGUE.md`.
- **Espejo en GitHub Pages** para redundancia.
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
