import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { PlayerGameLog, PropMarket } from "../../shared/types";
import type { PlayerPropRef } from "../../shared/api";
import { MARKETS } from "../../shared/model/markets";
import { RANGES, defaultLine, filterLogs, marketsForPosition, summarizeView, type RangeKey, type SplitKey } from "../../shared/explorer";
import { TrendChart } from "../charts/TrendChart";
import { fmtFixed, fmtPct } from "../utils/format";

interface Props {
  logs: PlayerGameLog[];
  season: number;
  position: string;
  /** Sportsbook props this player has this week (lines to grade against). */
  playerProps: PlayerPropRef[];
  initialMarket?: PropMarket;
  /** This week's opponent, enabling the "vs. opponent" filter. */
  opponent: string | null;
  /** Prop page being viewed, so we don't link to itself. */
  currentPropId?: string;
}

const pill = (active: boolean) =>
  `whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2"}`;

/**
 * Interactive game-by-game chart: pick the prop type, the games (range,
 * home/away, vs. opponent) and the line. Changing the view only changes what
 * is shown here — the model's projection and confidence are unaffected.
 */
export function PropExplorer({ logs, season, position, playerProps, initialMarket, opponent, currentPropId }: Props) {
  const markets = useMemo(() => {
    const base = marketsForPosition(position);
    // Also offer any market the books list for him that isn't in the default set.
    const extra = playerProps.map((p) => p.market).filter((m) => !base.includes(m));
    return [...base, ...extra];
  }, [position, playerProps]);

  const [market, setMarket] = useState<PropMarket>(initialMarket ?? playerProps[0]?.market ?? markets[0]);
  const [range, setRange] = useState<RangeKey>("l10");
  const [split, setSplit] = useState<SplitKey>("all");
  const [vsOpp, setVsOpp] = useState(false);
  const [customLine, setCustomLine] = useState("");

  const bookProp = playerProps.find((p) => p.market === market) ?? null;
  const fallbackLine = useMemo(() => defaultLine(logs, market), [logs, market]);
  const baseLine = market === "anytime_td" ? 0.5 : bookProp?.line ?? fallbackLine;
  const parsed = Number(customLine);
  const usingCustom = customLine.trim() !== "" && Number.isFinite(parsed) && market !== "anytime_td";
  const line = usingCustom ? parsed : baseLine;

  const games = useMemo(
    () => filterLogs(logs, { range, split, opponent: vsOpp ? opponent : null, season }),
    [logs, range, split, vsOpp, opponent, season],
  );
  const view = useMemo(() => summarizeView(games, market, line), [games, market, line]);
  const isTd = market === "anytime_td";
  const unit = isTd ? "TDs" : MARKETS[market].label.toLowerCase();

  const changeMarket = (m: PropMarket) => {
    setMarket(m);
    setCustomLine("");
  };

  return (
    <div>
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="explorer-market">Prop type</label>
        <select id="explorer-market" value={market} onChange={(e) => changeMarket(e.target.value as PropMarket)}
          className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink">
          {markets.map((m) => {
            const bp = playerProps.find((p) => p.market === m);
            return <option key={m} value={m}>{MARKETS[m].label}{bp && m !== "anytime_td" ? ` (line ${bp.line})` : ""}</option>;
          })}
        </select>
        <div className="scrollbar-thin flex overflow-x-auto rounded-lg border border-line p-0.5" role="group" aria-label="Games to show">
          {RANGES.map((r) => <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={range === r.key} className={pill(range === r.key)}>{r.label}</button>)}
        </div>
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Home or away">
          {(["all", "home", "away"] as SplitKey[]).map((s) => (
            <button key={s} onClick={() => setSplit(s)} aria-pressed={split === s} className={pill(split === s)}>{s === "all" ? "Home & away" : s === "home" ? "Home" : "Away"}</button>
          ))}
        </div>
        {opponent && (
          <label className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-2">
            <input type="checkbox" checked={vsOpp} onChange={(e) => setVsOpp(e.target.checked)} /> vs {opponent} only
          </label>
        )}
        {!isTd && (
          <label className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-2">
            Line
            <input type="number" step={0.5} min={0} inputMode="decimal" value={usingCustom ? customLine : ""} placeholder={String(baseLine)}
              onChange={(e) => setCustomLine(e.target.value)} aria-label="Custom line"
              className="num w-16 rounded bg-surface-2 px-1.5 py-0.5 text-right text-ink placeholder:text-ink-3" />
            {usingCustom && <button onClick={() => setCustomLine("")} className="text-over hover:underline">reset</button>}
          </label>
        )}
      </div>

      {/* Where the line comes from */}
      <p className="mb-2 text-xs text-ink-3">
        {isTd ? "Graded as scored / did not score." :
          usingCustom ? `Custom line ${line} (sportsbook: ${bookProp ? bookProp.line : "none"}).` :
          bookProp ? `Sportsbook line ${bookProp.line}.` :
          `No sportsbook line this week, so the chart uses his recent median (${fallbackLine}). Type your own line to change it.`}
        {bookProp && bookProp.id !== currentPropId && (
          <> <Link to={`/props/${encodeURIComponent(bookProp.id)}`} className="text-over hover:underline">Open the full {MARKETS[market].label} analysis →</Link></>
        )}
      </p>

      {/* Summary for the selected games */}
      {view.games ? (
        <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className="rounded-lg bg-surface-2 py-1.5"><div className="text-[10px] uppercase tracking-wide text-ink-3">{isTd ? "Scored" : `Over ${line}`}</div>
            <div className="num text-sm font-semibold text-over">{view.over}/{view.over + view.under} · {fmtPct(view.overPct)}</div></div>
          <div className="rounded-lg bg-surface-2 py-1.5"><div className="text-[10px] uppercase tracking-wide text-ink-3">{isTd ? "No TD" : `Under ${line}`}</div>
            <div className="num text-sm font-semibold text-under">{view.under}/{view.over + view.under} · {fmtPct(view.underPct)}</div></div>
          <div className="rounded-lg bg-surface-2 py-1.5"><div className="text-[10px] uppercase tracking-wide text-ink-3">Average</div>
            <div className="num text-sm font-semibold">{fmtFixed(view.average)}</div></div>
          <div className="rounded-lg bg-surface-2 py-1.5"><div className="text-[10px] uppercase tracking-wide text-ink-3">Median</div>
            <div className="num text-sm font-semibold">{fmtFixed(view.median)}</div></div>
        </div>
      ) : null}

      <TrendChart history={view.history} line={line} unitLabel={unit} />
      <p className="mt-2 text-xs text-ink-3">
        {view.games} game{view.games === 1 ? "" : "s"} shown{view.pushes ? `, ${view.pushes} push${view.pushes === 1 ? "" : "es"}` : ""}. Changing these views doesn't change the model's projection or confidence score.
      </p>
    </div>
  );
}
