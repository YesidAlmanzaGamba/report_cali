# CLAUDE.md — contexto del repositorio

Índice del proyecto para cualquier agente que trabaje aquí. **Léelo antes de tocar nada.**

---

## Qué es esto

Mapa abierto de la afectación del terremoto de **magnitud 7.4 del 10 de agosto de 2026**
en Colombia (epicentro: San José del Palmar, Chocó; USGS `us6000tjl2`; alerta roja).

**Usuario primario: socorristas y organizaciones locales en un celular con mala
conexión.** Bomberos, Defensa Civil, voluntarios de Cruz Roja, alcaldías. Cada decisión
técnica se juzga contra ese escenario.

Sitio en vivo: <https://yesidalmanzagamba.github.io/report_cali/>

---

## Las cuatro reglas que no se negocian

Están razonadas en [`docs/DECISIONS.md`](docs/DECISIONS.md). Un cambio que rompa
cualquiera de ellas se revierte, por bueno que sea el código.

1. **Nunca datos personales** de personas desaparecidas o fallecidas (ADR-001).
   Solo conteos agregados por municipio. Hay una barrera automática en CI:
   `scripts/check-no-personal-data.sh`.
2. **Nada de scraping de redes sociales** (ADR-002).
3. **Toda cifra lleva fuente y hora** (ADR-003). Un `number` suelto no pasa revisión.
4. **Para personas: agregamos y enlazamos. Recolectamos directo solo sobre lugares**
   (ADR-001).

Otras decisiones que conviene no relitigar: la paleta de intensidad es la estándar del
USGS y no se cambia por gusto (ADR-009); no dependemos de un proveedor externo de teselas
(ADR-010); los reportes ciudadanos de daño se agregan a 100 m (ADR-012).

---

## Mapa del repositorio

```
packages/ingest/          Tubería de datos (Node + TypeScript)
  src/schema.ts           El envelope `Observation` — el primitivo central
  src/persist.ts          Escritura estable: solo escribe si el contenido cambió
  src/freshness.ts        Obsolescencia por métrica
  src/curated.ts          Cifras registradas a mano desde boletines
  src/ayuda.ts            Centros de acopio y albergues (ubicación EXACTA, al revés que incidentes)
  src/geocodificar.ts     Las revisiones que hacen publicable una coordenada automática
  src/sources/osm.ts      Nominatim, con caché en disco
  src/export.ts           CSV con etiquetas HXL
  src/join/mmi.ts         Cruce intensidad × municipios
  src/sources/            usgs, codab, ungrd, noticias
  src/runner.ts           Lo que corre el cron
  src/boundaries.ts       Límites municipales (a mano, NO en el cron)
  test/                   Pruebas contra fixtures grabados, sin red

apps/web/                 Sitio estático (Astro, CSS propio, sin framework de UI)
  src/layouts/Base.astro  Cáscara del documento; agrega la clase `js`
  src/components/         Encabezado, Mapa, Hoja, Cifras, TablaMunicipios…
  src/lib/                mapa.ts, hoja.ts, cargar-mapa.ts, mmi.ts, metricas.ts
  src/styles/             tokens.css, base.css
  src/pages/index.astro   Carga los datos y compone

data/                     GENERADO y versionado. El historial de git ES la trazabilidad
curated/observaciones.json  Cifras a mano. Lo escriben personas; el robot no lo toca
docs/                     DECISIONS.md, DATA_SOURCES.md, DESPLIEGUE.md, ROADMAP.md, TUTORIAL.md
scripts/                  check-no-personal-data.sh, upload-r2.sh
```

---

## Cómo funciona, en corto

**Ingesta.** Cada 30 minutos, GitHub Actions ejecuta `runner.ts`: consulta USGS
(evento, malla de intensidad, réplicas), cruza el MMI contra los 1.122 municipios,
carga las cifras curadas, recoge notas de prensa y genera los CSV. Escribe en `data/`
**solo si el contenido cambió** — el hash ignora las marcas de tiempo, si no el cron
haría ~96 commits diarios de ruido.

**Publicación.** El sitio es estático. Se compila en GitHub Actions y se publica en
GitHub Pages (activo) y Cloudflare Workers (pendiente de credenciales). Los datos se
piden por `fetch` en tiempo de ejecución, no se empaquetan en el JavaScript.

**Rendimiento.** Carga inicial ~11 KB comprimidos. La tabla y las cifras se generan en
compilación, así que **la página sirve aunque el JavaScript no cargue nunca**. El mapa
(~282 KB) se difiere hasta que se necesita. Si rompes esto, rompiste el proyecto.

---

## Coordinación entre agentes

Trabajamos dos agentes en paralelo. Los roles están separados por **archivos**, no por
tareas, para que nadie pise a nadie.

| | **agente-datos** (coordinador) | **agente-ui** |
|---|---|---|
| Se ocupa de | Fuentes, ingesta, modelo de datos, exportación | Interfaz, diseño, experiencia de uso |
| Es dueño de | `packages/ingest/**`, `data/**`, `curated/**`, `scripts/**`, `.github/**`, `docs/**`, configuración raíz | `apps/web/**` |
| Ramas | `datos/*` | `ui/*` |
| Empuja a `main` | **Sí, es el único** | **No, nunca** |

### Reglas de convivencia

1. **Escribe siempre en [`docs/COORDINACION.md`](docs/COORDINACION.md).** Es la regla que
   sostiene a las demás. Anota ahí al empezar una rama, al dejarla lista para revisión, al
   fusionarla y al descartarla; también las peticiones al otro agente y cualquier cambio
   al contrato de datos.

   No es burocracia: los dos agentes trabajan sin ver la conversación del otro, así que
   **lo que no esté escrito ahí, para el otro no existe**. Una rama que nadie anunció es
   una rama que nadie va a fusionar.

2. **Solo `agente-datos` hace push a `main`.** `agente-ui` trabaja en ramas `ui/*` y lo
   anota en el tablero; `agente-datos` las trae, verifica y fusiona.

3. **Nadie edita archivos fuera de su columna.** Si necesitas un cambio del otro lado,
   pídelo en el tablero en vez de hacerlo tú.

   *Ya pasó una vez al revés:* `agente-datos` tocó `apps/web/src/lib/metricas.ts` al
   agregar métricas nuevas, y la fusión con la rama de UI compiló mal. Git dijo «fusión
   automática correcta» y el resultado no compilaba. Por eso la puerta de verificación se
   corre **después** de fusionar, no solo sobre la rama.

4. **El contrato entre ambos son los archivos de `data/`** (ver abajo). Mientras esa
   forma no cambie, los dos pueden avanzar sin bloquearse.

5. **Si el contrato tiene que cambiar**, lo cambia `agente-datos`, lo anuncia en el
   tablero **antes** de que `agente-ui` dependa de la forma nueva, y lo refleja aquí.

### Umbrales duplicados: manténlos sincronizados

`apps/web/src/lib/metricas.ts` repite los umbrales de frescura de
`packages/ingest/src/freshness.ts`. La duplicación es deliberada —importar el paquete de
ingesta arrastraría zod y módulos de Node al navegador— pero **los dos tienen que decir
lo mismo**. Ambos están tipados como `Record<Metric, …>`, así que agregar una métrica
rompe la compilación hasta que se actualicen los dos. Ese error es una función, no una
molestia.

### Antes de pedir una fusión

Todo esto tiene que pasar en verde. Es la puerta, no una sugerencia:

```bash
npm run typecheck
npm test
npm run build
bash scripts/check-no-personal-data.sh
```

Y además: probado a **390 × 844** (celular), sin errores de consola, sin desplazamiento
horizontal, y la página sigue legible con JavaScript desactivado.

---

## El contrato de datos

Lo que `apps/web` puede dar por hecho. Los archivos se sirven desde
`${BASE_URL}data/…` y se piden con `fetch`.

| Archivo | Contenido |
|---|---|
| `boundaries/municipios.topojson` | 1.122 municipios. Propiedades: `pcode`, `name`, `admin1_pcode`, `admin1_name` |
| `boundaries/departamentos.topojson` | 33 departamentos: `pcode`, `name` |
| `event/event.json` | `magnitude`, `depthKm`, `longitude`, `latitude`, `place`, `alert`, `originTime`, `url`, `id` |
| `event/mmi-by-municipality.json` | `{ generated_at, municipalities: [{ pcode, name, admin1_name, mmi, mmi_roman, method }] }` |
| `event/aftershocks.geojson` | Puntos con `magnitude`, `depth_km`, `place`, `time` |
| `observations/afectacion.json` | `{ meta, observations: Observation[] }` |
| `ayuda/puntos.geojson` | Centros de acopio y albergues. Ubicación **exacta** (política contraria a la de incidentes) con `como_llegar` ya armado y `verificado` (persona vs. geocodificador) |
| `fuentes/candidatos.json` | Notas de prensa para revisión humana |
| `fuentes/alcaldias.json` | Actos y boletines **oficiales** publicados por cada alcaldía desde el sismo: `{ pcode, municipio, departamento, titulo, tipo, url, publicado, resumen }`. Es la fuente que llega a los municipios pequeños donde no hay prensa |
| `fuentes/cobertura.json` | Qué medios informan de cada municipio golpeado — y **de cuáles no informa nadie**. `resumen.poblacion_sin_notas` es la gente de la que no sabemos nada |
| `secciones/index.json` + `secciones/{pcode}.topojson` | Trama urbana del DANE, **440 municipios: MMI ≥ 5, más los que tengan ayuda o incidentes**. El índice trae `bbox` (encuadrar) y **`ancla`** (dónde colocar el nombre: mediana de los centroides de las secciones). **Para etiquetar usa `ancla`** — el centro del `bbox` cae entre poblados en el 54 % de los municipios. Los topojson van **sin propiedades** (el MGN solo publica códigos y la interfaz no los lee) y se piden de uno en uno al tocar: mediana 1,0 KB comprimidos, Bogotá 108 KB |
| `export/*.csv` | CSV con etiquetas HXL. `cobertura-por-municipio.csv` trae `sin_cobertura`: filtrarla da los municipios golpeados de los que no informa nadie |

**`Observation`** es el primitivo central (`packages/ingest/src/schema.ts`):

```ts
{
  metric: 'deaths_confirmed' | 'injured' | 'missing_reported' | 'buildings_collapsed' | …,
  value: number,
  pcode: string,        // 'CO' país · 'CO76' departamento · 'CO76001' municipio
  source: {
    name,
    url?,        // opcional SOLO si type === 'unverified' (ADR-013)
    detalle?,    // obligatorio si no hay url: «Radio Versalles, boletín de las 14:00»
    type: 'official' | 'humanitarian' | 'press' | 'unverified'
  },
  observed_at: string,  // cuándo la FUENTE dice que era cierto
  ingested_at: string,  // cuándo lo trajimos
  notes?: string
}
```

Los P-codes equivalen a **DIVIPOLA del DANE**, así que cruzan con datos nacionales.

**Toda cifra que se muestre debe mostrar también su fuente y su antigüedad.** No es
decoración: es ADR-003, y es lo único que separa este proyecto de cualquier otra página
de crisis.

---

## Trampas conocidas

Cosas que ya costaron una tarde. No hace falta descubrirlas otra vez.

- **Node ≥ 22.12** (lo exige Astro). Con 22.11 el build falla sin decir por qué.
- **`.nojekyll`** debe existir en `apps/web/public/`. GitHub Pages ignora las carpetas
  que empiezan por guion bajo, y Astro publica en `_astro/`.
- **Los CSV van con CRLF** y `.gitattributes` los marca `-text`. Si Git los normaliza a
  LF, el árbol queda sucio en cada corrida y el cron hace commit de archivos idénticos.
- **DIVIPOLA aparece con y sin cero inicial.** `5656` y `05656` son el mismo municipio.
  Sin rellenar a cinco dígitos, los departamentos que empiezan por cero no cruzan.
- **Que una URL devuelva 200 no significa que el sitio sirva.** Hay que pedir también los
  recursos que el HTML referencia.
- **Los datos abiertos de la UNGRD terminan en 2024.** No es un fallo del adaptador:
  publican con más de un año de rezago.
- **La API de ReliefWeb exige un `appname` aprobado** por ellos. Trámite, no código.
- **Geocodificar es fácil; geocodificar bien es rechazar.** Una dirección («Carrera 43
  #6-120») devuelve la *vía*: un kilómetro de calle. Un barrio («Barranquillita») devuelve
  el barrio. Y si el sitio no está mapeado, la tentación es buscar «el complejo que lo
  contiene» — así se publicó la Ciudadela del Petronio a 2 km de donde era. La regla:
  **se consulta el nombre tal cual y, si no aparece, no hay coordenada.** Las cuatro
  revisiones están en `src/geocodificar.ts`.
- **Los límites de `data/` están simplificados y no sirven para asignar municipio cerca
  de un borde.** La sede de la Cruz Roja de Caldas cae 549 m dentro del polígono de
  Villamaría; está en Manizales, y lo dicen la prensa, los directorios y su DIVIPOLA. El
  límite ahí es el río Chinchiná, y simplificar un río que serpentea le corta las curvas.
  Para el pcode manda la fuente, no el punto en polígono.
- **Los sitios de las alcaldías no tienen HTML que leer: son aplicaciones Angular.**
  `www.<municipio>-<departamento>.gov.co` le devuelve a `curl` una cáscara de 2.905 bytes
  titulada «Territoriales», idéntica en todos. Por eso el rastreo por HTML no encontraba
  nada y el patrón `/rss` no se generalizaba. El contenido está detrás de una API pública
  compartida del MinTIC — **MiColombiaDigital** — con un alias por municipio que se deriva
  del nombre (`Roldanillo` + `Valle del Cauca` → `roldanillovalledelcauca`). Está en
  `src/sources/alcaldias.ts`. **Los avisos de notificación personal de esa API traen
  nombre y cédula: hay un filtro ADR-001 que debe correr antes que cualquier otro.**
- **Hay un municipio llamado Colombia** (Huila) y otro llamado **Risaralda** (Caldas).
  Al reconocer municipios en titulares hay que descartar los nombres que coinciden con el
  país o con un departamento.
- **Astro sube a la carga inicial el CSS de todo el grafo de módulos de la página,
  importaciones dinámicas incluidas.** Un `import './x.css'` dentro de un módulo diferido
  **no viaja diferido**: si es grande, Astro lo enlaza con un `<link>` bloqueante; si es
  pequeño, lo incrusta en un `<style>`. Así estuvo `maplibre-gl.css` metiendo **9.946 B**
  en la ruta bloqueante, bajo un comentario que aseguraba lo contrario. La salida es
  importar con `?url` e inyectar el `<link>` en tiempo de ejecución.
- **Medir la carga inicial globando `index.*.css` da un número falso.** Esa receta —la que
  usó este tablero durante varias rondas— no veía la segunda hoja, así que **todas las
  cifras de carga reportadas hasta el 2026-08-12 estaban ~9,9 KB por debajo de la
  realidad**. Lo correcto es leer del HTML construido qué se enlaza de verdad:

  ```bash
  # Hojas que bloquean el pintado, según el propio index.html
  grep -o 'rel="stylesheet"[^>]*href="[^"]*"' apps/web/dist/index.html
  ```

  y sumar `index.html` + cada hoja que salga ahí + los scripts de arranque. Un `<link>`
  inyectado en tiempo de ejecución **no** cuenta, aunque después aparezca en el `<head>`
  del DOM — por eso hay que mirar el archivo construido y no el navegador.
- **Astro no borra los comentarios HTML.** Los `<!-- … -->` de las plantillas `.astro`
  viajan enteros al navegador; `Mapa.astro` llegó a llevar 3.282 B de notas. Las
  explicaciones van en el docblock del frontmatter, que se queda en el servidor.

---

## Memoria para agentes

Este archivo es la memoria **legible**: reglas, contrato y trampas. Además hay un
`.mcp.json` con un servidor de sistema de archivos para consultar el repositorio de forma
estructurada. Detalle y cómo agregar el índice semántico: [`docs/MCP.md`](docs/MCP.md).

---

## Comandos

```bash
npm install
npm test              # sin red, contra fixtures grabados
npm run typecheck
npm run dev           # http://localhost:4321
npm run build
npm run ingest        # descarga real; revisa `git diff data/` después
npm run campo -- ruta/al.csv   # recolección en campo → curated/incidentes.sugeridos.json
npm run boundaries -w @report-cali/ingest   # límites municipales; a mano, tarda
```

---

## Estado

Fases 0 a 4 en producción, 279 pruebas. Pendiente: credenciales de Cloudflare y tres
trámites que no son código — el `appname` de ReliefWeb, permiso a los dos diarios de Cali
que nos bloquean por User-Agent, y avisar a la Alcaldía de Cartago de que su RSS sirve
texto de relleno. El detalle está en [`docs/ROADMAP.md`](docs/ROADMAP.md).

**El techo del proyecto, medido:** de 228 municipios golpeados, **179 no tienen ni una
nota de prensa** (`data/fuentes/cobertura.json`). No hay gaceta municipal legible por
máquina — se comprobó. Por eso existe la recolección en campo
([`docs/CAMPO.md`](docs/CAMPO.md)) y ADR-013: en un municipio de 7.000 habitantes, la
emisora local y alguien parado ahí son las únicas fuentes que hay.
