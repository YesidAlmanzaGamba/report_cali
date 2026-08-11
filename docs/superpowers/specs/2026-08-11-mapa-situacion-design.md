# Diseño — Mapa de Situación, terremoto Colombia 2026-08-11

**Registro de diseño con fecha.** Es una foto del momento en que se decidió el rumbo.
La fuente viva de las decisiones y su porqué es [`../../DECISIONS.md`](../../DECISIONS.md);
si hay contradicción, manda ese archivo.

## Problema

M7.4 el 2026-08-10, 07:34 local, epicentro a 5 km de San José del Palmar (Chocó), ~110 km
de profundidad. USGS `us6000tjl2`, alerta roja. Seis departamentos afectados: Chocó, Valle
del Cauca, Risaralda, Quindío, Caldas y Antioquia. Daño mayor en Quibdó, Pereira,
Manizales, Armenia y Cali.

Las cifras oficiales están dispersas en boletines, PDF y visores ArcGIS. Nada legible por
máquina, nada cruzado geográficamente. La pregunta operativa —*qué municipios recibieron
el sacudimiento más fuerte y si las vías están transitables*— exige reconciliar cinco
fuentes a mano.

## Qué construimos

Un agregador de solo lectura que cruza ShakeMap del USGS, límites municipales COD-AB,
Copernicus EMSR916, ReliefWeb y UNGRD en una sola vista geoindexada, donde **toda cifra
lleva fuente y hora**.

**Usuario primario:** socorristas y organizaciones locales — bomberos, Defensa Civil,
voluntarios de Cruz Roja, alcaldías, grupos de base.

**Qué NO construimos:** un quinto registro de personas desaparecidas. Ver ADR-001.

## Arquitectura

Estático primero (ADR-004). Adaptadores en `packages/ingest/sources/`, cada uno con la
firma `fetchX(): Promise<Observation[]>`. Salida versionada en `data/`. GitHub Action cada
15 min hace commit solo si cambió el contenido. Front en Astro + MapLibre GL sobre mapa
base sin token.

Primitivo central: el envelope `Observation` (ADR-003) — `metric`, `value`, `pcode`,
`source`, `observed_at`, `ingested_at`.

## Capas del mapa

1. Coropleta de **MMI por municipio** (ADR-005) — la vista principal.
2. Epicentro y secuencia de réplicas, con línea de tiempo.
3. **Ground failure** — deslizamiento y licuefacción, leída como riesgo de acceso vial.
   Es la capa de mayor valor operativo para el usuario primario.
4. Observaciones por municipio con panel de fuente y antigüedad.
5. Polígonos de daño de Copernicus donde existan.

Presupuesto: < 300 KB gzip sin contar teselas. Español (es-CO) primero.

## Pruebas

Adaptadores contra fixtures grabados, sin red en CI. Validación con zod: si una fuente
rompe su contrato, falla ruidoso y conserva el último dato bueno. Uniones geográficas
verificadas contra valores conocidos (Quibdó, Pereira, Cali). Humo con Playwright.

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Andamiaje, licencia, docs, CI | — |
| 1 | Pipeline: esquema, COD-AB, USGS, unión geográfica | — |
| 2 | **Mapa v1 → primer despliegue público** | — |
| 3 | Observaciones por municipio + exportación CSV/GeoJSON/HXL | — |
| 4 | Ground failure + daño Copernicus | — |
| 5 | Registro de albergues y necesidades *(spec aparte)* | — |
| 6 | Capa de evidencia fotográfica *(spec aparte)* | — |

Las fases 5 y 6 se aplazan a propósito: abren ruta de escritura y carga de moderación que
un agregador de solo lectura no tiene (ADR-008).
