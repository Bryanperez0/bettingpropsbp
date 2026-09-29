import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useProps } from "../hooks/useApi";
import { MARKET_LIST, positionGroup } from "../../shared/model/markets";
import { matchesName } from "../../shared/search";
import type { SlimProp } from "../../shared/api";
import { PlayerAvatar } from "../components/Media";
import { SideBadge, TierBadge } from "../components/PropParts";
import { StatusBanner } from "../components/StatusBanner";
import { Empty, ErrorState, PageHeader, Spinner } from "../components/ui";
import { fmtKickoff, fmtOdds, fmtPct, fmtSigned, projectionText } from "../utils/format";

type Sort = "confidence" | "edge" | "hit" | "time";

const edgeScore = (p: SlimProp) => (p.unit === "prob" ? p.probEdge : p.edgePct ?? 0);

export default function PropFinder() {
  const q = useProps();
  const [f, setF] = useState({ player: "", team: "All", opp: "All", pos: "All", market: "All", side: "All", game: "All", book: "All", minConf: 0, minEdge: 0, upcomingOnly: true });
  const [sort, setSort] = useState<Sort>("confidence");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const props = q.data?.data.props ?? [];
  const games = q.data?.data.games ?? [];
  const teams = useMemo(() => [...new Set(props.map((p) => p.player.team))].sort(), [props]);
  const books = useMemo(() => [...new Set(props.flatMap((p) => p.books.map((b) => b.bookTitle)))].sort(), [props]);

  const list = useMemo(() => {
    const s = f.player.trim();
    const now = Date.now();
    const out = props.filter((p) =>
      matchesName(s, p.player.name) &&
      (f.team === "All" || p.player.team === f.team) &&
      (f.opp === "All" || p.opponent === f.opp) &&
      (f.pos === "All" || positionGroup(p.player.position) === f.pos) &&
      (f.market === "All" || p.market === f.market) &&
      (f.side === "All" || p.side === f.side) &&
      (f.game === "All" || p.gameId === f.game) &&
      (f.book === "All" || p.books.some((b) => b.bookTitle === f.book)) &&
      p.confidence.total >= f.minConf &&
      edgeScore(p) * 100 >= f.minEdge &&
      (!f.upcomingOnly || Date.parse(p.kickoff) > now));
    const cmp: Record<Sort, (a: SlimProp, b: SlimProp) => number> = {
      confidence: (a, b) => b.confidence.total - a.confidence.total,
      edge: (a, b) => edgeScore(b) - edgeScore(a),
      hit: (a, b) => (b.hitRates.season.pct ?? -1) - (a.hitRates.season.pct ?? -1) || b.hitRates.season.total - a.hitRates.season.total,
      time: (a, b) => a.kickoff.localeCompare(b.kickoff),
    };
    return out.sort(cmp[sort]);
  }, [props, f, sort]);

  if (q.isLoading) return <Spinner label="Loading props" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const sel = "rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink";
  return (
    <div>
      <PageHeader title="Prop Finder" subtitle={`Search and filter all ${props.length} analyzed props. Edge filter uses % over/under the line (probability points for anytime TD).`} />
      <StatusBanner status={q.data.data.status} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input value={f.player} onChange={(e) => set("player", e.target.value)} placeholder="Player" aria-label="Player" className={`${sel} col-span-2 sm:col-span-1 placeholder:text-ink-3`} />
        <select className={sel} aria-label="Team" value={f.team} onChange={(e) => set("team", e.target.value)}><option value="All">All teams</option>{teams.map((t) => <option key={t}>{t}</option>)}</select>
        <select className={sel} aria-label="Opponent" value={f.opp} onChange={(e) => set("opp", e.target.value)}><option value="All">All opponents</option>{teams.map((t) => <option key={t}>{t}</option>)}</select>
        <select className={sel} aria-label="Position" value={f.pos} onChange={(e) => set("pos", e.target.value)}>{["All", "QB", "RB", "WR", "TE"].map((p) => <option key={p} value={p}>{p === "All" ? "All positions" : p}</option>)}</select>
        <select className={sel} aria-label="Prop type" value={f.market} onChange={(e) => set("market", e.target.value)}><option value="All">All prop types</option>{MARKET_LIST.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <select className={sel} aria-label="Over or under" value={f.side} onChange={(e) => set("side", e.target.value)}><option value="All">Over & Under</option><option value="over">Over / Yes</option><option value="under">Under / No</option></select>
        <select className={sel} aria-label="Game" value={f.game} onChange={(e) => set("game", e.target.value)}><option value="All">All games</option>{games.map((g) => <option key={g.id} value={g.id}>{g.shortName}</option>)}</select>
        <select className={sel} aria-label="Sportsbook" value={f.book} onChange={(e) => set("book", e.target.value)}><option value="All">All books</option>{books.map((b) => <option key={b}>{b}</option>)}</select>
        <label className={`${sel} flex items-center justify-between gap-2`}>Min conf <input type="number" min={0} max={100} value={f.minConf} onChange={(e) => set("minConf", Number(e.target.value))} className="num w-14 rounded bg-surface-2 px-1 text-right" /></label>
        <label className={`${sel} flex items-center justify-between gap-2`}>Min edge % <input type="number" step={1} value={f.minEdge} onChange={(e) => set("minEdge", Number(e.target.value))} className="num w-14 rounded bg-surface-2 px-1 text-right" /></label>
        <select className={sel} aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="confidence">Sort: Highest confidence</option><option value="edge">Sort: Largest model edge</option><option value="hit">Sort: Highest season hit rate</option><option value="time">Sort: Game time</option>
        </select>
        <label className={`${sel} flex items-center gap-2`}><input type="checkbox" checked={f.upcomingOnly} onChange={(e) => set("upcomingOnly", e.target.checked)} /> Upcoming only</label>
      </div>
      <p className="mb-2 text-xs text-ink-3">{list.length} results</p>

      {!list.length ? <Empty>No props match these filters.</Empty> : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3">
                <tr>{["Player", "Prop", "Lean", "Odds", "Proj", "Edge", "Conf", "Season hit", "L5", "Tier", "Kickoff"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="num">
                {list.map((p) => (
                  <tr key={p.id} className="border-t border-line hover:bg-surface-2">
                    <td className="px-3 py-2 font-sans">
                      <Link to={`/props/${encodeURIComponent(p.id)}`} className="flex items-center gap-2 hover:text-over">
                        <PlayerAvatar name={p.player.name} src={p.player.headshot} size={28} />
                        <span><span className="font-medium">{p.player.name}</span><span className="block text-xs text-ink-3">{p.player.position} · {p.player.team} {p.isHome ? "vs" : "@"} {p.opponent}</span></span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-sans text-ink-2">{p.marketLabel}{p.lineSource === "demo" && <span className="ml-1 text-[10px] text-fuchsia-300">DEMO</span>}</td>
                    <td className="px-3 py-2"><SideBadge side={p.side} label={p.sideLabel} /></td>
                    <td className="px-3 py-2">{fmtOdds(p.odds.side)}</td>
                    <td className="px-3 py-2">{projectionText(p.unit, p.projection)}</td>
                    <td className="px-3 py-2">{p.unit === "prob" ? fmtSigned(p.probEdge * 100, 1, "pt") : fmtSigned((p.edgePct ?? 0) * 100, 1, "%")}</td>
                    <td className="px-3 py-2 font-semibold">{p.confidence.total}</td>
                    <td className="px-3 py-2">{p.hitRates.season.total ? `${fmtPct(p.hitRates.season.pct)} (${p.hitRates.season.hits}/${p.hitRates.season.total - p.hitRates.season.pushes})` : "—"}</td>
                    <td className="px-3 py-2">{p.hitRates.last5.total ? `${p.hitRates.last5.hits}/${p.hitRates.last5.total - p.hitRates.last5.pushes}` : "—"}</td>
                    <td className="px-3 py-2"><TierBadge tier={p.tier} /></td>
                    <td className="px-3 py-2 font-sans text-xs text-ink-3">{fmtKickoff(p.kickoff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <ul className="space-y-2 md:hidden">
            {list.slice(0, 100).map((p) => (
              <li key={p.id}>
                <Link to={`/props/${encodeURIComponent(p.id)}`} className="block rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar name={p.player.name} src={p.player.headshot} size={32} />
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.player.name}</p><p className="text-xs text-ink-3">{p.marketLabel} · {p.player.team} {p.isHome ? "vs" : "@"} {p.opponent}</p></div>
                    <span className="num text-lg font-bold">{p.confidence.total}</span>
                  </div>
                  <div className="num mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                    <SideBadge side={p.side} label={p.sideLabel} /> proj {projectionText(p.unit, p.projection)} · {fmtOdds(p.odds.side)} · <TierBadge tier={p.tier} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
