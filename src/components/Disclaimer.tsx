export const DISCLAIMER = "This application provides statistical analysis for informational purposes only. Predictions are not guarantees. Sports betting involves risk.";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-ink-3 ${className}`}>
      {DISCLAIMER} This is a research tool, not a sportsbook: no bets, deposits or withdrawals are possible here. If gambling is a problem for you or someone you know, call 1-800-GAMBLER.
    </p>
  );
}
