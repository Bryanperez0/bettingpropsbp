import { useQuery } from "@tanstack/react-query";
import { Card, ErrorState, PageHeader, Spinner } from "../components/ui";
import { authHeaders } from "../auth/supabase";

interface Check { name: string; ok: boolean; status: string; detail: string; ms: number }

export default function Diagnostics() {
  const q = useQuery({
    queryKey: ["diagnostics"],
    queryFn: async () => {
      const res = await fetch("/api/diagnostics", { headers: await authHeaders() });
      if (!res.ok) throw new Error(`Diagnostics endpoint returned HTTP ${res.status}`);
      return (await res.json()) as { checkedAt: string; checks: Check[] };
    },
    staleTime: 0,
  });
  return (
    <div className="max-w-4xl">
      <PageHeader title="Data connections" subtitle="Checks every data source from the server. If something is red, the detail says why. No API keys are shown." />
      {q.isLoading ? <Spinner label="Checking data sources" /> : q.isError || !q.data ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <Card className="overflow-x-auto p-4 scrollbar-thin">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-3"><th className="py-1.5 pr-3 font-medium">Source</th><th className="pr-3 font-medium">Result</th><th className="pr-3 font-medium">Status</th><th className="pr-3 font-medium">Detail</th><th className="font-medium">Time</th></tr></thead>
            <tbody>
              {q.data.checks.map((c) => (
                <tr key={c.name} className="border-t border-line align-top">
                  <td className="py-2 pr-3 text-ink">{c.name}</td>
                  <td className={`py-2 pr-3 font-semibold ${c.ok ? "text-strong" : "text-negative"}`}>{c.ok ? "✓ OK" : "✕ Problem"}</td>
                  <td className="num py-2 pr-3 text-ink-2">{c.status}</td>
                  <td className="py-2 pr-3 text-ink-2">{c.detail}</td>
                  <td className="num py-2 text-ink-3">{c.ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-3">Checked {new Date(q.data.checkedAt).toLocaleString()}.</p>
          <button onClick={() => q.refetch()} className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">Run again</button>
        </Card>
      )}
    </div>
  );
}
