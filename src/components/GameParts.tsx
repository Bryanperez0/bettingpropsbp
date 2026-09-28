import { Link } from "react-router-dom";
import type { Game, GameLines, InjuryItem, WeatherInfo } from "../../shared/types";
import { fmtKickoff, fmtOdds, fmtSigned, fmtTime } from "../utils/format";
import { TeamLogo, PlayerAvatar } from "./Media";
import { Pill, Unavailable } from "./ui";

export function WeatherBadge({ w, detailed = false }: { w: WeatherInfo | null; detailed?: boolean }) {
  if (!w || w.status === "unavailable") return <Unavailable what="Weather" />;
  if (w.indoor) return <Pill className="bg-surface-3 text-ink-2">Indoor / dome — weather not applied</Pill>;
  const windy = (w.windMph ?? 0) >= 15;
  const wet = (w.precipProb ?? 0) >= 60;
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink">{w.conditions ?? "—"}</span>
        {w.tempF !== null && <span className="num text-ink-2">{Math.round(w.tempF)}°F</span>}
        {w.windMph !== null ? (
          <span className={`num ${windy ? "font-semibold text-moderate" : "text-ink-2"}`}>Wind {Math.round(w.windMph)} mph{w.windGustMph ? ` (gusts ${Math.round(w.windGustMph)})` : ""}</span>
        ) : (
          <span className="text-xs italic text-ink-3">wind unavailable</span>
        )}
        {w.precipProb !== null && <span className={`num ${wet ? "font-semibold text-moderate" : "text-ink-2"}`}>Precip {w.precipProb}%</span>}
      </div>
      {detailed && (
        <p className="mt-1 text-xs text-ink-3">
          {w.source}{w.fetchedAt ? `, updated ${fmtTime(w.fetchedAt)}` : ""}{w.note ? ` · ${w.note}` : ""}
          {windy || wet ? " · Model applies a passing adjustment." : " · Conditions not strong enough to change projections."}
        </p>
      )}
    </div>
  );
}

export function spreadText(lines: GameLines, home: string, away: string): string {
  if (lines.homeSpread === null) return "—";
  if (lines.homeSpread === 0) return "PK";
  return lines.homeSpread < 0 ? `${home} ${lines.homeSpread}` : `${away} ${-lines.homeSpread}`;
}

export function GameCard({ g, propCount }: { g: Game; propCount?: number }) {
  const live = g.state === "in";
  return (
    <Link to={`/games/${g.id}`} className="block rounded-xl border border-line bg-surface p-4 transition hover:border-ink-3 hover:bg-surface-2">
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{g.state === "pre" ? fmtKickoff(g.date) : g.statusDetail}</span>
        {live && <Pill className="bg-negative/15 text-negative">LIVE</Pill>}
        {g.state === "post" && <Pill className="bg-surface-3 text-ink-3">Final</Pill>}
      </div>
      {[g.away, g.home].map((t, i) => (
        <div key={t.abbr} className="mt-2 flex items-center gap-2">
          <TeamLogo abbr={t.abbr} src={t.logo} size={26} />
          <span className="font-semibold text-ink">{t.abbr}</span>
          <span className="text-xs text-ink-3">{t.record ?? ""}</span>
          <span className="num ml-auto font-semibold">{i === 0 ? g.awayScore ?? "" : g.homeScore ?? ""}</span>
        </div>
      ))}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
        <div><div className="text-ink-3">Spread</div><div className="num text-ink">{spreadText(g.lines, g.home.abbr, g.away.abbr)}</div></div>
        <div><div className="text-ink-3">Total</div><div className="num text-ink">{g.lines.total ?? "—"}</div></div>
        {propCount !== undefined && <div><div className="text-ink-3">Props</div><div className="num text-ink">{propCount}</div></div>}
      </div>
      <div className="mt-2 text-xs">
        {g.weather?.indoor ? <span className="text-ink-3">Indoor</span> : g.weather && g.weather.windMph !== null ? (
          <span className={(g.weather.windMph ?? 0) >= 15 ? "text-moderate" : "text-ink-3"}>{g.weather.conditions}, wind {Math.round(g.weather.windMph)} mph</span>
        ) : <span className="text-ink-3">{g.venue.name ?? ""}</span>}
      </div>
    </Link>
  );
}

export function LinesTable({ g }: { g: Game }) {
  const L = g.lines;
  const row = (label: string, open: string, cur: string, move?: string) => (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-3 text-ink-2">{label}</td>
      <td className="num py-1.5 pr-3">{open}</td>
      <td className="num py-1.5 pr-3 font-semibold">{cur}</td>
      <td className="num py-1.5 text-ink-3">{move ?? ""}</td>
    </tr>
  );
  if (L.homeSpread === null && L.total === null && L.homeMoneyline === null) return <Unavailable what="Game lines" />;
  return (
    <div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1 font-medium">Market</th><th className="font-medium">Open</th><th className="font-medium">Current</th><th className="font-medium">Move</th></tr></thead>
        <tbody>
          {row(`Spread (${g.home.abbr})`, L.homeSpreadOpen === null ? "—" : fmtSigned(L.homeSpreadOpen, 1), L.homeSpread === null ? "—" : fmtSigned(L.homeSpread, 1),
            L.homeSpread !== null && L.homeSpreadOpen !== null ? fmtSigned(L.homeSpread - L.homeSpreadOpen, 1) : undefined)}
          {row("Total", L.totalOpen === null ? "—" : String(L.totalOpen), L.total === null ? "—" : String(L.total),
            L.total !== null && L.totalOpen !== null ? fmtSigned(L.total - L.totalOpen, 1) : undefined)}
          {row(`Moneyline ${g.away.abbr}`, fmtOdds(L.awayMoneylineOpen), fmtOdds(L.awayMoneyline))}
          {row(`Moneyline ${g.home.abbr}`, fmtOdds(L.homeMoneylineOpen), fmtOdds(L.homeMoneyline))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-3">Source: {L.provider ?? "—"} via ESPN. Movement is informational, not evidence of "sharp money."</p>
    </div>
  );
}

const statusTone = (s: string) =>
  /out|reserve|suspen/i.test(s) ? "bg-negative/15 text-negative" : /doubtful/i.test(s) ? "bg-under/15 text-under" : /questionable/i.test(s) ? "bg-moderate/15 text-moderate" : "bg-surface-3 text-ink-2";

export function InjuryStatus({ status }: { status: string }) {
  return <Pill className={statusTone(status)}>{status}</Pill>;
}

export function InjuryTable({ items, showTeam = false, empty = "No injuries reported." }: { items: InjuryItem[]; showTeam?: boolean; empty?: string }) {
  if (!items.length) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-ink-3">
            <th className="py-1.5 pr-3 font-medium">Player</th>
            {showTeam && <th className="py-1.5 pr-3 font-medium">Team</th>}
            <th className="py-1.5 pr-3 font-medium">Pos</th>
            <th className="py-1.5 pr-3 font-medium">Status</th>
            <th className="py-1.5 pr-3 font-medium">Injury</th>
            <th className="py-1.5 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.team}-${i.playerId}-${i.name}`} className="border-t border-line align-top">
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-2">
                  <PlayerAvatar name={i.name} src={i.headshot} size={24} />
                  {i.playerId ? <Link to={`/players/${i.playerId}`} className="text-ink hover:text-over">{i.name}</Link> : i.name}
                </div>
                {i.comment && <p className="mt-0.5 max-w-md text-xs text-ink-3">{i.comment}</p>}
              </td>
              {showTeam && <td className="py-1.5 pr-3"><span className="inline-flex items-center gap-1"><TeamLogo abbr={i.team} size={16} />{i.team}</span></td>}
              <td className="py-1.5 pr-3 text-ink-2">{i.position ?? "—"}</td>
              <td className="py-1.5 pr-3"><InjuryStatus status={i.status} /></td>
              <td className="py-1.5 pr-3 text-ink-2">{[i.injury, i.detail].filter(Boolean).join(" · ") || "—"}</td>
              <td className="num py-1.5 text-xs text-ink-3">{fmtTime(i.updated)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
