/**
 * `npm run campo -- <archivo.csv>`
 *
 * Lee el CSV exportado de la hoja de captura y escribe
 * `curated/incidentes.sugeridos.json` para que una persona lo revise.
 *
 * **No toca `curated/incidentes.json`.** Eso lo hace una persona, a mano, tras leer las
 * sugerencias; y ese commit es el acto de publicación. Ver `docs/CAMPO.md`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

import { aSugerencias, leerCsv } from './campo.js';
import { DATA_DIR, REPO_ROOT } from './paths.js';
import { topologyToFeatures, type MunicipioProperties, type SimplifiedTopology } from './sources/codab.js';

const SALIDA = resolve(REPO_ROOT, 'curated', 'incidentes.sugeridos.json');

async function main(): Promise<void> {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Uso: npm run campo -- <archivo.csv>');
    console.error('El CSV se exporta desde la hoja de captura. Ver docs/CAMPO.md.');
    process.exitCode = 1;
    return;
  }

  const csv = await readFile(resolve(process.cwd(), archivo), 'utf8').catch(() => {
    throw new Error(`No se pudo leer ${archivo}`);
  });

  const topo = JSON.parse(
    await readFile(`${DATA_DIR}/boundaries/municipios.topojson`, 'utf8'),
  ) as SimplifiedTopology;
  const municipios = topologyToFeatures<MunicipioProperties>(topo);
  const porPcode = new Map(municipios.features.map((f) => [f.properties.pcode, f]));

  const { sugerencias, rechazos } = aSugerencias(leerCsv(csv), {
    municipios: municipios.features.map((f) => ({
      pcode: f.properties.pcode,
      name: f.properties.name,
      admin1_name: f.properties.admin1_name,
    })),
    dentroDe: (pcode, lon, lat) => {
      const f = porPcode.get(pcode);
      return f === undefined ? false : booleanPointInPolygon([lon, lat], f as never);
    },
  });

  await writeFile(
    SALIDA,
    `${JSON.stringify(
      {
        _lee_esto_antes_de_editar: [
          'Sugerencias de recolección en campo. NO son datos publicados.',
          'Revísalas una por una y mueve las buenas a curated/incidentes.json.',
          'La casilla `foto` y la casilla `revisar` son para ti: NO van en el archivo curado.',
          'Todo sale con verificado:false, así que se publicará recortado a 100 m (ADR-012).',
        ],
        generado: new Date().toISOString(),
        sugerencias,
        rechazos,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\n${sugerencias.length} sugerencias · ${rechazos.length} filas rechazadas`);
  console.log(`Escrito en curated/incidentes.sugeridos.json\n`);

  const conDudas = sugerencias.filter((s) => s.revisar);
  if (conDudas.length > 0) {
    console.log(`⚠ ${conDudas.length} con el punto fuera del municipio declarado:`);
    for (const s of conDudas) console.log(`   ${s.pcode}  ${s.descripcion.slice(0, 60)}`);
    console.log();
  }

  if (rechazos.length > 0) {
    console.log('Filas que hay que arreglar en la hoja:');
    for (const r of rechazos) console.log(`   fila ${r.fila}: ${r.motivo}`);
    console.log();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
