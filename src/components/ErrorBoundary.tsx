import { Component, type ReactNode } from "react";

interface State { error: Error | null }

/**
 * Catches any crash inside a page so the app never goes blank. The layout
 * (menu, Back button) keeps working, and moving to another page resets it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Page crashed:", error);
    if (isChunkError(error)) reloadOnce();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const stale = isChunkError(this.state.error);
    return (
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="font-semibold text-negative">{stale ? "The site was updated" : "This page hit an error"}</p>
        <p className="mt-1 text-sm text-ink-2">
          {stale ? "A new version was deployed while this tab was open. Reload to get the latest version." : this.state.error.message}
        </p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-over px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">
          Reload page
        </button>
      </div>
    );
  }
}

export function isChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Failed to fetch/i.test(msg);
}

/** Reload once to pick up the new deploy; the guard prevents reload loops. */
export function reloadOnce() {
  try {
    const key = "chunk-reload-at";
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage blocked: still reload */
  }
  window.location.reload();
}
