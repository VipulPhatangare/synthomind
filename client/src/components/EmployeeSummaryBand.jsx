import DivergenceBadge from "./DivergenceBadge.jsx";

const VERDICT_LABEL = { improving: "improving", declining: "declining", stagnating: "stagnating", insufficient_evidence: "insufficient evidence" };
const ORDER = ["improving", "declining", "stagnating", "insufficient_evidence"];

/**
 * The one-glance summary EmployeeDetail was missing — previously you had to
 * read all six competency cards before forming any impression of the
 * person. Counts + profile shape + the single most load-bearing finding.
 */
export default function EmployeeSummaryBand({ competencies, profile }) {
  const withVerdict = competencies.filter((c) => c.verdict);
  const counts = { improving: 0, declining: 0, stagnating: 0, insufficient_evidence: 0 };
  for (const c of withVerdict) counts[c.verdict.verdict] = (counts[c.verdict.verdict] || 0) + 1;

  const topTradeoff = profile?.tradeoff_pairs?.[0];

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        {ORDER.filter((v) => counts[v] > 0).map((v) => (
          <span key={v} className="text-meta text-ink-muted">
            <span className="num text-section font-semibold text-ink">{counts[v]}</span> {VERDICT_LABEL[v]}
          </span>
        ))}
        {profile && <DivergenceBadge shape={profile.profile_shape} size="md" />}
      </div>
      {topTradeoff && (
        <p className="text-meta mt-2 text-ink-muted">
          Most notable: <span className="text-improving">↑ {topTradeoff.gaining_competency_id.replace(/_/g, " ")}</span>{" "}
          while <span className="text-declining">↓ {topTradeoff.losing_competency_id.replace(/_/g, " ")}</span>{" "}
          (r={topTradeoff.correlation}, {topTradeoff.n_overlap_points} shared quarters)
        </p>
      )}
    </div>
  );
}
