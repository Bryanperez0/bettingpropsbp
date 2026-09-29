import { Link, useParams } from "react-router-dom";
import { useProp } from "../hooks/useApi";
import { TrendChart } from "../charts/TrendChart";
import { PlayerAvatar, TeamLogo } from "../components/Media";
import { BooksTable, ConfidenceMeter, ConfidenceTable, HitRateGrid, LineMovement, SideBadge, TierBadge } from "../components/PropParts";
import { InjuryTable, LinesTable, WeatherBadge } from "../components/GameParts";
import { Freshness, Warnings } from "../components/Freshness";
import { ScoreHistory } from "../components/ScoreHistory";
import { PropExplorer } from "../components/PropExplorer";
import { LiveTracker, propHasStarted } from "../components/LiveTracker";
import { Card, ErrorState, Pill, Section, Spinner, Stat, Unavailable } from "../components/ui";
import { fmtFixed, fmtKickoff, fmtOdds, fmtPct, fmtSigned, projectionText } from "../utils/format";

export default function PropDetail() {
  const { id = "" } = useParams();
  const q = useProp(id);
  if (q.isLoading) return <Spinner label="Loading prop analysis" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { prop: p, game, injuries, history, logs, playerProps } = q.data.data;
  const isProb = p.unit === "prob";
  const statLabel = p.marketLabel.toLowerCase();
  const teamInj = injuries.filter((i) => i.team === p.player.team);
  const oppInj = injuries.filter((i) => i.team === p.opponent);

  return (
    <div>
      <Link to="/top" className="text-sm text-ink-3 hover:text-ink">← Top props</Link>

      {/* Header */}
      <Card className="mt-3 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <PlayerAvatar name={p.player.name} src={p.player.headshot} size={84} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {p.player.id ? <Link to={`/players/${p.player.id}`} className="hover:text-over">{p.player.name}</Link> : p.player.name}
              </h1>
              <span className="text-ink-3">{p.player.position}</span>
              {p.player.injuryStatus && <Pill className="bg-moderate/10 text-moderate">{p.player.injuryStatus}</Pill>}
              {p.lineSource === "demo" && <Pill className="bg-fuchsia-500/15 text-fuchsia-300">DEMO LINE — not a sportsbook line</Pill>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <TeamLogo abbr={p.player.team} size={20} /> {p.player.team} {p.isHome ? "vs" : "@"} <TeamLogo abbr={p.opponent} size={20} /> {p.opponent}
              <span aria-hidden>·</span> {fmtKickoff(p.kickoff)}
              {game && <><span aria-hidden>·</span><Link to={`/games/${game.id}`} className="hover:text-ink hover:underline">Game analysis</Link></>}
            </div>
            {propHasStarted(p) && (
              <div className="mt-3 max-w-xl space-y-1">
                <LiveTracker p={p} />
                <p className="text-xs text-ink-3">Game has started. The confidence and lean below are the pregame analysis, frozen at kickoff so the result can be judged fairly.</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold">{p.marketLabel}</span>
              <SideBadge side={p.side} label={`LEAN: ${p.sideLabel}`} large />
              <span className="num text-sm text-ink-2">Odds {fmtOdds(p.odds.side)}</span>
              <TierBadge tier={p.tier} />
            </div>
          </div>
          <div className="w-full sm:w-56"><ConfidenceMeter value={p.confidence.total} tier={p.tier} size="lg" /></div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={isProb ? "Model TD prob" : "Model projection"} value={projectionText(p.unit, p.projection)} />
          <Stat label={isProb ? "Line" : "Sportsbook line"} value={isProb ? "Scores a TD" : fmtFixed(p.line, 1)} sub={p.lineSource === "demo" ? "demo" : `${p.books.length} book${p.books.length === 1 ? "" : "s"}`} />
          <Stat label={isProb ? "Edge" : "Proj vs line"} value={isProb ? fmtSigned(p.edge * 100, 1, " pts") : fmtSigned(p.edge, 1)} sub={p.edgePct !== null ? fmtSigned(p.edgePct * 100, 1, "%") : "vs implied probability"} />
          <Stat label={`Model P(${p.side === "over" ? (isProb ? "Yes" : "Over") : isProb ? "No" : "Under"})`} value={fmtPct(p.modelProb, 1)} />
          <Stat label="Market implied" value={p.impliedProb === null ? "—" : fmtPct(p.impliedProb, 1)} sub={p.impliedProb === null ? "no price; -110 assumed" : "vig removed when both sides priced"} />
          <Stat label="Probability edge" value={fmtSigned(p.probEdge * 100, 1, " pts")} />
        </div>
        <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">{p.explanation}</p>
      </Card>

      <Warnings warnings={q.data.warnings.filter((w) => /DEMO/.test(w))} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Why the model likes it" className="mb-0">
            <Card className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-strong">Supporting factors</p>
                <ul className="space-y-1.5 text-sm text-ink-2">{p.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="text-strong" aria-hidden>+</span>{r}</li>)}</ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-negative">Risks and counterpoints</p>
                {p.risks.length ? <ul className="space-y-1.5 text-sm text-ink-2">{p.risks.map((r, i) => <li key={i} className="flex gap-2"><span className="text-negative" aria-hidden>−</span>{r}</li>)}</ul> : <p className="text-sm text-ink-3">None flagged by the model.</p>}
              </div>
            </Card>
          </Section>

          <Section title="Game-by-game" subtitle="Pick the prop, the games and the line. Every game is graded against the line you choose." className="mb-0">
            <Card className="p-4">
              {logs?.length ? (
                <PropExplorer key={p.id} logs={logs} season={p.season} position={p.player.position} playerProps={playerProps ?? []}
                  initialMarket={p.market} opponent={p.opponent} currentPropId={p.id} />
              ) : (
                <TrendChart history={p.history} line={p.line} unitLabel={isProb ? "TDs" : statLabel} />
              )}
            </Card>
          </Section>

          <Section title="Hit rate at the current line" className="mb-0">
            <Card className="p-4"><HitRateGrid rates={p.hitRates} side={p.side} /></Card>
          </Section>

          <Section title="How the projection was calculated" subtitle="Every step the model applied, in order." className="mb-0">
            <Card className="overflow-x-auto p-4 scrollbar-thin">
              <table className="w-full text-sm">
                <tbody>
                  {p.steps.map((s, i) => (
                    <tr key={i} className="border-t border-line first:border-0 align-top">
                      <td className="py-2 pr-3 text-ink">{s.label}</td>
                      <td className="num py-2 pr-3 font-semibold whitespace-nowrap">{s.value}</td>
                      <td className="py-2 text-xs text-ink-3">{s.detail ?? ""}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line">
                    <td className="py-2 pr-3 font-semibold">{isProb ? "TD probability (1 − e^−λ)" : "Final projection"}</td>
                    <td className="num py-2 pr-3 font-bold">{projectionText(p.unit, p.projection)}</td>
                    <td className="py-2 text-xs text-ink-3">{isProb ? "" : `vs line ${p.line}: ${fmtSigned(p.edge, 1)} (${fmtSigned((p.edgePct ?? 0) * 100, 1, "%")})`}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </Section>

          <Section title="Averages and volume" className="mb-0">
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <Stat label="Season" value={fmtFixed(p.averages.season)} sub={`${p.averages.games} g`} />
                <Stat label="Median" value={fmtFixed(p.averages.median)} />
                <Stat label="Last 3" value={fmtFixed(p.averages.last3)} />
                <Stat label="Last 5" value={fmtFixed(p.averages.last5)} />
                <Stat label="Last 10" value={fmtFixed(p.averages.last10)} />
                <Stat label="Prior season g" value={p.averages.priorSeasonGames} sub="down-weighted" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={`Projected ${p.volume.label.toLowerCase()}`} value={fmtFixed(p.volume.projected)} />
                <Stat label={`Season ${p.volume.label.toLowerCase()}/g`} value={fmtFixed(p.volume.season)} />
                <Stat label={`L3 ${p.volume.label.toLowerCase()}/g`} value={fmtFixed(p.volume.last3)} />
                <Stat label={p.volume.shareLabel ?? "Share"} value={p.volume.share === null ? "—" : fmtPct(p.volume.share, 1)} />
              </div>
              <p className="mt-2 text-xs text-ink-3">Snap counts and route participation: data unavailable from the connected providers.</p>
            </Card>
          </Section>

          <Section title={`Matchup: ${p.player.team} vs ${p.opponent} defense`} subtitle="Opponent numbers are per game this season. Rank 1 = allows the least." className="mb-0">
            <Card className="overflow-x-auto p-4 scrollbar-thin">
              {p.matchup.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1.5 pr-3 font-medium">Metric</th><th className="pr-3 font-medium">{p.opponent}</th><th className="pr-3 font-medium">League</th><th className="pr-3 font-medium">Rank</th><th className="pr-3 font-medium">Factor</th><th className="font-medium">Use</th></tr></thead>
                  <tbody className="num">
                    {p.matchup.map((m, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1.5 pr-3 font-sans text-ink">{m.label}</td>
                        <td className="pr-3">{m.value === "n/a" ? <Unavailable /> : m.value}</td>
                        <td className="pr-3 text-ink-2">{m.leagueValue}</td>
                        <td className="pr-3 text-ink-2">{m.rank ? `${m.rank}/${m.rankOf}` : "—"}</td>
                        <td className="pr-3">{m.factor === null ? "—" : fmtSigned((m.factor - 1) * 100, 1, "%")}</td>
                        <td className="font-sans text-xs text-ink-3">{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Unavailable what="Opponent defensive statistics" />}
            </Card>
          </Section>

          <Section title="Game history" subtitle="The actual results behind the hit rates." className="mb-0">
            <Card className="overflow-x-auto p-4 scrollbar-thin">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1.5 pr-3 font-medium">Season</th><th className="pr-3 font-medium">Week</th><th className="pr-3 font-medium">Opponent</th><th className="pr-3 font-medium">{isProb ? "TDs" : "Result"}</th><th className="font-medium">vs {isProb ? "0.5" : p.line}</th></tr></thead>
                <tbody className="num">
                  {p.history.map((h) => (
                    <tr key={h.gameId} className="border-t border-line">
                      <td className="py-1.5 pr-3 text-ink-2">{h.season}</td>
                      <td className="pr-3 text-ink-2">{h.week}</td>
                      <td className="pr-3 font-sans">{h.home ? "vs" : "@"} {h.opponent}</td>
                      <td className="pr-3 font-semibold">{h.value}</td>
                      <td className={h.result === "over" ? "text-over" : h.result === "under" ? "text-under" : "text-ink-3"}>{h.result === "over" ? "▲ Over" : h.result === "under" ? "▼ Under" : "Push"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Confidence breakdown" subtitle={`Weights are specific to ${p.marketLabel}.`} className="mb-0">
            <Card className="p-4"><ConfidenceTable c={p.confidence} /></Card>
          </Section>
          <Section title="Score history" subtitle="Why the confidence moved between refreshes." className="mb-0">
            <Card className="p-4"><ScoreHistory entries={history ?? []} unit={p.unit} /></Card>
          </Section>
          <Section title="Line movement" className="mb-0"><Card className="p-4"><LineMovement prop={p} /></Card></Section>
          <Section title="Sportsbooks" className="mb-0"><Card className="p-4"><BooksTable books={p.books} unit={p.unit} /></Card></Section>
          {game && (
            <>
              <Section title="Game lines" className="mb-0"><Card className="p-4"><LinesTable g={game} /></Card></Section>
              <Section title="Weather" subtitle={game.venue.name ?? undefined} className="mb-0"><Card className="p-4"><WeatherBadge w={game.weather} detailed /></Card></Section>
            </>
          )}
          <Section title="Data quality" className="mb-0">
            <Card className="p-4 text-sm">
              <div className="flex justify-between"><span className="text-ink-2">Completeness score</span><span className="num font-semibold">{fmtPct(p.dataQuality.score)}</span></div>
              {p.dataQuality.missing.length ? (
                <ul className="mt-2 space-y-1 text-xs text-ink-3">{p.dataQuality.missing.map((m) => <li key={m}>Missing: {m}</li>)}</ul>
              ) : <p className="mt-2 text-xs text-ink-3">All model inputs were available.</p>}
            </Card>
          </Section>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Section title={`${p.player.team} injuries`} className="mb-0"><Card className="p-4"><InjuryTable items={teamInj} /></Card></Section>
        <Section title={`${p.opponent} injuries`} className="mb-0"><Card className="p-4"><InjuryTable items={oppInj} /></Card></Section>
      </div>

      <Section title="Sources" className="mt-8">
        <Card className="p-4"><Freshness sources={q.data.sources} /></Card>
      </Section>
    </div>
  );
}
