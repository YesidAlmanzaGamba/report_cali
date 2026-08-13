/**
 * `npm run alcaldias -w @report-cali/ingest`
 *
 * Recoge lo que las alcaldías han publicado sobre el sismo y escribe dos archivos con
 * destinos muy distintos:
 *
 * - `data/fuentes/alcaldias.json` — enlaces a actos y boletines oficiales, por municipio.
 *   Publicable: cada uno trae fuente, URL y fecha (ADR-003).
 * - `curated/cifras.sugeridas.json` — cifras vistas en el texto. **No publicable.**
 *   Es una bandeja de revisión: una persona las mira, decide y las registra a mano en
 *   `curated/observaciones.json`. Está en `.gitignore`, igual que las sugerencias de campo.
 *
 * No se mete en el cron todavía: son ~400 peticiones y conviene ver primero el resultado
 * de unas cuantas corridas a mano.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { recogerAlcaldias } from './sources/alcaldias.js';
import type { MunicipioRef } from './sources/noticias.js';
import { DATA_DIR, REPO_ROOT } from './paths.js';

/** Día del terremoto. Nada anterior entra. */
const SISMO = new Date('2026-08-10T00:00:00Z');

function argumento(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? porDefecto;
}

async function main(): Promise<void> {
  const umbral = Number(argumento('mmi', '5'));

  const mmi = JSON.parse(
    readFileSync(resolve(DATA_DIR, 'event/mmi-by-municipality.json'), 'utf8'),
  ) as { municipalities: { pcode: string; name: string; admin1_name: string; mmi: number }[] };

  const municipios: MunicipioRef[] = mmi.municipalities
    .filter((m) => m.mmi >= umbral)
    .sort((a, b) => b.mmi - a.mmi)
    .map((m) => ({ pcode: m.pcode, name: m.name, admin1_name: m.admin1_name }));

  console.log(`· ${municipios.length} municipios con MMI ≥ ${umbral}`);
  console.log('· Consultando MiColombiaDigital…');

  const r = await recogerAlcaldias({ desde: SISMO, municipios, concurrencia: 5, conTexto: true });

  const conPublicacion = new Set(r.publicaciones.map((p) => p.pcode));

  const salida = {
    generado: new Date().toISOString(),
    fuente: 'MiColombiaDigital (MinTIC) — API pública de los sitios municipales',
    nota:
      'Actos y boletines oficiales publicados por las propias alcaldías desde el sismo. ' +
      'Los avisos de notificación personal se descartan antes de entrar (ADR-001).',
    municipios_consultados: municipios.length,
    municipios_en_plataforma: r.enPlataforma.length,
    municipios_con_publicacion: conPublicacion.size,
    avisos_personales_descartados: r.avisosPersonalesDescartados,
    publicaciones: r.publicaciones.map(({ texto: _texto, ...resto }) => resto),
  };

  const destino = resolve(DATA_DIR, 'fuentes/alcaldias.json');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(salida, null, 2)}\n`);

  const sugerencias = {
    generado: new Date().toISOString(),
    _lee_esto_antes_de_usar:
      'CIFRAS SIN VERIFICAR, sacadas de prosa con patrones. NO se publican. Revísalas una ' +
      'a una contra su enlace y, si son correctas, regístralas a mano en ' +
      'curated/observaciones.json con su fuente y su hora. Ver ADR-003.',
    cifras: r.cifras,
  };
  const destinoCifras = resolve(REPO_ROOT, 'curated/cifras.sugeridas.json');
  writeFileSync(destinoCifras, `${JSON.stringify(sugerencias, null, 2)}\n`);

  console.log();
  console.log(`  en la plataforma           ${r.enPlataforma.length}`);
  console.log(`  con publicación del sismo  ${conPublicacion.size}`);
  console.log(`  publicaciones              ${r.publicaciones.length}`);
  console.log(`  avisos personales fuera    ${r.avisosPersonalesDescartados}  (ADR-001)`);
  console.log(`  cifras a revisar           ${r.cifras.length}`);
  console.log();
  console.log(`✓ ${destino}`);
  console.log(`✓ ${destinoCifras}  (sin versionar; revisar a mano)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
