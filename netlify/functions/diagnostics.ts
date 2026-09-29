import type { Config } from "@netlify/functions";
import { getConfig } from "../../server/config";
import { readJSON, storageHealth, writeJSON } from "../../server/cache";
import { ESPN_HOSTS } from "../../server/providers/espn";
import { fetchSgoUsage } from "../../server/providers/sportsGameOdds";
import { HttpError } from "../../server/http";

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
  // Every ESPN feed the app uses, on both hosts. The app needs each feed to
  // work on at least one host; it automatically uses whichever works.
  const feeds: [string, string][] = [
    ["schedule", "scoreboard"],
    ["teams", "teams"],
    ["roster", "teams/3/roster"],
    ["injuries", "injuries"],
    ["box score", "summary?event=401872929"],
  ];
  const espn = await Promise.all(feeds.flatMap(([label, path]) => ESPN_HOSTS.map((host) =>
    probe(`ESPN ${label} (${new URL(host).host})`, `${host}/apis/site/v2/sports/football/nfl/${path}`))));
  for (let i = 0; i < feeds.length; i++) {
    const pair = espn.slice(i * ESPN_HOSTS.length, (i + 1) * ESPN_HOSTS.length);
    const anyOk = pair.some((c) => c.ok);
    checks.push({
      name: `ESPN ${feeds[i][0]}`,
      ok: anyOk || feeds[i][0] === "injuries",
      status: pair.map((c) => `${c.name.match(/\((.*)\)/)?.[1]}: ${c.status}`).join(" · "),
      detail: anyOk ? "Available (app uses whichever host works)"
        : feeds[i][0] === "injuries" ? "League feed blocked; app falls back to per-game injury reports from box-score feed"
        : "Blocked on both hosts",
      ms: Math.max(...pair.map((c) => c.ms)),
    });
  }
  if (cfg.sgoApiKey) {
    // The usage endpoint does not use monthly objects.
    const t0 = Date.now();
    try {
      const u = await fetchSgoUsage(cfg.sgoApiKey);
      checks.push({
        name: "SportsGameOdds (player props)", ok: u.active !== false, status: u.active === false ? "Inactive key" : "HTTP 200", ms: Date.now() - t0,
        detail: u.active === false ? "Key found but not active" :
          `Key accepted${u.tier ? ` (${u.tier} plan)` : ""}. Objects used this month: ${u.monthUsed ?? "unknown"}${u.monthMax ? ` of ${u.monthMax.toLocaleString("en-US")}` : ""}`,
      });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : null;
      checks.push({
        name: "SportsGameOdds (player props)", ok: false, status: status ? `HTTP ${status}` : "No response", ms: Date.now() - t0,
        detail: status === 401 ? "Unauthorized: the API key is wrong or inactive" : status === 429 ? "Rate limited / monthly limit reached" : status ? "Provider returned an error" : (e as Error).message,
      });
    }
  } else {
    checks.push({ name: "SportsGameOdds (player props)", ok: false, status: "Not configured", detail: "SPORTSGAMEODDS_API_KEY is not set in Netlify environment variables", ms: 0 });
  }
  if (cfg.oddsApiKey) {
    // The /sports list does not use credits.
    const c = await probe(cfg.sgoApiKey ? "The Odds API (backup props)" : "The Odds API (player props)", `https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(cfg.oddsApiKey)}`,
      (res) => `Key accepted. Credits remaining: ${res.headers.get("x-requests-remaining") ?? "unknown"}`);
    checks.push(c);
  } else {
    checks.push({ name: "The Odds API (backup props)", ok: !!cfg.sgoApiKey, status: "Not configured", detail: cfg.sgoApiKey ? "Optional backup; ODDS_API_KEY is not set" : "ODDS_API_KEY is not set in Netlify environment variables", ms: 0 });
  }
  checks.push(await probe("Open-Meteo (weather)", "https://api.open-meteo.com/v1/forecast?latitude=41.86&longitude=-87.62&hourly=temperature_2m&forecast_days=1"));

  const t = Date.now();
  try {
    const stamp = new Date().toISOString();
    await writeJSON("diagnostics/ping", stamp);
    const back = await readJSON<string>("diagnostics/ping");
    const h = storageHealth();
    checks.push({ name: "Netlify Blobs (storage)", ok: h.backend === "blobs" && back?.value === stamp, status: h.backend, ms: Date.now() - t,
      detail: (h.backend === "blobs" ? "Read/write OK" : "Blobs unavailable; using temporary memory (data resets)") +
        (h.readErrors || h.writeErrors ? `. This server copy has seen ${h.readErrors} read / ${h.writeErrors} write errors; last: ${h.lastError}` : "") });
  } catch (e) {
    checks.push({ name: "Netlify Blobs (storage)", ok: false, status: "Error", detail: (e as Error).message, ms: Date.now() - t });
  }

  return new Response(JSON.stringify({ checkedAt: new Date().toISOString(), checks }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};

export const config: Config = { path: "/api/diagnostics" };
