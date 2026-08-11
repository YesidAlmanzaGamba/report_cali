# Tutorial: dejar el sitio publicado

Paso a paso, con los nombres exactos de cada botón. No hace falta saber de Cloudflare.

**Está dividido en tres partes y se pueden hacer en días distintos:**

| | Qué logra | Tiempo |
|---|---|---|
| **Parte A** | El sitio queda vivo en internet | ~10 min |
| **Parte B** | El espejo de respaldo en GitHub | ~1 min |
| **Parte C** | Los datos dejan de gastar compilaciones | ~10 min |

Haz la **A** primero y ya tendrás algo publicado. La **C** puede esperar unos días sin
que nada se rompa.

> **Antes de empezar:** todo el código ya está listo y subido. Lo que falta son
> permisos y credenciales — cosas que solo puedes hacer tú porque son tus cuentas.

---

# Parte A — Poner el sitio en internet

Al terminar tendrás una URL pública tipo `https://report-cali.TU-CUENTA.workers.dev`.

## A1. Copiar tu Account ID de Cloudflare

1. Entra a <https://dash.cloudflare.com>.
2. En el menú de la izquierda haz clic en **Workers & Pages**.
3. Mira la **columna derecha**. Vas a ver un recuadro que dice **Account ID** con un
   texto largo de letras y números.
4. Haz clic en el ícono de copiar. Guárdalo en un bloc de notas.

> **¿No ves la columna derecha?** Está en la barra de direcciones del navegador:
> `dash.cloudflare.com/`**`aquí-va-tu-account-id`**`/workers`. Es esa parte del medio.

## A2. Crear el token de API

Este token es lo que le permite a GitHub publicar en tu cuenta de Cloudflare.

1. Arriba a la derecha, haz clic en el **ícono de tu perfil** → **My Profile**.
2. En el menú izquierdo, **API Tokens**.
3. Botón azul **Create Token**.
4. Baja hasta el final y elige **Create Custom Token** → **Get started**.
5. Llénalo así:

   | Campo | Valor |
   |---|---|
   | **Token name** | `report-cali-deploy` |
   | **Permissions** — fila 1 | `Account` · `Workers Scripts` · **`Edit`** |
   | **Permissions** — fila 2 | `Account` · `Workers R2 Storage` · **`Edit`** |
   | **Account Resources** | `Include` · tu cuenta |

   La fila 2 se agrega con el botón **+ Add more**. La necesitas para la Parte C; si la
   agregas ahora te ahorras volver.

6. **Continue to summary** → **Create Token**.
7. **Copia el token que aparece y guárdalo ya.** Cloudflare **no lo vuelve a mostrar
   nunca**. Si lo pierdes, no pasa nada grave: borras ese token y creas otro.

## A3. Guardar las credenciales en GitHub

1. Ve a <https://github.com/YesidAlmanzaGamba/report_cali>.
2. Pestaña **Settings** (la de arriba, a la derecha del todo).
3. Menú izquierdo: **Secrets and variables** → **Actions**.
4. Botón verde **New repository secret**. Crea **dos**, uno a la vez:

   | Name | Secret |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | el token del paso A2 |
   | `CLOUDFLARE_ACCOUNT_ID` | el Account ID del paso A1 |

   Los nombres van **exactos**, en mayúsculas y con guiones bajos.

## A4. Dar permiso de escritura a las Actions

Sin esto, el robot que actualiza los datos cada 15 minutos los descarga bien pero no
puede guardarlos. Falla en silencio, que es lo peor que puede pasar.

1. Sigues en **Settings**. Menú izquierdo: **Actions** → **General**.
2. Baja hasta **Workflow permissions**.
3. Marca **Read and write permissions**.
4. **Save**.

## A5. Lanzar el despliegue

Los secretos no disparan nada por sí solos: hay que correr el flujo una vez.

1. Pestaña **Actions** del repositorio.
2. En la lista de la izquierda, **Desplegar**.
3. Botón **Run workflow** (derecha) → **Run workflow**.
4. Espera 1–2 minutos y refresca.

**Cómo saber que funcionó:** entra a la corrida y busca el paso
**«Publicar en Cloudflare»**. Si aparece con ✓ y ya no dice *«Aviso si falta configurar
credenciales»*, quedó publicado.

## A6. Encontrar tu URL

1. Vuelve a Cloudflare → **Workers & Pages**.
2. Debe aparecer un Worker llamado **report-cali**. Haz clic.
3. Arriba verás la URL: `https://report-cali.ALGO.workers.dev`.

Ábrela. Deberías ver el mapa. **Ya está en internet.** 🎉

---

# Parte B — El espejo de respaldo

Un segundo origen, gratis y con dueño distinto. Si Cloudflare tiene un incidente o la
cuenta se pierde, queda a dónde apuntar. En respuesta a desastres eso no es exceso.

1. Repositorio → **Settings** → menú izquierdo **Pages**.
2. En **Source**, elige **GitHub Actions**.
3. Listo. No hay que guardar nada más.

En el siguiente push se publica en
`https://yesidalmanzagamba.github.io/report_cali/`. Para publicarlo ya:
**Actions** → **Espejo en GitHub Pages** → **Run workflow**.

> El espejo es **respaldo, no principal**: GitHub Pages tiene un límite blando de
> 100 GB al mes y en emergencia nacional eso se alcanza en días.

---

# Parte C — Que los datos no gasten compilaciones

**Esto es lo que evita que el despliegue se rompa solo.** Cloudflare da un número
limitado de compilaciones al mes; el robot de datos corre cada 15 minutos, y si cada
actualización dispara una compilación, la cuota se agota justo cuando los datos importan.
La solución es servir los datos desde un almacén aparte (R2), donde además **sacar datos
no tiene ningún costo**.

## C1. Activar R2

1. Cloudflare → menú izquierdo **R2 Object Storage**.
2. Si es la primera vez, te va a pedir aceptar los términos.

> **Aviso honesto:** Cloudflare puede pedirte una **tarjeta** para habilitar R2, aunque
> el plan gratuito no cobre nada. Con nuestro uso —unos 2 MB de 10 GB gratuitos— no
> debería generarse cobro. Si prefieres no registrar tarjeta, **puedes saltarte toda la
> Parte C**: el sitio funciona igual, solo queda el riesgo de agotar compilaciones si el
> proyecto se mantiene muy activo.

## C2. Crear el bucket

1. Botón **Create bucket**.
2. Nombre exacto: **`report-cali-datos`**
3. **Create bucket**.

## C3. Hacerlo público

Los datos son públicos por diseño — es un proyecto de datos abiertos.

1. Entra al bucket → pestaña **Settings**.
2. Busca **Public access** (o *R2.dev subdomain*).
3. **Allow Access** y confirma.
4. Copia la URL pública que aparece, tipo `https://pub-XXXX.r2.dev`.

## C4. Decirle al sitio dónde están los datos

1. GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Pestaña **Variables** (al lado de *Secrets*) → **New repository variable**.

   | Name | Value |
   |---|---|
   | `PUBLIC_DATA_URL` | la URL del paso C3 |

3. **Actions** → **Desplegar** → **Run workflow**.

## C5. Comprobar

**Actions** → **Ingesta de datos** → **Run workflow**. En el paso **«Subir a R2»**
deberías ver la lista de archivos con `↑`. Si dice *«Sin credenciales de Cloudflare»*,
revisa que el token del paso A2 tenga la fila de **Workers R2 Storage · Edit**.

---

# Si algo sale mal

| Síntoma | Causa casi siempre | Solución |
|---|---|---|
| **Desplegar** en verde pero no hay Worker | Los secretos no existen o están mal escritos | Revisa mayúsculas y guiones bajos en A3 |
| `Authentication error` en el log | Al token le falta un permiso | Rehaz A2 con las dos filas |
| El robot trae datos pero no los guarda | Falta el permiso de escritura | Paso A4 |
| El mapa carga pero sale vacío | `PUBLIC_DATA_URL` mal puesta | Ábrela en el navegador: debe descargar un archivo |
| **Espejo** se salta la publicación | Pages sin habilitar | Parte B |
| No encuentro el Account ID | — | Está en la URL del panel (ver A1) |

**Los tokens se pueden borrar y rehacer sin miedo.** Si algo quedó raro, borra el token en
Cloudflare, crea uno nuevo y actualiza el secreto en GitHub. Nada se rompe.

---

# Qué queda funcionando solo

- Cada **15 minutos**, un robot consulta al USGS y actualiza la intensidad.
- Si algo cambió, lo sube a R2 y hace commit del histórico.
- Cada cambio de código republica el sitio y el espejo.
- Cada cifra que se muestra queda con su fuente, su hora y su rastro en el historial.

Costo total: **cero.** Lo único que valdría la pena pagar es un dominio propio
(~USD 12 al año), que ayuda cuando la gente comparte el enlace por WhatsApp.
