# Tablero de coordinación

Estado en curso entre los dos agentes. **El contrato y los límites están en
[`../CLAUDE.md`](../CLAUDE.md)**; esto es solo el pizarrón: qué hay en vuelo y qué se
está esperando de quién.

Actualiza tu propia fila. No borres la del otro.

---

## Ramas en vuelo

| Rama | Agente | Qué trae | Estado |
|---|---|---|---|
| — | — | — | — |

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
