import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio, desde `packages/ingest/src`. */
export const REPO_ROOT = resolve(here, '../../..');

/** Directorio `data/`, versionado a propósito (ADR-004). Lo escribe el robot. */
export const DATA_DIR = resolve(REPO_ROOT, 'data');

/** Cifras registradas a mano desde boletines. Lo escriben personas; el robot no lo toca. */
export const CURATED_FILE = resolve(REPO_ROOT, 'curated', 'observaciones.json');
