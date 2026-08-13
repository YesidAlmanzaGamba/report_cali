# Registro de versiones

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado: [SemVer](https://semver.org/lang/es/).

---

## [1.0.0] — 2026-08-13

Primera versión publicada. El mapa lleva días en uso durante la emergencia; esta etiqueta
marca el punto en que está en los dos orígenes previstos y con las decisiones de
despliegue cerradas.

### En vivo

| | |
|---|---|
| Sitio | <https://report-cali.camiloalmanzis.workers.dev> |
| Espejo | <https://yesidalmanzagamba.github.io/report_cali/> |

### Lo que hace

- **Intensidad por municipio.** ShakeMap del USGS cruzado con los 1.122 municipios
  (DIVIPOLA), con la paleta oficial del USGS (ADR-009) y sin proveedor externo de teselas
  (ADR-010).
- **Cifras con procedencia.** Toda cifra lleva fuente, hora de corte y antigüedad
  (ADR-003). El historial de git es la trazabilidad (ADR-004).
- **Ficha por municipio** con tres caras: impacto reportado, qué dice la alcaldía y ayuda
  cercana. Abre por la primera cara que tenga contenido.
- **Trama urbana del DANE** para 439 municipios, pedida de una en una al tocar: mediana
  de 1,0 KB comprimidos.
- **Puntos de reporte**: 107 municipios con boletín oficial o cifras propias,
  dimensionados por gravedad y con interruptor para quitarlos de encima del mapa.
- **Exportación CSV con etiquetas HXL** para OCHA/HDX.
- **Funciona sin JavaScript**: la tabla y las cifras se generan en compilación.

### Fuentes

- USGS (evento, malla de intensidad, réplicas, modelo de deslizamientos)
- COD-AB de OCHA para los límites administrativos
- **Alcaldías municipales** vía la API compartida de MiColombiaDigital (MinTIC) —
  **103 municipios con boletín oficial**, y para 54 de ellos es la única fuente que existe
- Prensa regional por feeds propios, más Google Noticias
- Cifras curadas a mano desde boletines oficiales — **13 municipios con cifra propia**

### Decisiones de esta versión

- **ADR-013** — una fuente puede no llevar enlace si dice cómo comprobarla (la radio
  local, en municipios sin prensa).
- **ADR-014** — **R2 no se habilita.** Los datos viajan como activos estáticos del
  Worker. Medido: sin `main` no hay invocaciones de código, así que el tráfico es gratis
  e ilimitado y el tope de 100.000 peticiones diarias no aplica. R2 mejora la ruta de
  escritura, no la de lectura.

### Límites conocidos, dichos en voz alta

- **No hay puntos de daño con coordenada.** Los boletines municipales no las traen, y no
  se pueden deducir: de los cuatro centros de acopio que nombran con nombre propio,
  Nominatim no encuentra ninguno. Los puntos del mapa significan «aquí hay información»,
  no «aquí cayó un edificio».
- **`curated/incidentes.json` está vacío.** No hay ni un incidente cartografiado; el
  camino para llenarlo es la recolección en campo (`docs/CAMPO.md`).
- **`people_affected` mezcla dos cosas.** El modelo de deslizamientos del USGS publica su
  población expuesta con esa métrica, así que gana cualquier orden por recencia. Está
  excluida de la tira del encabezado y el arreglo de fondo queda anotado en ROADMAP.
- **179 de 228 municipios golpeados no tienen prensa.** La cobertura mejoró con los
  boletines municipales, pero el hueco sigue siendo el techo del proyecto.

### Verificación

298 pruebas sin red, `astro check` y `tsc` limpios, y la barrera de datos personales
(`scripts/check-no-personal-data.sh`) en verde. La puerta se corre **después** de
fusionar, no solo sobre la rama.
