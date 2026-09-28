import type { ApiEnvelope } from "../../shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** All data comes from our own Netlify Functions; no provider keys in the browser. */
export async function api<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const res = await fetch(`/api/${path}`, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, res.status === 404 ? "API not found. Run the app with `netlify dev` so the functions are available." : `Unexpected response (${res.status})`);
  }
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string })?.error ?? `Request failed (${res.status})`);
  return body as ApiEnvelope<T>;
}
