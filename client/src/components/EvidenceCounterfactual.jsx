/** C1: "what would change my mind" — the concrete, sized ask behind an insufficient_evidence verdict. */
export default function EvidenceCounterfactual({ counterfactual }) {
  if (!counterfactual) return null;
  return (
    <div className="mt-2 rounded-md border border-dashed border-insufficient/40 bg-insufficient/5 p-2 text-xs">
      <span className="font-medium text-ink">What would change this: </span>
      <span className="text-ink-muted">{counterfactual.description}</span>
      {counterfactual.projected_score != null && (
        <span className="text-ink-muted"> (sufficiency {counterfactual.current_score?.toFixed(2)} → ~{counterfactual.projected_score.toFixed(2)}, gate 0.30)</span>
      )}
    </div>
  );
}
