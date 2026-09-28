import type { Config } from "@netlify/functions";
import { buildAnalysis } from "../../server/services/analysis";

/**
 * Runs every 15 minutes on the published deploy: keeps the analysis fresh,
 * continues loading box scores, logs new recommendations, grades finished ones.
 */
export default async () => {
  const s = await buildAnalysis(24_000);
  console.log(`refresh: week ${s.week}, ${s.props.length} props analyzed, ${s.stats.datasetPending} games pending`);
};

export const config: Config = { schedule: "*/15 * * * *" };
