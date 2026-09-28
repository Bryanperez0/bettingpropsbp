import { NavLink, Outlet, Link } from "react-router-dom";
import { useRefresh, useStatus } from "../hooks/useApi";
import { timeAgo } from "../utils/format";
import { Disclaimer } from "./Disclaimer";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/top", label: "Top Props" },
  { to: "/games", label: "Games" },
  { to: "/players", label: "Players" },
  { to: "/finder", label: "Prop Finder" },
  { to: "/injuries", label: "Injuries" },
  { to: "/performance", label: "Model Performance" },
  { to: "/methodology", label: "How it works" },
  { to: "/diagnostics", label: "Data connections" },
];

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`;

function RefreshButton() {
  const status = useStatus();
  const refresh = useRefresh();
  const s = status.data?.data;
  return (
    <div className="flex items-center gap-3 text-xs text-ink-3">
      {s && <span className="hidden sm:inline">Week {s.week} · analysis {timeAgo(s.generatedAt)}</span>}
      <button
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        className="rounded-lg border border-line px-2.5 py-1 font-medium text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-50"
        title="Re-run the analysis. Cached odds are reused until their cache window expires, so this does not spend API credits."
      >
        {refresh.isPending ? "Refreshing…" : "Refresh"}
      </button>
      {refresh.isError && <span className="text-negative">{(refresh.error as Error).message}</span>}
    </div>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col p-4">
          <Link to="/" className="mb-6 flex items-center gap-2 px-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <div>
              <div className="font-bold tracking-tight text-ink">Prop Lab</div>
              <div className="text-[11px] text-ink-3">NFL prop analytics</div>
            </div>
          </Link>
          <nav className="space-y-1" aria-label="Main">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>{n.label}</NavLink>)}
          </nav>
          <div className="mt-auto rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Research only</p>
            <p className="mt-1 text-xs text-ink-3">Not a sportsbook. No wagering, deposits or withdrawals.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <img src="/favicon.svg" alt="" className="h-6 w-6" />
              <span className="font-bold text-ink">Prop Lab</span>
            </Link>
            <span className="hidden text-sm text-ink-3 lg:inline">Statistical research for NFL player props</span>
            <RefreshButton />
          </div>
          <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden" aria-label="Main mobile">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>{n.label}</NavLink>)}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="mx-auto max-w-7xl border-t border-line px-4 py-6 lg:px-8">
          <Disclaimer />
          <p className="mt-2 text-xs text-ink-3">Data: ESPN (schedule, stats, injuries, game lines), The Odds API (player props), Open-Meteo (weather). Team logos and headshots are served by ESPN.</p>
        </footer>
      </div>
    </div>
  );
}
