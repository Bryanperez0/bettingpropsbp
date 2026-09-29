import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { searchPlayers, type SearchablePlayer } from "../../shared/search";
import { PlayerAvatar, TeamLogo } from "./Media";

/**
 * Search box with a drop-down of matching offensive players (QB/RB/WR/TE).
 * Forgiving: matches first or last names, prefixes and common misspellings.
 */
export function PlayerSearch({ className = "" }: { className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  const index = useQuery({
    queryKey: ["search-index"],
    queryFn: () => api<{ players: SearchablePlayer[] }>("search-index"),
    staleTime: 5 * 60_000,
    enabled: open || q.length > 0,
  });
  const hits = useMemo(() => searchPlayers(q, index.data?.data.players ?? [], 8), [q, index.data]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (p: SearchablePlayer) => {
    setQ("");
    setOpen(false);
    navigate(`/players/${p.id}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active].item); }
    else if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
  };

  const showList = open && q.trim().length > 0;
  return (
    <div ref={wrap} className={`relative ${className}`}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search players (QB, RB, WR, TE)"
        aria-label="Search players"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
        className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-over focus:outline-none"
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface-2 py-1 shadow-2xl">
          {index.isLoading && <li className="px-3 py-2 text-sm text-ink-3">Loading players…</li>}
          {index.isError && <li className="px-3 py-2 text-sm text-negative">Couldn't load the player list.</li>}
          {index.data && !hits.length && <li className="px-3 py-2 text-sm text-ink-3">No offensive players match "{q}".</li>}
          {hits.map((h, i) => {
            const p = h.item;
            return (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); go(p); }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 ${i === active ? "bg-surface-3" : ""}`}
              >
                <PlayerAvatar name={p.name} src={p.headshot} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                  <div className="flex items-center gap-1 text-xs text-ink-3">
                    <TeamLogo abbr={p.team} size={14} /> {p.team} · {p.position}
                    {p.injuryStatus && !/^active$/i.test(p.injuryStatus) && <span className="text-moderate">· {p.injuryStatus}</span>}
                  </div>
                </div>
                {p.propCount > 0 && <span className="num shrink-0 rounded-md bg-over/15 px-1.5 py-0.5 text-[11px] font-semibold text-over">{p.propCount} prop{p.propCount === 1 ? "" : "s"}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
