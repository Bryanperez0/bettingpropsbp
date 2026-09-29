import { Link } from "react-router-dom";
import type { SlimProp } from "../../shared/api";
import { fmtFixed, fmtKickoff, fmtOdds, fmtPct, fmtSigned, projectionText } from "../utils/format";
import { PlayerAvatar, TeamLogo } from "./Media";
import { ConfidenceMeter, HitRateGrid, SideBadge, TierBadge } from "./PropParts";
import { Pill } from "./ui";
import { LiveTracker, propHasStarted } from "./LiveTracker";
import { bestFor, useMyBooks } from "../hooks/useMyBooks";

export function PropCard({ p, rank }: { p: SlimProp; rank?: number }) {
  const isProb = p.unit === "prob";
  const { books: mine } = useMyBooks();
  const best = propHasStarted(p) ? null : bestFor(p.shop, mine);
  return (
    <Link to={`/props/${encodeURIComponent(p.id)}`} className="group block rounded-xl border border-line bg-surface p-4 transition hover:border-ink-3 hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-over">
      <div className="flex items-start gap-3">
        <div className="relative">
          <PlayerAvatar name={p.player.name} src={p.player.headshot} size={52} />
          {rank !== undefined && <span className="num absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-ink ring-1 ring-line">{rank}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold leading-tight text-ink group-hover:text-over">{p.player.name}</h3>
            <span className="text-xs text-ink-3">{p.player.position}</span>
            {p.player.injuryStatus && <Pill className="bg-moderate/10 text-moderate">{p.player.injuryStatus}</Pill>}
            {p.lineSource === "demo" && <Pill className="bg-fuchsia-500/15 text-fuchsia-300">DEMO LINE</Pill>}
            {propHasStarted(p) && <Pill className="bg-surface-3 text-ink-2" >Pregame pick</Pill>}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
            <TeamLogo abbr={p.player.team} size={16} />
            <span>{p.player.team}</span>
            <span>{p.isHome ? "vs" : "@"}</span>
            <TeamLogo abbr={p.opponent} size={16} />
            <span>{p.opponent}</span>
          </div>
          <div className="mt-0.5 text-xs text-ink-3">{fmtKickoff(p.kickoff)}</div>
        </div>
        <ConfidenceMeter value={p.confidence.total} tier={p.tier} />
      </div>

      {propHasStarted(p) && <div className="mt-3"><LiveTracker p={p} compact /></div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-2">{p.marketLabel}</span>
        <SideBadge side={p.side} label={p.sideLabel} />
        <span className="num text-xs text-ink-3">{fmtOdds(p.odds.side)}</span>
        <span className="ml-auto"><TierBadge tier={p.tier} /></span>
      </div>
      {best && (
        <p className="mt-1.5 text-xs text-ink-3">
          Best{mine.length ? " of your books" : ""}: <span className="font-medium text-ink-2">{best.bookTitle}</span>{" "}
          <span className="num">{isProb ? "" : `${p.side === "over" ? "O" : "U"} ${best.line} `}{fmtOdds(best.price)}</span>
          <span className={`num ml-1.5 ${best.ev > 0 ? "text-strong" : "text-negative"}`}>EV {fmtSigned(best.ev * 100, 1, "%")}</span>
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-3">{isProb ? "Model prob" : "Projection"}</div>
          <div className="num font-semibold">{projectionText(p.unit, p.projection)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-3">{isProb ? "Implied (Yes)" : "Line"}</div>
          <div className="num font-semibold">{isProb ? fmtPct(p.odds.over === null ? null : p.projection - p.edge, 1) : fmtFixed(p.line, 1)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-3">{isProb ? "Edge" : "Proj vs line"}</div>
          <div className="num font-semibold">
            {isProb ? fmtSigned(p.edge * 100, 1, " pts") : <>{fmtSigned(p.edge, 1)} <span className="text-xs font-normal text-ink-3">({fmtSigned((p.edgePct ?? 0) * 100, 0, "%")})</span></>}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <HitRateGrid rates={p.hitRates} side={p.side} compact />
      </div>

      <ul className="mt-3 space-y-1 text-sm text-ink-2">
        {p.reasons.slice(0, 3).map((r, i) => (
          <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />{r}</li>
        ))}
      </ul>
      {p.risks.length > 0 && <p className="mt-2 text-xs text-ink-3"><span className="font-semibold text-moderate">Watch:</span> {p.risks[0]}</p>}
    </Link>
  );
}
