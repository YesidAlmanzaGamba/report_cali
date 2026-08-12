# Memoria del repositorio para agentes

Dos cosas distintas que se confunden fácil:

| | Qué es | Estado |
|---|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | Memoria **legible**: reglas duras, contrato de datos, trampas conocidas | ✅ funcionando, es lo que importa |
| [`../.mcp.json`](../.mcp.json) | Servidores **consultables** por un agente | ✅ configurado (sistema de archivos) |

**Si solo vas a leer una cosa, lee `CLAUDE.md`.** Es donde está el criterio del proyecto:
por qué no somos un registro de desaparecidos, por qué el color es intensidad y no daño,
por qué los CSV llevan CRLF. Un índice semántico encuentra dónde está una función; solo
un texto escrito explica por qué está.

---

## Qué hay configurado

`.mcp.json` es el archivo que Claude Code lee para servidores MCP **del proyecto** (no de
tu cuenta). Trae uno:

```jsonc
"report-cali-fs": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
}
```

Da acceso estructurado al repositorio: listar, leer y buscar sin depender de que el
agente adivine rutas. Se levanta solo con `npx`, así que no hay nada que instalar.

---

## Sobre `codebase-memory-mcp`

El encargo pedía configurar el índice de memoria de código con MCP. **No dejé una entrada
para ese servidor concreto, y conviene explicar por qué en vez de dejar algo que falle en
silencio.**

Ese servidor está disponible en el entorno de trabajo actual, pero **no como un paquete
que se pueda invocar desde aquí**: no aparece en ninguna configuración legible del
proyecto ni de la cuenta, así que no sé con qué comando se levanta. Inventar un `command`
plausible habría dejado un `.mcp.json` que parece configurado y no arranca — peor que no
tenerlo, porque el fallo aparece más tarde y sin explicación.

**Para agregarlo**, cuando sepas cómo se invoca:

```jsonc
{
  "mcpServers": {
    "report-cali-fs": { "...": "lo que ya está" },
    "codebase-memory": {
      "command": "<el comando que lo levanta>",
      "args": ["<sus argumentos>"],
      "env": {}
    }
  }
}
```

Y después indexar el repositorio una vez desde el agente. A partir de ahí se puede
preguntar «dónde se calcula la intensidad por municipio» en vez de recorrer archivos.

---

## Qué indexar y qué no

Cuando se active el índice semántico, conviene excluir lo generado: `data/`, `dist/`,
`node_modules/`, `apps/web/public/data/`. Son megabytes de geometría y JSON que no
explican nada del diseño y ensucian cualquier búsqueda.

Lo que sí vale indexar es `packages/ingest/src`, `apps/web/src`, `docs/` y `CLAUDE.md`.
