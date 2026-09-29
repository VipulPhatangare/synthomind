const COMP_LABEL = (id) => id.replace(/_/g, " ");

/** B1: surfaces "one skill improves while another weakens" at the employee level. */
export default function DivergenceCallout({ profile }) {
  if (!profile || profile.profile_shape !== "divergent" || profile.tradeoff_pairs.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-declining/30 bg-declining/5 p-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">⇅ Divergent profile</h3>
      <p className="mb-3 text-xs text-ink-muted">
        This person has competencies confidently moving in opposite directions during the same period —
        not just "one is up, one is down somewhere", but a statistically significant concurrent trade-off.
      </p>
      <div className="space-y-2">
        {profile.tradeoff_pairs.slice(0, 4).map((p, i) => (
          <div key={i} className="rounded-lg bg-surface p-2.5 text-xs">
            <span className="font-medium text-improving">↑ {COMP_LABEL(p.gaining_competency_id)}</span>
            <span className="text-ink-muted"> while </span>
            <span className="font-medium text-declining">↓ {COMP_LABEL(p.losing_competency_id)}</span>
            <span className="text-ink-muted"> (r={p.correlation}, n={p.n_overlap_points} shared quarters)</span>
            {p.candidate_org_events?.length > 0 && (
              <div className="mt-1 text-ink-muted">
                Around the same time as: {p.candidate_org_events.map((e) => e.event_type.replace(/_/g, " ")).join(", ")}
                <span className="italic"> — worth looking into, not asserted as the cause.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
