export class HttpError extends Error {
  constructor(public status: number, public url: string, message?: string) {
    super(message ?? `HTTP ${status} for ${url.replace(/apiKey=[^&]+/, "apiKey=***")}`);
  }
}

export interface FetchResult<T> {
  data: T;
  headers: Headers;
}

/** fetch + JSON with a timeout and one retry on network/5xx errors. */
export async function fetchJson<T>(url: string, opts: { timeoutMs?: number; retries?: number } = {}): Promise<FetchResult<T>> {
  const { timeoutMs = 8000, retries = 1 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "nfl-prop-analytics/1.0" } });
      if (!res.ok) {
        const err = new HttpError(res.status, url);
        if (res.status >= 500 && attempt < retries) { lastErr = err; continue; }
        throw err;
      }
      return { data: (await res.json()) as T, headers: res.headers };
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status < 500) throw e;
      if (attempt >= retries) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Run async tasks with a concurrency limit, stopping new work after a deadline. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, deadline?: number): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      if (deadline && Date.now() > deadline) return;
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = undefined;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
