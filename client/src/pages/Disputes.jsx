import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDisputes, resolveDispute } from "../api/client.js";

const RESOLUTIONS = [
  { value: "upheld_with_context_added", label: "Uphold, with context added" },
  { value: "overturned", label: "Overturn — remove from consideration" },
  { value: "no_change", label: "No change — rating stands" },
];

function fmtDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export default function Disputes() {
  const [filter, setFilter] = useState("open");
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);
  const [corrections, setCorrections] = useState({}); // dispute_id -> correction

  function load() {
    setLoading(true);
    listDisputes(filter === "all" ? {} : { resolution: filter })
      .then((d) => setDisputes(d.disputes))
      .finally(() => setLoading(false));
  }

  useEffect(load, [filter]);

  async function handleResolve(disputeId, resolution) {
    setResolvingId(disputeId);
    const result = await resolveDispute(disputeId, resolution);
    if (result.correction) {
      setCorrections((prev) => ({ ...prev, [disputeId]: result.correction }));
    }
    setResolvingId(null);
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Disputes</h1>
          <p className="text-sm text-ink-muted">Evidence employees or HR have contested — the human-in-the-loop trail.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-line p-1 text-sm">
          {["open", "all", "upheld_with_context_added", "overturned", "no_change"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 ${filter === f ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}
            >
              {f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading…</p>}
      {!loading && disputes.length === 0 && <p className="text-sm text-ink-muted">No disputes in this view.</p>}

      <div className="space-y-3">
        {disputes.map((d) => (
          <div key={d.dispute_id} className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <Link to={`/employees/${d.employee_id}`} className="font-medium text-ink hover:text-brand">
                  {d.employee_name}
                </Link>
                <span className="ml-2 text-xs text-ink-muted">
                  {d.department} · {d.competency_id?.replace(/_/g, " ")} · {d.source_type?.replace(/_/g, " ")} · raised {fmtDate(d.raised_at)} by {d.raised_by}
                </span>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  d.resolution === "open" ? "bg-gold/15 text-gold" : "bg-improving/15 text-improving"
                }`}
              >
                {d.resolution.replace(/_/g, " ")}
              </span>
            </div>

            {d.quote && <p className="mb-2 rounded-md bg-surface-2 p-2 text-sm text-ink">"{d.quote}"</p>}
            <p className="text-sm text-ink-muted">Reason: {d.reason}</p>

            {d.resolution === "open" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.value}
                    disabled={resolvingId === d.dispute_id}
                    onClick={() => handleResolve(d.dispute_id, r.value)}
                    className="rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-brand hover:text-ink disabled:opacity-50"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-muted">Resolved by {d.resolved_by} on {fmtDate(d.resolved_at)}</p>
            )}

            {corrections[d.dispute_id] && (() => {
              const c = corrections[d.dispute_id];
              const changed = c.verdict_before !== c.verdict_after;
              return (
                <div className={`mt-2 rounded-md border p-2 text-xs ${changed ? "border-improving/40 bg-improving/5" : "border-line bg-surface-2"}`}>
                  <span className="font-medium text-ink">Model corrected: </span>
                  <span className="text-ink-muted">
                    {c.verdict_before?.replace(/_/g, " ") ?? "—"} ({c.confidence_before != null ? `${(c.confidence_before * 100).toFixed(0)}%` : "—"})
                    {" → "}
                    {c.verdict_after.replace(/_/g, " ")} ({c.confidence_after != null ? `${(c.confidence_after * 100).toFixed(0)}%` : "—"})
                  </span>
                  {!changed && <span className="text-ink-muted"> (no change to the verdict)</span>}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
