import type { Config } from "@netlify/functions";
import { getConfig } from "../../server/config";
import { readJSON, storageBackend, writeJSON } from "../../server/cache";
import { ESPN_HOSTS } from "../../server/providers/espn";

/**
 * Connection check for every data source. Reports HTTP status codes only;
 * never returns API keys or response bodies.
 */
interface Check { name: string; ok: boolean; status: string; detail: string; ms: number }

const HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

async function probe(name: string, url: string, detailOk: (res: Response) => string = () => "Connected"): Promise<Check> {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    const ok = res.ok;
    return {
      name, ok, status: `HTTP ${res.status}`, ms: Date.now() - t,
      detail: ok ? detailOk(res)
        : res.status === 401 ? "Unauthorized: the API key is wrong or inactive"
        : res.status === 403 ? "Refused by the provider (blocked request)"
        : res.status === 429 ? "Rate limited / out of credits"
        : "Provider returned an error",
    };
  } catch (e) {
    return { name, ok: false, status: "No response", detail: (e as Error).message, ms: Date.now() - t };
  }
}

export default async () => {
  const cfg = getConfig();
  const checks: Check[] = [];
  for (const host of ESPN_HOSTS) {
    checks.push(await probe(`ESPN schedule (${new URL(host).host})`, `${host}/apis/site/v2/sports/football/nfl/scoreboard`));
  }
  checks.push(await probe("ESPN teams/rosters", `${ESPN_HOSTS[0]}/apis/site/v2/sports/football/nfl/teams`));
  checks.push(await probe("ESPN injuries", `${ESPN_HOSTS[0]}/apis/site/v2/sports/football/nfl/injuries`));
  if (cfg.oddsApiKey) {
    // The /sports list does not use credits.
    const c = await probe("The Odds API (player props)", `https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(cfg.oddsApiKey)}`,
      (res) => `Key accepted. Credits remaining: ${res.headers.get("x-requests-remaining") ?? "unknown"}`);
    checks.push(c);
  } else {
    checks.push({ name: "The Odds API (player props)", ok: false, status: "Not configured", detail: "ODDS_API_KEY is not set in Netlify environment variables", ms: 0 });
  }
  checks.push(await probe("Open-Meteo (weather)", "https://api.open-meteo.com/v1/forecast?latitude=41.86&longitude=-87.62&hourly=temperature_2m&forecast_days=1"));

  const t = Date.now();
  try {
    const stamp = new Date().toISOString();
    await writeJSON("diagnostics/ping", stamp);
    const back = await readJSON<string>("diagnostics/ping");
    const backend = storageBackend();
    checks.push({ name: "Netlify Blobs (storage)", ok: backend === "blobs" && back?.value === stamp, status: backend, ms: Date.now() - t,
      detail: backend === "blobs" ? "Read/write OK" : "Blobs unavailable; using temporary memory (data resets)" });
  } catch (e) {
    checks.push({ name: "Netlify Blobs (storage)", ok: false, status: "Error", detail: (e as Error).message, ms: Date.now() - t });
  }

  return new Response(JSON.stringify({ checkedAt: new Date().toISOString(), checks }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};

export const config: Config = { path: "/api/diagnostics" };
