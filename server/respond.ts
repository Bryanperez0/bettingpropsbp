import type { ApiEnvelope, SourceMeta } from "../shared/types";
import { isSignedIn } from "./auth";

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
      // Private: responses require sign-in, so a shared CDN copy would let
      // signed-out visitors read them. Data freshness is tracked in the payload.
      "cache-control": "private, no-store",
    },
  });
}

export function error(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Wrap a handler: rejects requests without a signed-in user, and turns
 * unexpected errors into JSON (never leak env/config).
 */
export function handle(fn: (req: Request, params: Record<string, string>) => Promise<Response>) {
  return async (req: Request, context: { params?: Record<string, string> }) => {
    if (!(await isSignedIn(req))) return error("Sign in to use Prop Lab.", 401);
    try {
      return await fn(req, context?.params ?? {});
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message.replace(/apiKey=[^&\s]+/g, "apiKey=***") : "Unknown error";
      return error(`Data temporarily unavailable: ${msg}`, 503);
    }
  };
}
