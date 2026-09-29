const SOURCE_LABEL = {
  assessment: "assessments", kpi: "KPIs", training: "training", project: "projects",
  manager_feedback: "manager feedback", peer_feedback: "peer feedback",
  self_assessment: "self-assessment", certification: "certifications",
};

/**
 * Renders loo_sensitivity (leave-one-source-out) — computed by the pipeline
 * for every verdict, previously stored and never shown. Direct answer to
 * "is this verdict driven by one source": holds without manager feedback ✓,
 * peer ✓ — flips without assessments ⚠.
 */
export default function RobustnessRow({ sensitivity }) {
  if (!sensitivity || sensitivity.length === 0) {
    return <p className="text-meta text-ink-muted">Only one evidence source type — robustness check needs at least two.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {sensitivity.map((s) => (
        <span
          key={s.excluded_source_type}
          className={`text-meta rounded-full border px-2 py-0.5 ${
            s.verdict_changed ? "border-gold/50 bg-gold/10 text-gold" : "border-line bg-surface-2 text-ink-muted"
          }`}
          title={`Without ${SOURCE_LABEL[s.excluded_source_type] || s.excluded_source_type}: ${s.verdict_without.replace(/_/g, " ")} (${(s.confidence_without * 100).toFixed(0)}%)`}
        >
          without {SOURCE_LABEL[s.excluded_source_type] || s.excluded_source_type} {s.verdict_changed ? "⚠ flips" : "✓ holds"}
        </span>
      ))}
    </div>
  );
}
