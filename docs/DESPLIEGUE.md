# Despliegue, almacenamiento y costos

Cómo se publica el sitio, dónde vive la información y por qué la cuenta da cero.

---

## El problema que define la arquitectura

Un sitio de desastre tiene un perfil de tráfico raro: casi nada durante meses y, de
repente, un pico nacional. El 10 de agosto el sismo lo sintieron ~34 millones de personas.
Si el sitio se cae en ese pico, no sirve de nada que fuera barato.

Y hay una trampa menos obvia, que es la que decide el diseño:

> **Cloudflare Pages permite 500 compilaciones al mes en el plan gratuito.**
>
> Nuestro cron de ingesta hace commit cada vez que cambian los datos, y cada commit a
> `main` dispara una compilación. En emergencia activa eso son entre 20 y 50 al día:
> **600 a 1.500 al mes**. Se agota la cuota y los despliegues se detienen justo cuando los
> datos importan.

De ahí la regla central: **los datos no pasan por la compilación del sitio.**

---

## Arquitectura

```
Repositorio GitHub  ─── sistema de registro (el historial ES la trazabilidad, ADR-004)
   │
   ├── cambia el código  ──→  Cloudflare Pages compila  ──→  sitio estático
   │                          (pocas veces: ~5–20 al mes)
   │
   └── cron de ingesta   ──┬─→  sube los datos a R2   ──→  CDN  (sin compilar)
       (cada 15 min)       │    (frecuente, gratis)
                           └─→  commit en data/  ──→  archivo auditable
```

El sitio es HTML estático que pide los datos por `fetch` en tiempo de ejecución. Al
apuntar ese `fetch` a R2 y no a su propio dominio de compilación, actualizar datos deja de
costar una compilación. El cron pasa de consumir ~1.500 compilaciones al mes a **cero**.

Los datos siguen quedando en `data/` dentro de git: ahí no son la ruta de servicio, son el
archivo histórico auditable.

---

## Por qué Cloudflare y no GitHub Pages

Las dos opciones son gratis. La diferencia está en cómo fallan bajo carga.

| | **Cloudflare Pages** | **GitHub Pages** |
|---|---|---|
| Ancho de banda | **Sin medir** | **100 GB/mes (límite blando)** |
| Qué pasa al excederlo | Nada | GitHub puede dejar de servir el sitio y te escribe |
| Compilaciones | 500/mes (gratis) | 10/hora (blando; no aplica con Actions propio) |
| Archivos por sitio | 20.000 | — |
| Tamaño máx. por archivo | 25 MiB | Sitio ≤ 1 GB |
| Protección DDoS | Incluida | La de GitHub |
| Dominios propios | 100 | 1 |
| Reglas de caché | Sí, configurables | No |

Con nuestro peso —unos 600 KB por sesión que abre el mapa— los 100 GB de GitHub dan para
**~170.000 sesiones al mes**. En un país de 52 millones de personas con un desastre
nacional declarado, eso se alcanza en días. Y es un límite *blando*: no hay un aviso claro,
simplemente el sitio puede dejar de responder.

**Recomendación: Cloudflare Pages como principal, GitHub Pages como espejo.** El espejo
es gratis, se publica desde el mismo `dist/`, y da a dónde apuntar si Cloudflare tiene un
incidente o si la cuenta se pierde. En una respuesta a desastre, tener dos orígenes con
distinto dueño es prudencia básica, no exceso.

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

### 2. Cloudflare R2 — la capa de servicio

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

| Archivo | Cabecera | Por qué |
|---|---|---|
| `boundaries/*.topojson` | `max-age=31536000, immutable` + hash en el nombre | Los límites municipales no cambian. Se descargan una vez en la vida del navegador. |
| `event/mmi-by-municipality.json` | `max-age=300, stale-while-revalidate=3600` | Cambia solo cuando el USGS revisa el ShakeMap. |
| `event/event.json` | `max-age=300, stale-while-revalidate=3600` | Igual. |
| `observations/*.json` | `max-age=120, stale-while-revalidate=600` | Lo más volátil; aun así 2 minutos de caché quitan casi toda la carga. |
| HTML | `max-age=60` | Para que un despliegue se vea rápido. |

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
3. **Más de 500 compilaciones al mes.** Solo pasaría si alguien vuelve a acoplar los datos
   a la compilación. Es exactamente lo que esta arquitectura evita.

**Techo realista del proyecto tal como está: USD 0.** Incluso con tráfico nacional.

---

## Pasos para dejarlo publicado

1. **Crear el proyecto en Cloudflare Pages** llamado `report-cali`.
   - `Build command: npm run build` · `Build output: apps/web/dist` · `NODE_VERSION: 22`
2. **Crear el bucket R2** `report-cali-datos` y habilitarle dominio público.
3. **Secretos en GitHub** (*Settings → Secrets and variables → Actions*):
   `CLOUDFLARE_API_TOKEN` (permisos: Pages Edit + R2 Edit) y `CLOUDFLARE_ACCOUNT_ID`.
4. **Permisos de Actions** (*Settings → Actions → General → Workflow permissions*):
   **Read and write**. Sin esto el cron trae los datos pero no puede hacer commit.
5. **Apuntar el sitio a R2**: variable `PUBLIC_DATA_URL` con la URL del bucket.
   Mientras no exista, el sitio sigue leyendo de `/data` y todo funciona igual.
6. *(Opcional)* **Espejo en GitHub Pages** publicando el mismo `dist/`.
7. *(Opcional)* **Dominio propio.** Un `.org` cuesta ~USD 12 al año y es lo único que
   costaría plata. Un dominio memorable importa cuando la gente lo comparte por WhatsApp.
