/**
 * Construye la geometría urbana por municipio. Se ejecuta a mano, NO en el cron.
 *
 *   npm run secciones -w @report-cali/ingest
 *   npm run secciones -w @report-cali/ingest -- --zip ./urb.zip --mmi 6.5
 *
 * Son 48 MB de descarga y la geografía urbana no cambia por un terremoto. Solo se
 * incluyen los municipios que de verdad se sacudieron: traer las 30.520 secciones del
 * país metería en el repositorio la geometría de ciudades donde no pasó nada.
 */
import { readFile } from 'node:fs/promises';

import { DATA_DIR } from './paths.js';
import { writeJson, writeTopoJson } from './persist.js';
import { simplifyPreservingTopology } from './sources/codab.js';
import { SECCIONES_SOURCE, fetchSecciones } from './sources/secciones.js';

/** Detalle suficiente para reconocer la trama urbana sin engordar el archivo. */
const RETENCION = 0.15;

function argumento(bandera: string): string | undefined {
  const i = process.argv.indexOf(bandera);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const umbral = Number(argumento('--mmi') ?? 6.5);
  const zipPath = argumento('--zip');

  const mmi = JSON.parse(
    await readFile(`${DATA_DIR}/event/mmi-by-municipality.json`, 'utf8'),
  ) as { municipalities: { pcode: string; name: string; mmi: number }[] };

  const objetivo = mmi.municipalities.filter((m) => m.mmi >= umbral);
  const pcodes = new Set(objetivo.map((m) => m.pcode));

  console.log(`· ${objetivo.length} municipios con MMI ≥ ${umbral}`);
  console.log(
    zipPath ? `· Usando zip local: ${zipPath}` : '· Descargando secciones urbanas (48 MB)…',
  );

  const zip = zipPath ? new Uint8Array(await readFile(zipPath)) : undefined;
  const porMunicipio = await fetchSecciones(pcodes, zip);

  console.log(`· ${porMunicipio.size} municipios tienen suelo urbano cartografiado`);
  console.log('· Simplificando…');

  const indice: { pcode: string; secciones: number }[] = [];
  let escritos = 0;

  for (const [pcode, coleccion] of porMunicipio) {
    const topo = simplifyPreservingTopology(coleccion, RETENCION);
    const resultado = await writeTopoJson(DATA_DIR, `secciones/${pcode}`, topo);

    if (resultado.changed) escritos++;
    indice.push({ pcode, secciones: coleccion.features.length });
  }

  indice.sort((a, b) => b.secciones - a.secciones);

  await writeJson(DATA_DIR, 'secciones/index', {
    generado: new Date().toISOString(),
    fuente: SECCIONES_SOURCE,
    nota: 'Secciones urbanas del DANE. NO traen nombre de barrio: el MGN solo publica códigos.',
    umbral_mmi: umbral,
    municipios: indice,
  });

  console.log(
    `✓ ${indice.length} municipios (${escritos} escritos). Mayor: ${indice[0]?.pcode} con ${indice[0]?.secciones} secciones.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
