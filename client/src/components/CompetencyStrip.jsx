const VERDICT_COLOR = {
  improving: "var(--color-improving)", declining: "var(--color-declining)",
  stagnating: "var(--color-stagnating)", insufficient_evidence: "var(--color-insufficient)",
};

/**
 * Replaces the "wall of full-text verdict chips" — six colored squares in a
 * STABLE (alphabetical by competency_id) order, so scanning DOWN a column
 * means something ("everyone's execution declining" becomes visible at a
 * glance) instead of reading six full-width pills per row. Alphabetical
 * order gives perfect column alignment whenever the list is filtered to one
 * department (all rows then share the same 6 competencies); across mixed
 * departments the 2 department-specific slots won't always align, which
 * is the same limitation the old design had, just far more compact.
 */
export default function CompetencyStrip({ verdictSummary }) {
  const sorted = [...(verdictSummary || [])].sort((a, b) => a.competency_id.localeCompare(b.competency_id));
  return (
    <div className="flex gap-1">
      {sorted.map((v) => (
        <span
          key={v.competency_id}
          className="h-4 w-4 rounded-sm"
          style={{ background: VERDICT_COLOR[v.verdict] || VERDICT_COLOR.insufficient_evidence }}
          title={`${v.competency_id.replace(/_/g, " ")}: ${v.verdict.replace(/_/g, " ")}${v.confidence != null ? ` (${(v.confidence * 100).toFixed(0)}%)` : ""}`}
        />
      ))}
    </div>
  );
}
