<!-- Gracias por contribuir. Puedes escribir en español o en inglés. -->

## Qué cambia

<!-- Una o dos frases. Si cierra un issue: "Cierra #123" -->

## Las cuatro reglas

Ver [`docs/DECISIONS.md`](../blob/main/docs/DECISIONS.md). Marca lo que aplique:

- [ ] No agrega datos personales de personas desaparecidas ni fallecidas (ADR-001)
- [ ] No hace scraping de redes sociales (ADR-002)
- [ ] Toda cifra nueva viaja en un `Observation` con `source` y `observed_at` (ADR-003)
- [ ] Si recolecta datos, son sobre **lugares**, no sobre personas (ADR-004)

## Verificación

- [ ] `npm run typecheck && npm test` pasa localmente
- [ ] Si toqué un adaptador: hay fixture grabado y la prueba **no usa la red**
- [ ] Si toqué el mapa: probado en móvil o con red limitada a 3G lento
- [ ] Si agregué una fuente: está documentada en `docs/DATA_SOURCES.md` con su licencia

## Notas para quien revisa

<!-- Dudas, decisiones que tomaste, cosas que quieres que miren con lupa -->
