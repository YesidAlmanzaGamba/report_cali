/**
 * Cliente HTTP del pipeline.
 *
 * Nos identificamos siempre. Estamos consumiendo servicios públicos de entidades que en
 * este momento están bajo carga por la emergencia; un User-Agent con enlace al proyecto
 * le permite a quien opera esos servidores saber quién los está llamando y contactarnos
 * si hay que bajar la frecuencia.
 */
export const USER_AGENT =
  'report-cali/0.1 (mapa de situación terremoto Colombia 2026; +https://github.com/report-cali)';

/** Identificador exigido por la API de ReliefWeb (parámetro `appname`). */
export const APP_NAME = 'report-cali';

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status} en ${url}${body ? `\n${body.slice(0, 500)}` : ''}`);
    this.name = 'HttpError';
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const DEFAULTS = { timeoutMs: 30_000, retries: 3 } as const;

/** Espera con retroceso exponencial: 1 s, 2 s, 4 s… */
const backoff = (attempt: number) => new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));

/**
 * `fetch` con tiempo límite y reintentos.
 *
 * Reintenta ante fallo de red y ante 5xx/429, porque en emergencia los servidores
 * oficiales se caen a ratos y una corrida perdida del cron es una hora de datos vieja.
 * NO reintenta ante 4xx: un 404 no mejora insistiendo, y un 403 suele significar que
 * falta un parámetro (le pasa a ReliefWeb con `appname`).
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULTS.timeoutMs, retries = DEFAULTS.retries, headers = {} } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await backoff(attempt - 1);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return response;

      const retryable = response.status >= 500 || response.status === 429;
      const body = await response.text().catch(() => '');
      lastError = new HttpError(url, response.status, body);

      if (!retryable) throw lastError;
    } catch (error) {
      if (error instanceof HttpError && error.status < 500 && error.status !== 429) throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Falló la descarga de ${url}`);
}

export async function fetchJson<T = unknown>(url: string, options?: FetchOptions): Promise<T> {
  const response = await fetchWithRetry(url, options);
  return (await response.json()) as T;
}

export async function fetchBuffer(url: string, options?: FetchOptions): Promise<Uint8Array> {
  const response = await fetchWithRetry(url, options);
  return new Uint8Array(await response.arrayBuffer());
}
