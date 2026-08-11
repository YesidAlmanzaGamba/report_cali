# Cómo contribuir

Gracias por querer ayudar. Se puede contribuir **en español o en inglés** — usa el idioma
en el que te sientas cómodo, en issues, PRs y comentarios de código.

## Antes de escribir código: lee esto

Este proyecto tiene **cuatro reglas que no se negocian**. Están explicadas a fondo en
[`docs/DECISIONS.md`](docs/DECISIONS.md), pero en corto:

1. **Nunca se almacenan datos personales** de personas desaparecidas o fallecidas.
   La Ley 1581 de 2012 los clasifica como datos sensibles, y la identidad de una persona
   fallecida no puede publicarse antes de la identificación por Medicina Legal y la
   notificación a la familia. Publicamos **conteos agregados por municipio**.
2. **Nada de scraping de redes sociales.** Viola los términos de servicio de las
   plataformas y es la vía principal por la que circulan fotos recicladas de desastres
   anteriores.
3. **Toda cifra lleva su fuente y su hora.** Un `number` suelto no pasa revisión.
4. **Para personas: agregamos y enlazamos. Recolectamos directamente solo sobre lugares**
   (albergues, centros de acopio).

Los PR que rompan cualquiera de estas cuatro reglas se cierran, sin importar qué tan buen
código traigan. No es desconfianza: es que ya hay cuatro registros de desaparecidos y el
daño de sumar un quinto es real.

## Empezar

```bash
git clone <tu-fork>
cd report_cali
npm install
npm test
```

Requiere **Node ≥ 20**. No necesitas instalar nada global.

## Buenas primeras tareas

Cada **adaptador de ingesta** es una unidad independiente, con una entrada y una salida
claras, y se puede hacer sin entender el resto del sistema. Son ideales para empezar:
mira los issues etiquetados [`good first issue`](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

Un adaptador vive en `packages/ingest/sources/`, y su contrato es:

```ts
export async function fetchX(): Promise<Observation[]>
```

Nada más. El runner se encarga de validar, versionar y escribir.

## Reglas de las pruebas

- **Las pruebas nunca tocan la red.** Cada adaptador se prueba contra un *fixture*
  grabado en `packages/ingest/fixtures/`. Los esquemas de las fuentes cambian sin avisar,
  y CI no puede romperse porque el USGS renombró un campo.
- Para regrabar un fixture: `npm run fixtures:record -- <fuente>`. Revisa el diff antes de
  hacer commit — un fixture es una foto de la realidad y merece la misma atención que el código.
- Si una fuente rompe su esquema, el adaptador debe **fallar ruidosamente y conservar el
  último dato bueno**, nunca publicar basura. Una cifra vieja y marcada como vieja es mucho
  menos dañina que una cifra corrupta presentada como fresca.

## Estilo

- TypeScript en modo estricto. Sin `any` sin justificar en un comentario.
- Los mensajes de commit y los nombres de rama pueden ir en español o inglés.
- La copia de la interfaz va en **español (es-CO) primero**. El inglés es la traducción.
- Antes de abrir el PR: `npm run typecheck && npm run lint && npm test`.

## Datos

`data/` está **versionado a propósito**. Es contraintuitivo para archivos generados, pero
aquí el historial de git es la trazabilidad de procedencia: cada cambio de cada cifra queda
como un diff auditable. No lo agregues a `.gitignore`.

## Revisión

Los PR se revisan mirando: ¿respeta las cuatro reglas? ¿toda cifra nueva trae fuente y
hora? ¿hay prueba con fixture? ¿funciona en 3G?

Si algo no está claro, abre un issue y pregunta antes de invertir horas. Preguntar es
gratis y siempre es bienvenido.

## Código de conducta

Este proyecto se rige por [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Estamos trabajando
sobre un desastre en el que murió gente; se espera cuidado en el trato y en el tono.
