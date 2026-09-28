import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function Section({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-8 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-ink-3" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-over" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <Card className="p-6">
      <p className="font-semibold text-negative">Couldn't load data</p>
      <p className="mt-1 text-sm text-ink-2">{msg}</p>
      <p className="mt-2 text-xs text-ink-3">The first load of a new week can take a few tries while box scores are collected.</p>
      {retry && (
        <button onClick={retry} className="mt-4 rounded-lg bg-surface-3 px-3 py-1.5 text-sm font-medium text-ink hover:bg-line">
          Try again
        </button>
      )}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Card className="p-6 text-sm text-ink-2">{children}</Card>;
}

/** Standard marker for missing data. Never replaced by a guess. */
export function Unavailable({ what, className = "" }: { what?: string; className?: string }) {
  return <span className={`text-xs italic text-ink-3 ${className}`}>{what ? `${what}: ` : ""}Data unavailable</span>;
}

export function Stat({ label, value, sub, className = "" }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg bg-surface-2 px-3 py-2 ${className}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className="num mt-0.5 text-lg font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="font-medium text-ink hover:text-over hover:underline">{children}</Link>;
}
