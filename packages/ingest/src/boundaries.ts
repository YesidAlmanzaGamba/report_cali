/**
 * Construye los límites administrativos. Se ejecuta a mano, NO en el cron.
 *
 *   npm run boundaries              # descarga desde HDX (117 MB)
 *   npm run boundaries -- --zip ./col.zip   # usa un zip ya descargado
 *
 * Los límites municipales no cambian durante un desastre. Bajar 117 MB cada 15 minutos
 * para reconstruir una geometría idéntica sería maltratar un servicio público que en este
 * momento está bajo carga.
 *
 * Solo se versiona la versión simplificada. La geometría a resolución completa son
 * ~150 MB de GeoJSON: volvería el repositorio inclonable para quien quiera contribuir, y
 * es reproducible desde HDX en cualquier momento con este mismo comando.
 */
import { readFile } from 'node:fs/promises';

import { CODAB_SOURCE, fetchBoundaries, simplifyPreservingTopology } from './sources/codab.js';
import { writeJson, writeTopoJson } from './persist.js';
import { DATA_DIR } from './paths.js';

/**
 * Proporción de puntos conservados. 4 % mantiene los municipios reconocibles a escala
 * nacional y deja el archivo dentro del presupuesto de 300 KB comprimidos.
 * Los departamentos toleran menos detalle: se dibujan solo como contorno de referencia.
 */
const MUNICIPIO_RETENTION = 0.04;
const DEPARTAMENTO_RETENTION = 0.06;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const zipPath = argValue('--zip');

  if (zipPath) {
    console.log(`· Usando zip local: ${zipPath}`);
  } else {
    console.log('· Descargando COD-AB desde HDX (117 MB, puede tardar varios minutos)…');
  }

  const zip = zipPath ? new Uint8Array(await readFile(zipPath)) : undefined;
  const { municipios, departamentos } = await fetchBoundaries(zip);

  console.log(
    `· Leídos ${municipios.features.length} municipios y ${departamentos.features.length} departamentos`,
  );

  console.log('· Simplificando (preservando topología)…');
  const municipiosTopo = simplifyPreservingTopology(municipios, MUNICIPIO_RETENTION);
  const departamentosTopo = simplifyPreservingTopology(departamentos, DEPARTAMENTO_RETENTION);

  const results = [
    await writeTopoJson(DATA_DIR, 'boundaries/municipios', municipiosTopo),
    await writeTopoJson(DATA_DIR, 'boundaries/departamentos', departamentosTopo),
    await writeJson(DATA_DIR, 'boundaries/meta', {
      source: CODAB_SOURCE,
      generated_at: new Date().toISOString(),
      municipio_count: municipios.features.length,
      departamento_count: departamentos.features.length,
      format: 'TopoJSON — arcos compartidos y coordenadas cuantizadas',
      simplification: {
        method: 'topojson-simplify (Visvalingam, topología preservada)',
        municipio_retention: MUNICIPIO_RETENTION,
        departamento_retention: DEPARTAMENTO_RETENTION,
      },
      license: 'CC-BY-IGO 3.0 — OCHA / DANE',
    }),
  ];

  for (const r of results) {
    console.log(`  ${r.changed ? '✎ escrito' : '· sin cambios'}  ${r.path}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
