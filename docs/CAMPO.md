# Recolección en campo

Guía para personas. Cómo pasa lo que ves en la calle —o lo que oyes en la emisora— al mapa.

---

## Por qué esto existe

De los **228 municipios golpeados, 179 no tienen ni una sola nota de prensa**. Son 5,6
millones de personas. Cartago, con MMI 8 y 142.255 habitantes, tiene cero. Versalles, una.

No es que el robot busque mal: se probaron las gacetas oficiales y no existen en forma
legible por máquina — el portal de Cartago sirve texto de relleno de 2020, y de las nueve
gobernaciones de los departamentos golpeados solo el Valle publica un feed.

**Lo único que llega a un municipio de 7.000 habitantes es alguien parado ahí, o alguien
oyendo su emisora local.** Eso eres tú. Esta guía es el camino de eso al mapa.

---

## El recorrido, en una línea

**Tú capturas en una hoja de cálculo → un comando propone → tú revisas → tu commit publica.**

Nadie más en el medio, y nada llega al mapa sin que una persona lo haya leído.

---

## 1. La hoja

Cualquier hoja de cálculo sirve (Google Sheets, Excel, LibreOffice). Siete columnas, con
estos nombres exactos en la primera fila:

| Columna | Qué va | Ejemplo |
|---|---|---|
| `cuando` | Fecha y hora **local**, sin zona | `2026-08-12 15:20` |
| `donde` | Enlace de Google Maps **o** `latitud, longitud` | `4.5709, -76.1934` |
| `municipio` | El nombre, como se dice | `Versalles` |
| `que` | Uno de los seis tipos (abajo) | `edificacion_colapsada` |
| `descripcion` | Qué pasó, máx. 280 caracteres | `Vivienda de dos pisos colapsada` |
| `fuente` | Cómo se comprueba. Mín. 10 caracteres | `Radio Versalles, boletín de las 14:00` |
| `foto` | Enlace de Drive. **Puede ir vacío** | `https://drive.google.com/…` |

Los seis valores de `que`:

`edificacion_colapsada` · `edificacion_danada` · `via_bloqueada` · `albergue` ·
`centro_salud_afectado` · `centro_acopio`

### La columna `fuente` es la que más importa

No es burocracia: es lo único que hace comprobable el dato, y por eso el importador
rechaza cualquier cosa de menos de diez caracteres. Escribe algo que le permita a otra
persona verificarlo por su cuenta:

- `Radio Versalles 1250 AM, boletín de las 14:00 del 12 de agosto`
- `observación propia en el sitio, 12 de agosto`
- `Alcaldía de Cartago, rueda de prensa del 11 de agosto`

Lo que va antes de la primera coma se usa como etiqueta corta en el mapa
(«Radio Versalles»); el texto completo se guarda para quien quiera comprobarlo.

### La coordenada: dos formas, y una que no sirve

**Sirve** — abre Google Maps, toca el punto, «Compartir» → «Copiar vínculo», y pega:

```
https://www.google.com/maps/@4.5709,-76.1934,17z
https://maps.google.com/?q=4.5709,-76.1934
4.5709, -76.1934
```

**No sirve** — los enlaces cortos `maps.app.goo.gl/…`. El importador los rechaza a
propósito: resolverlos exige salir a internet y seguir una redirección, y una coordenada
mal resuelta manda un equipo al sitio equivocado. Ábrelo en el navegador y copia el
enlace largo de la barra de direcciones.

> **Si escribes la coordenada a mano, el orden es `latitud, longitud`** — el mismo que usa
> Google. Si los inviertes, el punto cae en el océano y el importador te avisa en vez de
> publicarlo.

> **Si escribes el CSV a mano** (no exportado de una hoja), pon el enlace entre comillas:
> lleva comas y sin comillas el archivo se parte mal. Una hoja de cálculo lo hace sola.

---

## 2. El comando

Exporta la hoja a CSV (`Archivo → Descargar → CSV`) y:

```bash
npm run campo -- ruta/al/archivo.csv
```

Escribe `curated/incidentes.sugeridos.json` y te dice qué salió y qué no:

```
2 sugerencias · 2 filas rechazadas

Filas que hay que arreglar en la hoja:
   fila 4: es un enlace corto de Google Maps y no se resuelve sin red…
   fila 5: el punto (-76.19, 4.57) cae fuera de Colombia…
```

Te da **el número de fila** para que la arregles en la hoja y vuelvas a exportar. Una fila
mala no tumba las demás.

Si un punto no cae dentro del municipio que escribiste, te avisa pero **no lo descarta**:

```
⚠ 1 con el punto fuera del municipio declarado
```

Manda lo que tú escribiste. Los límites del mapa están simplificados y mienten cerca de un
borde — ya pasó con la sede de la Cruz Roja de Caldas, que cae 549 m dentro del polígono
de Villamaría y está en Manizales. Tú estuviste ahí; el polígono no.

---

## 3. La revisión, que es tuya

Abre `curated/incidentes.sugeridos.json`, léelo, y **mueve a mano** las entradas buenas a
`curated/incidentes.json`.

Al moverlas, **quita dos campos** que son solo para ti y no van en el archivo curado:

- `foto` — el enlace de Drive
- `revisar` — el aviso de municipio

El archivo de sugerencias **no se versiona** (está en `.gitignore`). Es tu borrador. Lo que
se publica es lo que tú moviste, y ese commit es el acto de publicación.

---

## Qué pasa con tus fotos

**Se quedan en tu Drive. No se publican y no entran al repositorio.**

Al mapa solo llega el punto, el tipo de daño y tu descripción. El enlace de la foto vive
en el borrador para que tú puedas comprobarlo, y se queda ahí.

Es deliberado: una foto de daño casi siempre lleva personas identificables, y los archivos
de foto llevan dentro (EXIF) la coordenada exacta y el modelo del teléfono. Publicarlas
abriría los dos problemas de golpe. Si algún día se publican, será con revisión de cada
imagen — está previsto como fase 6 en el ROADMAP, no como algo que se hace de pasada.

---

## Y qué pasa con la coordenada exacta

**Se queda en `curated/`, que no se publica. Al mapa sale recortada a una rejilla de
~100 m.**

No es desconfianza: es ADR-012. Un mapa público que señala con precisión qué edificaciones
quedaron colapsadas o vacías es, visto de otra forma, una lista de objetivos para saqueo,
y recae sobre familias que ya lo perdieron casi todo. A un equipo de socorro le sirve igual
saber la manzana; a quien busca casas vacías, no.

El recorte ocurre en el pipeline, no en la interfaz, así que la coordenada precisa **nunca
sale del servidor**. Que sea imposible por construcción vale más que estar prohibido por
convención.

---

## Publicar

```bash
npm run ingest        # regenera data/ con lo nuevo
npm test              # 279 pruebas
bash scripts/check-no-personal-data.sh
git add curated/ data/ && git commit && git push
```

`npm run ingest` corre en cualquier portátil con Node 22.11 o más — **comprobado**. Solo
`npm run build` (el sitio) exige 22.12.

---

## Lo que oyes en la radio también cuenta

Un boletín de radio no tiene enlace, y hasta hoy el esquema lo rechazaba por eso. Ya no:
desde **ADR-013**, una fuente puede no tener URL si dice cómo comprobarla. Escribe en
`fuente` la emisora, el programa y la hora:

```
Radio Versalles 1250 AM, boletín de las 14:00 del 12 de agosto
```

Eso es procedencia comprobable —alguien puede llamar a la emisora— y en los municipios que
no tienen prensa es la única que existe. Entra marcada como **no verificada**, y la
interfaz la muestra con menos peso que una fuente oficial. Así debe ser.
