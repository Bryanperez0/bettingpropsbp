# Prop Lab — NFL Player Prop Analytics

A research dashboard that answers one question before kickoff: **which NFL player props does the data say are worth a closer look, and why?**

This is **not a sportsbook**. There is no betting, no deposits, no withdrawals, and no accounts. Every recommendation comes from real data and a fixed, documented formula. Nothing is random and nothing is written by an AI.

> This application provides statistical analysis for informational purposes only. Predictions are not guarantees. Sports betting involves risk.

---

## Data providers (and why)

| Need | Provider | Key? | Why |
|---|---|---|---|
| Schedule, records, venues (indoor flag), game spread / total / moneyline with openers | ESPN public site API | No | Free, current, includes DraftKings game lines with opening numbers |
| Player game logs, targets, carries, receptions, longest catch, QB attempts/completions, team red-zone trips | ESPN game summaries (box scores) | No | One consistent source for player logs **and** team/defense totals, so usage shares and "production allowed" are computed the same way |
| Injury reports | ESPN (league feed, falls back to per-game summaries) | No | Current status (Out / Doubtful / Questionable / IR) with body part and return date |
| Rosters, positions, headshots, logos | ESPN | No | Needed to map players to positions |
| **Player prop lines + odds, multiple books** | **The Odds API** | **Yes** | The practical source for multi-book NFL player props: pass yds/TDs/completions/attempts, rush yds/attempts, receiving yds, receptions, longest reception, anytime TD |
| Kickoff weather (temp, wind, gusts, precip chance) | Open-Meteo | No | Free hourly forecast at the stadium for outdoor games |
| Caching + recommendation ledger | Netlify Blobs | No (built in) | Persists box scores, snapshots and tracked picks with no extra database |

**Not available from these providers** (shown in the app as "Data unavailable", never estimated): snap counts, route participation, player-level red-zone touches, coverage matchups, pressure rate. Each provider sits behind its own adapter in `server/providers/`, so one can be swapped or added later (for example, a snap-count provider) without touching the model.

**About ESPN:** these endpoints are public and widely used, but unofficial and undocumented. They can change without notice. All ESPN-specific parsing lives in `server/providers/espn.ts`.

### The Odds API cost

Player props come from the per-event endpoint. Each call costs **markets × regions** credits. The default setup requests 10 markets from one region, so one full refresh costs about **10 credits per game**, or about 160 for a full Sunday slate.

- The free tier (500 credits a month) covers about 3 full-slate refreshes a month. It's enough to try the app, not to run it all season.
- The app reuses cached lines for `ODDS_CACHE_MINUTES` (default 60) and only requests games within `ODDS_LOOKAHEAD_HOURS` (default 96).
- To spend less, remove markets from `ODDS_API_MARKETS` or raise `ODDS_CACHE_MINUTES`.
- Opening lines need The Odds API's paid historical endpoint. Instead, the app stores the **first line it observes** and labels it that way.

---

## Architecture

```
bettingpropsbp/
├── netlify.toml                 build, functions, SPA redirect, headers
├── .env.example                 every server-side variable
├── netlify/functions/           thin HTTP endpoints (/api/*) + scheduled refresh
├── server/
│   ├── providers/               ONE adapter per external API (espn, oddsApi, weather)
│   ├── services/                schedule, dataset (box scores), rosters, injuries,
│   │                            weather, props, analysis, details, tracking
│   ├── cache.ts                 Netlify Blobs (memory fallback for local/test)
│   └── config.ts                reads env vars (server only)
├── shared/
│   ├── model/                   the analysis engine (pure TypeScript, unit tested)
│   │   ├── markets.ts           per-prop config: stat, weights, variance prior
│   │   ├── league.ts            team offense/defense profiles, ranks, player logs
│   │   ├── projection.ts        volume x efficiency x adjustments, per prop type
│   │   ├── hitRate.ts           hit rates vs the CURRENT line
│   │   ├── confidence.ts        0-100 score with component breakdown + penalties
│   │   └── engine.ts            ties it together, picks Over/Under, writes reasons
│   └── types.ts, api.ts         shared types for server and browser
├── src/                         React + Vite + Tailwind front end
│   ├── pages/  components/  charts/  hooks/  services/  utils/
└── tests/                       Vitest suite + real ESPN response fixtures
```

**Data flow.** A scheduled function (every 15 minutes) and on-demand requests call `buildAnalysis()`:

1. Load the current week from ESPN.
2. Incrementally load box scores for completed games. Each game is fetched once and stored.
3. Load rosters and injuries.
4. Load kickoff weather.
5. Load prop lines (cached).
6. Run the model for every line and save a snapshot.
7. Log new recommendations and grade finished ones.

API endpoints read the snapshot, so pages load fast and provider calls stay low.

**API keys never reach the browser.** Keys are read only in `server/config.ts` inside Netlify Functions. The front end calls only `/api/*`.

### Endpoints

| Path | What it returns |
|---|---|
| `GET /api/dashboard` | status, games, top 12 props, key injuries, data freshness |
| `GET /api/props` / `?top=20` | all analyzed props / ranked top props |
| `GET /api/props/:id` | full analysis for one prop (history, steps, matchup) |
| `GET /api/games`, `/api/games/:id` | slate, and one game's lines, weather, rankings, injuries, props |
| `GET /api/players`, `/api/players/:id` | player list, and one player's logs, splits, usage, charts, props |
| `GET /api/injuries` | current injury reports |
| `GET /api/performance` | tracked-pick results by confidence, category, position, week |
| `GET /api/status` | freshness, config, dataset progress |
| `POST /api/refresh` | re-run the analysis (odds stay cached; optional `x-refresh-secret`) |

---

## Environment variables

Set these in **Netlify → Site configuration → Environment variables** (and in `.env` for `netlify dev`). All are server-side only.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ODDS_API_KEY` | For prop lines | — | The Odds API key. Without it the app still shows games, stats, injuries and weather, but no prop recommendations. |
| `ODDS_API_REGIONS` | No | `us` | Bookmaker region |
| `ODDS_API_BOOKMAKERS` | No | (see `.env.example`) | Comma list of book keys. Overrides region. |
| `ODDS_API_MARKETS` | No | 10 prop markets | Fewer markets = fewer credits |
| `ODDS_CACHE_MINUTES` | No | `60` | How long to reuse prop lines |
| `ODDS_LOOKAHEAD_HOURS` | No | `96` | Only fetch props for games within this window |
| `INCLUDE_PRIOR_SEASON` | No | `true` | Blend last season in (down-weighted) early in the year |
| `DEMO_PROP_LINES` | No | `false` | With no API key, show clearly labeled DEMO lines (player's recent median). Never tracked. |
| `REFRESH_SECRET` | No | — | If set, `POST /api/refresh` requires header `x-refresh-secret` |

---

## Deploy on Netlify


1. Push the repo to GitHub.
2. In Netlify, go to **Add new site → Import an existing project → GitHub** and pick the repo.
3. Leave **Base directory** blank. Netlify reads `netlify.toml` at the repo root: build command `npm run build`, publish directory `dist`, functions in `netlify/functions`.
4. Add `ODDS_API_KEY` (and any optional variables) under **Environment variables**.
5. Deploy. Netlify Blobs needs no setup. The scheduled refresh runs automatically on the published site.

**First load of a season:** the app has to collect every completed box score, about 16 per week. It does this in batches, so the dashboard may say "Still collecting box scores" for a few minutes. Press **Refresh** or wait for the 15-minute schedule. Loading last season (about 272 games) takes a few more cycles.

## Run locally

```bash
cd bettingpropsbp
npm install
cp .env.example .env        # add ODDS_API_KEY if you have one
npx netlify-cli dev         # site + functions + Blobs at http://localhost:8888
```

Plain `npm run dev` serves only the front end. The `/api` functions need `netlify dev`.

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # 44 tests: projections, hit rates, confidence, Over/Under,
                    # missing data, ESPN parsing (real fixtures), tracking/grading,
                    # full pipeline with/without API key, key-leak check
npm run build       # production build
```

The test fixtures in `tests/fixtures/` are trimmed real ESPN responses from the 2026 season. The Odds API and Open-Meteo responses inside the tests are synthetic and exist only in test code.

---

## How the model works (short version)

The full explanation is on the in-app **How it works** page.

- **Projection = volume × efficiency × adjustments**, with a different model per prop type. For example:
  - Rushing yards = carries × yards per carry × opponent YPC allowed.
  - Receptions = targets × catch rate × opponent catch rate allowed to that position.
  - Pass TDs use a Poisson model.
  - Anytime TD blends the player's actual TD rate with a usage-based rate.
- Recency weighting: season 45%, last 5 games 30%, last 3 games 25%. Rates are regressed toward the league average for the position. Opponent factors are regressed by games played and capped.
- Game-script, weather (outdoor only, wind ≥ 15 mph), home/away, and injury adjustments are small, capped, and every one is shown in the prop's calculation table.
- **Injuries:** players listed Out or IR are excluded. When a key teammate is out, the model only adjusts if the player has at least 2 games with and 2 games without that teammate. Otherwise it flags the absence as a risk and assumes nothing. If a team's starting QB is out, that team's non-passing props are flagged and penalized.
- **Over or Under:** the model picks the side with the larger edge over the market's no-vig probability. A side that no sportsbook prices, such as most anytime-TD "No" bets, is never ranked or tracked.
- **Confidence (0–100)** has six components: edge, matchup, volume, form, consistency, and environment. Their weights differ by prop type. Explicit data-quality penalties are then subtracted. Confidence is a ranking score, not a win probability. Nothing is ever labeled a "lock".
- **Model Performance:** each qualifying recommendation is stored once, as generated, and graded from the final box score. Results are broken out by confidence range, category, position, and week.
