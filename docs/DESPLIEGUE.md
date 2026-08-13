# Despliegue, almacenamiento y costos

Cómo se publica el sitio, dónde vive la información y por qué la cuenta da cero.

---

## El problema que define la arquitectura

Un sitio de desastre tiene un perfil de tráfico raro: casi nada durante meses y, de
repente, un pico nacional. El 10 de agosto el sismo lo sintieron ~34 millones de personas.
Si el sitio se cae en ese pico, no sirve de nada que fuera barato.

Y hay una trampa menos obvia, que es la que decide el diseño:

> **Si se conecta el repositorio a la integración Git de Cloudflare, el plan gratuito da
> 500 compilaciones al mes.**
>
> El cron de ingesta hace commit cada vez que cambian los datos, y cada commit a `main`
> dispararía una compilación. En emergencia activa son entre 20 y 50 al día:
> **600 a 1.500 al mes**. Se agota la cuota y los despliegues se detienen justo cuando los
> datos importan.

**No caemos en esa cuota, porque compilamos en GitHub Actions y no en Cloudflare** — y los
repositorios públicos tienen minutos de Actions gratuitos sin límite. Aun así mantenemos
los datos separados del despliegue, por tres razones que siguen valiendo:

1. **Velocidad.** Subir un archivo a R2 tarda segundos; compilar y desplegar el sitio
   entero tarda minutos. En emergencia esa diferencia importa.
2. **No ensuciar el historial de versiones.** Publicar el sitio completo 96 veces al día
   generaría 96 versiones del Worker por cambios que no tocaron una sola línea de código.
3. **Independencia.** Si mañana alguien conecta la integración Git de Cloudflare por
   comodidad, la cuota de 500 vuelve a ser real. La arquitectura ya quedó a salvo.

De ahí la regla central: **los datos no pasan por el despliegue del sitio.**

---

## Arquitectura

```
Repositorio GitHub  ─── sistema de registro (el historial ES la trazabilidad, ADR-004)
   │
   ├── cambia el código  ──→  GitHub Actions compila  ──→  Cloudflare Workers
   │                          (pocas veces: ~5–20 al mes)
   │
   └── cron de ingesta   ──┬─→  sube los datos a R2   ──→  CDN  (sin desplegar)
       (cada 30 min)       │    (frecuente, gratis)
                           └─→  commit en data/  ──→  archivo auditable
```

El sitio es HTML estático que pide los datos por `fetch` en tiempo de ejecución. Al
apuntar ese `fetch` a R2 y no a su propio dominio, actualizar datos deja de requerir un
despliegue.

**Por qué Workers y no Pages.** Cloudflare puso Pages en modo mantenimiento y recomienda
Workers para proyectos nuevos. Para nosotros el argumento decisivo es otro: cuando la fase
5 necesite guardar reportes de albergues, se le agrega un manejador y un binding a este
mismo Worker, en vez de mudar el proyecto de plataforma. Y el costo no cambia: *«las
peticiones a activos estáticos son gratis e ilimitadas»* — no consumen el límite de
100.000 peticiones diarias, que solo aplica cuando se ejecuta código. Como nuestro
`wrangler.jsonc` no declara `main`, todo el tráfico del sitio es estático.

Los datos siguen quedando en `data/` dentro de git: ahí no son la ruta de servicio, son el
archivo histórico auditable.

---

## Por qué Cloudflare y no GitHub Pages

Las dos opciones son gratis. La diferencia está en cómo fallan bajo carga.

| | **Cloudflare Workers** | **GitHub Pages** |
|---|---|---|
| Ancho de banda | **Sin medir** | **100 GB/mes (límite blando)** |
| Peticiones a estáticos | **Gratis e ilimitadas** | Cuentan contra los 100 GB |
| Qué pasa al excederlo | Nada | GitHub puede dejar de servir el sitio y te escribe |
| Protección DDoS | Incluida | La de GitHub |
| Dominios propios | Sí | 1 |
| Reglas de caché | Sí, configurables | No |
| Camino a futuro | Se le agrega código y base de datos sin mudarse | Solo estático, siempre |

Con nuestro peso —unos 600 KB por sesión que abre el mapa— los 100 GB de GitHub dan para
**~170.000 sesiones al mes**. En un país de 52 millones de personas con un desastre
nacional declarado, eso se alcanza en días. Y es un límite *blando*: no hay un aviso claro,
simplemente el sitio puede dejar de responder.

**Recomendación: Cloudflare Workers como principal, GitHub Pages como espejo.** El espejo
es gratis, se publica desde el mismo `dist/`, y da a dónde apuntar si Cloudflare tiene un
incidente o si la cuenta se pierde. En una respuesta a desastre, tener dos orígenes con
distinto dueño es prudencia básica, no exceso.

> **Paso a paso con nombres exactos de botones: [`TUTORIAL.md`](TUTORIAL.md).**

---

## Dónde vive cada cosa

Tres capas, cada una con un trabajo distinto. La confusión típica es meterlo todo en una.

### 1. Git — el registro histórico

Todo lo que publicamos queda versionado en `data/`. Cada cambio de cada cifra es un
`git diff` con fecha y autor. Es lo que permite responder «¿de dónde salió este número y
cuándo cambió?» sin infraestructura adicional.

**Crecimiento:** el guardado solo escribe cuando el contenido cambia de verdad (el hash
ignora `ingested_at`), así que no hay commits de ruido. La geometría —lo pesado, 1,3 MB—
prácticamente no cambia. Las observaciones son JSON pequeño. Estimado: unos pocos MB al
mes. No es un problema en años.

### 2. Cloudflare R2 — la capa de servicio · **NO habilitada (ADR-014)**

> **Esto no está montado, y es una decisión, no un pendiente.** Hoy los datos se publican
> como activos estáticos del propio Worker: el navegador los pide al mismo dominio del
> sitio y el CDN los cachea igual.
>
> **Por qué no.** R2 se estaba considerando por el volumen de visitas, y el volumen de
> visitas no es un límite aquí: `wrangler.jsonc` no declara `main`, así que todo el
> tráfico son **activos estáticos, gratis e ilimitados**, y el tope de 100.000 peticiones
> diarias —que aplica a invocaciones de código— nunca se toca. R2 mejora la ruta de
> escritura, no la de lectura: ahorraría unos 2–3 minutos de latencia sobre datos que el
> cron refresca cada 30 minutos, a cambio de una tarjeta de crédito y cuatro piezas más
> que pueden fallar en emergencia.
>
> El razonamiento completo, con las cifras medidas y las **tres condiciones que lo
> reabren**, está en ADR-014 de [`DECISIONS.md`](DECISIONS.md).
>
> Lo que sigue describe cómo montarlo **cuando haga falta**. `scripts/upload-r2.sh` se
> queda en el repositorio por eso.

Los datos que el navegador pide, servidos desde el CDN.

| Recurso | Gratis al mes | Lo que usamos |
|---|---|---|
| Almacenamiento | 10 GB | ~2 MB |
| Operaciones clase A (escritura) | 1.000.000 | ~15.000 (96 corridas/día × 5 archivos) |
| Operaciones clase B (lectura) | 10.000.000 | Casi ninguna, por la caché |
| **Egreso** | **Sin cargo, siempre** | — |

El egreso gratis es la propiedad importante: en S3 o equivalentes, servir datos a mucha
gente es justo lo que cuesta. Aquí no cuesta.

Las lecturas casi no tocan R2 porque el CDN las sirve desde caché (ver más abajo). Aun sin
caché, 10M de lecturas ÷ 5 archivos por sesión son **2 millones de sesiones al mes**
dentro del plan gratuito.

### 3. Base de datos — todavía no hace falta

Mientras el proyecto sea de solo lectura, no hay base de datos y por eso no hay factura ni
punto único de falla. Cuando llegue el registro de albergues y necesidades (fase 5),
la opción natural es **Cloudflare D1** (SQLite en el borde) con **Workers** para las
escrituras. Confirmar sus cuotas vigentes antes de depender de ellas; en su momento la
capa gratuita cubría de sobra un volumen como el nuestro, pero esos números cambian.

### Archivo a largo plazo

Un dato humanitario debería sobrevivir al proyecto que lo produjo. Dos destinos que
cuestan cero y dan permanencia:

- **HDX** (`data.humdata.org`) — es donde el resto de la respuesta busca datos.
- **Zenodo** — da un DOI citable a cada instantánea del conjunto de datos.

---

## Reglas de caché (esto es lo que mantiene el costo en cero)

Sin caché correcta, cada visita golpea R2 y el CDN no ayuda.

Las aplica `scripts/upload-r2.sh` al subir cada archivo.

| Archivo | Cabecera | Por qué |
|---|---|---|
| `boundaries/*` | `max-age=86400, stale-while-revalidate=604800` | La geometría municipal prácticamente no cambia. |
| `event/*`, `observations/*` | `max-age=300, stale-while-revalidate=3600` | Cambian cuando el USGS revisa el ShakeMap o entra un boletín. |

**Por qué los límites no van marcados `immutable`,** aunque en la práctica nunca cambien:
el nombre del archivo no lleva hash de contenido. Un `immutable` de un año dejaría a
quien ya visitó el sitio con la geometría vieja hasta 2027, sin forma de corregirlo. Si
algún día se le agrega hash al nombre —`municipios.a1b2c3.topojson`— ahí sí conviene
`immutable`, y sería una mejora real.

`stale-while-revalidate` es la clave: el usuario recibe el dato viejo al instante y el CDN
lo refresca por detrás. Nadie espera, y R2 recibe una fracción de las peticiones.

---

## Cuándo empezaría a costar dinero

Con el diseño de arriba, el costo es **cero** y no depende del tráfico. Los tres caminos
que lo cambiarían:

1. **Fotos (fase 6).** 10 GB gratis en R2 son unas 10.000 imágenes de 1 MB. Pasado eso,
   USD 0,015 por GB al mes. Mitigación: recomprimir al subir, guardar solo tamaños web.
2. **Escrituras masivas (fase 5).** Si el registro de necesidades supera la cuota gratuita
   de Workers, el plan de pago arranca en USD 5 al mes.
3. **Ejecutar código en el borde.** Hoy el Worker no tiene `main`, así que todo el
   tráfico es estático —gratis e ilimitado—. En cuanto se agregue lógica de servidor
   empieza a contar el límite de 100.000 peticiones diarias.

**Techo realista del proyecto tal como está: USD 0.** Incluso con tráfico nacional.

---

## Pasos para dejarlo publicado

> **El paso a paso detallado, con los nombres exactos de cada botón, está en
> [`TUTORIAL.md`](TUTORIAL.md).** Esto es solo el resumen.

No hay que configurar nada en el panel de Cloudflare: el Worker se crea solo en el primer
despliegue, porque publicamos desde GitHub Actions y no desde la integración Git.

1. **Secretos en GitHub** (*Settings → Secrets and variables → Actions*):
   `CLOUDFLARE_API_TOKEN` (permisos: **Workers Scripts · Edit** y **Workers R2 Storage ·
   Edit**) y `CLOUDFLARE_ACCOUNT_ID`.
2. **Permisos de Actions** (*Settings → Actions → General → Workflow permissions*):
   **Read and write**. Sin esto el cron trae los datos pero no puede hacer commit.
3. **Lanzar** *Actions → Desplegar → Run workflow*. El Worker queda creado y publicado.
4. **Espejo en GitHub Pages**: *Settings → Pages → Source: **GitHub Actions***.
   Sin secretos. El flujo `pages.yml` ya compila con `PUBLIC_BASE=/report_cali/`, porque
   GitHub Pages sirve en una subruta y no en la raíz del dominio.
5. **Bucket R2** `report-cali-datos` con acceso público, y variable `PUBLIC_DATA_URL`
   apuntando a él. Mientras no exista, el sitio lee de `/data` y todo funciona igual.
6. *(Opcional)* **Dominio propio.** Un `.org` cuesta ~USD 12 al año y es lo único que
   costaría plata. Un dominio memorable importa cuando la gente lo comparte por WhatsApp.
