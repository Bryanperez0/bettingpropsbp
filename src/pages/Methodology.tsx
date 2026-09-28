import { MARKET_LIST } from "../../shared/model/markets";
import { Card, PageHeader, Section } from "../components/ui";
import { Disclaimer } from "../components/Disclaimer";
import { STATUS_META } from "../utils/format";
import type { DataStatus } from "../../shared/types";

const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3 text-sm leading-relaxed text-ink-2">{children}</p>;

export default function Methodology() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="How the model works" subtitle="Every number in this app comes from real data and a fixed formula. Nothing is random and nothing is written by an AI." />

      <Section title="Data sources">
        <Card className="p-4">
          <ul className="space-y-2 text-sm text-ink-2">
            <li><b className="text-ink">ESPN public API</b> — schedule, records, venues (indoor/outdoor), game spread/total/moneyline with openers, injury reports, rosters, and full box scores. Box scores give per-game carries, targets, receptions, longest catch, pass attempts/completions/yards/TDs and team red-zone trips. Player logs, usage shares and defensive numbers are all computed from these box scores.</li>
            <li><b className="text-ink">The Odds API</b> — player prop lines and prices from multiple sportsbooks (requires a key). The consensus line is the most common line across books; prices are the median at that line.</li>
            <li><b className="text-ink">Open-Meteo</b> — hourly forecast at kickoff for outdoor stadiums (temperature, wind, gusts, precipitation chance).</li>
            <li><b className="text-ink">Not available:</b> snap counts, route participation, player red-zone touches, coverage/scheme data and pressure rate. These are shown as "Data unavailable" rather than estimated. Sacks generated are used as a pressure proxy for context only.</li>
          </ul>
        </Card>
      </Section>

      <Section title="Projections">
        <Card className="p-4">
          <P>Each prop type has its own model built as <b className="text-ink">volume × efficiency × adjustments</b>:</P>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li><b className="text-ink">Rushing yards</b> = projected carries × yards per carry × opponent YPC allowed.</li>
            <li><b className="text-ink">Rush attempts</b> = projected carries (with opponent rush attempts faced and game script).</li>
            <li><b className="text-ink">Receiving yards</b> = projected targets × yards per target × opponent yards/target allowed to that position.</li>
            <li><b className="text-ink">Receptions</b> = projected targets × catch rate × opponent catch rate allowed to that position.</li>
            <li><b className="text-ink">Longest reception</b> = recency-weighted per-game long catch × target-volume and opponent yards-per-catch factors.</li>
            <li><b className="text-ink">Passing yards / completions / attempts</b> = projected attempts × yards per attempt or completion % × opponent pass defense.</li>
            <li><b className="text-ink">Passing TDs</b> = Poisson rate from TD/game, opponent TDs allowed and the team's implied point total.</li>
            <li><b className="text-ink">Anytime TD</b> = blend of the player's actual TD rate and a usage-based rate (league TD per carry/target × his opportunities), scaled by the opponent and implied team total; P(TD) = 1 − e^−λ.</li>
          </ul>
          <P>Volume and efficiency are recency-weighted: season 45%, last 5 games 30%, last 3 games 25%. With fewer than 4 games this season, last season is blended in (up to 60% weight with 1 game, 0% at 4+). Efficiency rates are regressed toward the league average for the position in proportion to sample size. Opponent factors compare what the defense allows to the league average, are regressed by games played, and are capped (usually ±15%).</P>
          <P>Small, capped adjustments (all shown in each prop's calculation table): <b className="text-ink">game script</b> from the spread (favorites run slightly more, underdogs pass slightly more, max ±6%), <b className="text-ink">weather</b> for outdoor games only (wind ≥ 15 mph cuts passing efficiency 1% per mph over 12, max 12%; precipitation ≥ 60% −3%; ≤ 20°F −2%), <b className="text-ink">home/away</b> splits (max ±5%, needs 2+ games each), and <b className="text-ink">injuries</b>.</P>
          <P><b className="text-ink">Injuries.</b> Players listed Out/IR are excluded. When a teammate who held ≥ 12% of team targets or carries is out, the model compares the player's volume in games with and without that teammate, and only adjusts if there are at least 2 games of each. Otherwise it lists the absence as a risk and makes no assumption. If a team's primary QB is out, pass-catcher and rushing props get a flagged −6 confidence penalty because the history was built with a different QB.</P>
          <P><b className="text-ink">Over or Under.</b> The model converts the projection into a probability distribution (normal for yardage and counts, Poisson for pass TDs) and picks the side with the larger edge versus the market's no-vig probability.</P>
        </Card>
      </Section>

      <Section title="Confidence score (0–100)">
        <Card className="overflow-x-auto p-4 scrollbar-thin">
          <P>Six components, each computed from the inputs above, then explicit penalties for missing or weak data (small sample, missing odds, missing opponent data, Questionable tag, unmodeled QB change, missing weather or game lines). The weights change by prop type:</P>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3">{["Prop", "Model edge", "Matchup", "Volume", "Form", "Consistency", "Environment"].map((h) => <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="num">
              {MARKET_LIST.map((m) => (
                <tr key={m.key} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-sans text-ink">{m.label}</td>
                  {[m.weights.edge, m.weights.matchup, m.weights.volume, m.weights.form, m.weights.consistency, m.weights.environment].map((w, i) => <td key={i} className="pr-3">{w}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <P>
            <br />Tiers: <b className="text-strong">Strong edge</b> = confidence ≥ 72 and ≥ 6 pts probability edge; <b className="text-moderate">Moderate</b> = ≥ 58 and ≥ 3 pts; <b className="text-negative">Negative</b> = edge below zero or confidence under 40; otherwise <b className="text-neutral">Neutral</b>. Nothing is ever labeled a "lock". Confidence is a ranking score, not a win probability. Use the Model Performance page to see how each range actually performs.
          </P>
        </Card>
      </Section>

      <Section title="Data labels">
        <Card className="p-4">
          <ul className="space-y-1.5 text-sm">
            {(Object.keys(STATUS_META) as DataStatus[]).map((k) => (
              <li key={k} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${STATUS_META[k].dot}`} /><b className={STATUS_META[k].text}>{STATUS_META[k].label}</b>
                <span className="text-ink-2">{{ live: "fetched from the provider on this refresh", cached: "served from the app's cache; the timestamp shows when it was fetched", estimated: "model-derived values (projections, probabilities)", unavailable: "the provider has no data; nothing is filled in", mock: "demo lines only (DEMO_PROP_LINES), never real odds and never tracked" }[k]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="Known limitations">
        <Card className="p-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>ESPN box scores only list players who recorded a stat, so a game with zero targets looks like a game not played. This slightly overstates low-usage players.</li>
            <li>"First seen" lines are the first line this app recorded, not the sportsbook's true opener.</li>
            <li>ESPN's endpoints are public but unofficial and can change. Each provider sits behind its own adapter so it can be replaced.</li>
            <li>Early in the season, samples are small and confidence is penalized accordingly.</li>
          </ul>
        </Card>
      </Section>
      <Disclaimer />
    </div>
  );
}
