import type { ApiEnvelope, SourceMeta } from "../shared/types";

export function json<T>(data: T, opts: { sources?: SourceMeta[]; warnings?: string[]; maxAge?: number; status?: number } = {}): Response {
  const body: ApiEnvelope<T> = {
    data,
    sources: opts.sources ?? [],
    warnings: opts.warnings ?? [],
    generatedAt: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Short CDN cache; data freshness is tracked inside the payload.
      "cache-control": `public, max-age=0, s-maxage=${opts.maxAge ?? 60}, stale-while-revalidate=120`,
    },
  });
}

export function error(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Wrap a handler so unexpected errors become JSON (never leak env/config). */
export function handle(fn: (req: Request, params: Record<string, string>) => Promise<Response>) {
  return async (req: Request, context: { params?: Record<string, string> }) => {
    try {
      return await fn(req, context?.params ?? {});
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message.replace(/apiKey=[^&\s]+/g, "apiKey=***") : "Unknown error";
      return error(`Data temporarily unavailable: ${msg}`, 503);
    }
  };
}
