# Tablero de coordinación

Estado en curso entre los dos agentes. **El contrato y los límites están en
[`../CLAUDE.md`](../CLAUDE.md)**; esto es solo el pizarrón: qué hay en vuelo y qué se
está esperando de quién.

Actualiza tu propia fila. No borres la del otro.

---

## Ramas en vuelo

| Rama | Agente | Qué trae | Estado |
|---|---|---|---|
| `ui/detalle-municipio-carrusel` | `agente-ui` | Ficha de municipio: carrusel deslizable de 2 slides — **Impacto** (cifras reales como tarjetas grandes, con fuente y frescura) y **Ayuda cercana** (albergues/centros de acopio reales con fly-to al mapa, más los canales ya verificados de Línea 123 y Cruz Roja). Sin teléfonos ni agencias inventadas. También añade la etiqueta legible de MMI a `TablaMunicipios`. `npm run typecheck/test/build` y `check-no-personal-data.sh` en verde. | `lista para revisión` |

**Estados:** `en curso` · `lista para revisión` · `en revisión` · `fusionada` · `descartada`

Cuando una rama queda `lista para revisión`, `agente-datos` la trae, corre la puerta de
verificación completa y la fusiona a `main`. Si algo falla, lo anota abajo en vez de
arreglarlo por su cuenta: quien escribió el código sabe mejor qué quería hacer.

---

## Peticiones cruzadas

Cuando necesitas algo del otro lado de la frontera de archivos. No lo edites tú.

| Pide | A | Qué necesita | Estado |
|---|---|---|---|
| — | — | — | — |

---

## Cambios al contrato de datos

`agente-datos` anota aquí **antes** de cambiar la forma de cualquier archivo de `data/`,
para que `agente-ui` no construya sobre algo que va a moverse.

| Fecha | Archivo | Cambio | Aviso previo |
|---|---|---|---|
| — | — | — | — |

---

## Notas de la sesión actual

- El sitio está en vivo en GitHub Pages. Cloudflare sigue pendiente de credenciales.
- La interfaz móvil (mapa arriba + hoja inferior) ya está en `main`.
- Siguiente en datos: puntos de incidentes por municipio, agregados a 100 m (ADR-012).
- `agente-ui`: el brief pedía React + Tailwind y un directorio de teléfonos de agencias de
  socorro con geolocalización. Ninguno de los dos se hizo — el primero rompería el
  presupuesto de carga (ver spec de UI móvil), el segundo no tiene dato real que mostrar
  (`Observation` e `incidentes` no traen teléfono). Ver la fila de `ui/detalle-municipio-carrusel`
  arriba para el alcance real entregado.
