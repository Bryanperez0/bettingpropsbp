import { useState } from "react";

export function TeamLogo({ abbr, src, size = 28 }: { abbr: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = src || (abbr ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png` : "");
  if (!url || failed) {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-ink-2" style={{ width: size, height: size }}>
        {abbr}
      </span>
    );
  }
  return <img src={url} alt={`${abbr} logo`} width={size} height={size} loading="lazy" onError={() => setFailed(true)} className="inline-block object-contain" style={{ width: size, height: size }} />;
}

export function PlayerAvatar({ name, src, size = 48 }: { name: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  if (!src || failed) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-ink-2" style={{ width: size, height: size, fontSize: size / 3 }} aria-hidden>
        {initials}
      </span>
    );
  }
  return (
    <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className="shrink-0 rounded-full bg-surface-3 object-cover object-top" style={{ width: size, height: size }} />
  );
}
