import type { Config } from "@netlify/functions";
import { handle, json } from "../../server/respond";
import { readLedger, summarize, TRACK_MIN_CONFIDENCE } from "../../server/services/tracking";
import { storageBackend } from "../../server/cache";

export default handle(async () => {
  const ledger = await readLedger();
  const warnings = storageBackend() === "memory" ? ["Netlify Blobs unavailable: tracked picks are not being persisted in this environment."] : [];
  return json({ summary: summarize(ledger), trackMinConfidence: TRACK_MIN_CONFIDENCE }, { warnings, maxAge: 120 });
});

export const config: Config = { path: "/api/performance" };
