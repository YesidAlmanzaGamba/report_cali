# Mapa de Situación — Terremoto Colombia, 10 de agosto de 2026

> **¿Buscas a un familiar? Este sitio NO es un registro de personas desaparecidas.**
>
> Usa los canales oficiales, que sí lo son:
> - **Línea de emergencia: 123**
> - **Cruz Roja Colombiana — Restablecimiento del Contacto Familiar (RCF):**
>   WhatsApp **+57 321 213 9525** · `rcf@cruzrojacolombiana.org`
> - **Plataforma ciudadana:** [colombiatebusca.com](https://colombiatebusca.com)
>
> Reportar en varios sitios a la vez **fragmenta la búsqueda**. Usa los canales de arriba.

---

Mapa abierto y verificable de la afectación del terremoto de **magnitud 7.4** ocurrido el
**10 de agosto de 2026 a las 07:34** (hora local), con epicentro a 5 km de
**San José del Palmar, Chocó**, a ~110 km de profundidad.
Evento USGS [`us6000tjl2`](https://earthquake.usgs.gov/earthquakes/eventpage/us6000tjl2),
alerta **ROJA**.

## El problema que resuelve

En las primeras 24 horas las cifras de fallecidos reportadas variaron entre 169, 224 y 234
según la fuente y la hora. La información oficial está dispersa en boletines de prensa, PDF
y visores ArcGIS: nada de eso es legible por máquina ni está cruzado geográficamente.

Un socorrista no puede responder la pregunta operativa —**¿qué municipios recibieron el
sacudimiento más fuerte, y las vías están transitables?**— sin reconciliar cinco fuentes a mano.

Este proyecto hace ese cruce, y **cada cifra que muestra viene con su fuente y su hora**.

## Lo que este proyecto NO hace

Cuatro organizaciones ya recogen reportes de personas desaparecidas
(Cruz Roja RCF, línea 123, UNGRD/RUNDA, colombiatebusca.com). **Un quinto formulario
fragmentaría la búsqueda, quedaría desactualizado y sería un blanco para estafas**
del tipo «encontramos a su familiar, envíe dinero».

Por eso, por diseño y de forma permanente:

- ❌ **No almacenamos datos personales** de personas desaparecidas ni fallecidas.
- ❌ **No hacemos scraping de redes sociales.**
- ✅ Publicamos **conteos agregados por municipio**, siempre con fuente y fecha.
- ✅ Enlazamos a los canales oficiales para la búsqueda de personas.

Las razones completas están en [`docs/DECISIONS.md`](docs/DECISIONS.md). Si vas a
contribuir, léelo antes de proponer un formulario de desaparecidos.

## ¿Para quién es?

Para **socorristas y organizaciones locales**: bomberos, Defensa Civil, voluntarios de
Cruz Roja, alcaldías y grupos de ayuda de base. Está optimizado para responder *qué se
necesita, dónde y ahora*, para exportar datos, y para funcionar en un celular con 3G malo.

## Arquitectura

Estático primero. Un sitio de emergencia recibe su pico de tráfico justo cuando más
importa, así que la ruta de lectura son archivos estáticos en un CDN, sin base de datos.

```
packages/ingest/   Adaptadores TS, uno por fuente → JSON normalizado
data/              GENERADO y versionado. El historial de git ES la trazabilidad.
apps/web/          Astro + MapLibre GL
docs/              DATA_SOURCES.md, DECISIONS.md, specs/
```

Una GitHub Action corre cada 15 minutos, ejecuta los adaptadores y hace commit de `data/`
solo si el contenido cambió. Cada revisión de cada cifra queda como un `git diff`: esa es
la auditoría de procedencia, gratis.

El primitivo central es la **Observación** — nunca guardamos un número pelado:

```ts
{
  metric: "deaths_confirmed",
  value: 224,
  pcode: "CO76001",                    // P-code COD-AB ≡ DIVIPOLA del DANE
  source: { name: "UNGRD", url: "…", type: "official" },
  observed_at: "2026-08-11T14:00:00Z", // cuándo la FUENTE dice que era cierto
  ingested_at: "2026-08-11T14:12:03Z"  // cuándo lo trajimos nosotros
}
```

## Fuentes de datos

Todas abiertas y documentadas en [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md):
USGS FDSN (ShakeMap, ground-failure, réplicas), límites municipales COD-AB de HDX
(1.122 municipios, con P-codes que empatan con DIVIPOLA), SGC/RSNC, ReliefWeb,
Copernicus EMS **EMSR916** y UNGRD.

## Desarrollo

Requiere **Node ≥ 22.12** (lo exige Astro). No hace falta instalar nada global.

```bash
npm install
npm test              # pruebas offline contra fixtures grabados
npm run typecheck
npm run ingest        # descarga real; luego revisa `git diff data/`
npm run dev           # http://localhost:4321
npm run build
```

Los límites municipales se reconstruyen aparte, **no en el cron** (son 117 MB desde HDX y
no cambian durante un desastre):

```bash
npm run boundaries -w @report-cali/ingest
```

### Peso de la página

| | Comprimido |
|---|---|
| Carga inicial (HTML + CSS + cargador) | **~7,5 KB** |
| Mapa, solo si se usa (MapLibre + CSS) | ~282 KB |
| Geometría de 1.122 municipios (TopoJSON) | ~222 KB |
| Intensidad por municipio | ~15 KB |

La tabla y el resumen se generan en tiempo de compilación, así que la información llega en
7,5 KB y **la página sirve aunque el JavaScript nunca cargue**. El mapa se descarga solo al
desplazarse hasta él, y si el navegador reporta conexión lenta o «ahorro de datos», primero
pregunta. Esto es deliberado: la conexión real de un socorrista en zona de desastre es un
3G malo.

## Despliegue

**Paso a paso, con los nombres exactos de cada botón: [`docs/TUTORIAL.md`](docs/TUTORIAL.md).**
Arquitectura, cuotas y costos en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).
Qué sigue, en [`docs/ROADMAP.md`](docs/ROADMAP.md).

El sitio es estático y se publica en **Cloudflare Workers** desde GitHub Actions. No hay
que configurar nada en el panel de Cloudflare: el Worker se crea solo en el primer
despliegue. Bastan dos secretos —`CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`— y sin
ellos el flujo compila, avisa y no falla.

> **La regla que sostiene el costo en cero:** los datos **no** pasan por el despliegue.
> Se sirven desde R2, donde el egreso no tiene cargo, y solo los cambios de código
> republican el sitio. Las peticiones a activos estáticos en Workers son gratis e
> ilimitadas.

`.github/workflows/ingesta.yml` vuelve a consultar las fuentes cada 15 minutos y hace
commit en `data/` **solo si el contenido cambió**, lo que a su vez dispara un despliegue.

> **Falta un ajuste manual para que el cron pueda publicar.**
> En *Settings → Actions → General → Workflow permissions*, elegir
> **«Read and write permissions»**. Sin eso el flujo de ingesta corre y trae los datos,
> pero el `git push` final falla: el permiso `contents: write` del archivo no puede
> superar el máximo que fije el repositorio.

## Cómo contribuir

Se necesita ayuda y se agradece. Cada adaptador de ingesta es una tarea autocontenida y
buena para empezar — mira los issues con la etiqueta
[`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

Lee [`CONTRIBUTING.md`](CONTRIBUTING.md). Se puede contribuir en español o en inglés.

## Licencia

Código bajo [MIT](LICENSE). Datos publicados bajo CC-BY-4.0, respetando las licencias de
las fuentes originales. Elegimos MIT a propósito: una ONG o una alcaldía puede reutilizar
esto sin pasar por revisión legal.

---

*Este es un proyecto ciudadano y voluntario. No reemplaza a las autoridades, a los
organismos de socorro ni a las líneas oficiales de emergencia.*
