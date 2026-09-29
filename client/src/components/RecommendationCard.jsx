import { useState } from "react";
import { completeRecommendation } from "../api/client.js";

const ROOT_CAUSE_LABEL = {
  knowledge_gap: "Knowledge gap", application_gap: "Application gap",
  practice_gap: "Practice gap", consistency_gap: "Consistency gap",
  observation_gap: "Observation gap",
};

const OUTCOME_STYLE = {
  pending: { label: "Tracking — check-in pending", color: "var(--color-gold)" },
  evaluated: { label: "Evaluated", color: "var(--color-improving)" },
};

export default function RecommendationCard({ recommendation }) {
  const [outcome, setOutcome] = useState(recommendation?.outcome || null);
  const [busy, setBusy] = useState(false);
  if (!recommendation) return null;
  const r = recommendation;

  async function handleComplete() {
    setBusy(true);
    try {
      const created = await completeRecommendation(r.rec_id);
      setOutcome(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">
          {ROOT_CAUSE_LABEL[r.root_cause_tag] || r.root_cause_tag}
        </span>
        {r.priority > 0 && <span className="text-xs text-ink-muted">priority {r.priority.toFixed(2)}</span>}
      </div>
      {r.action_name ? (
        <p className="text-ink">
          <span className="font-medium">{r.action_name}</span>
          {r.expected_uplift != null && (
            <span className="text-ink-muted"> — expected uplift +{r.expected_uplift.toFixed(2)} in ~{r.expected_time_to_effect_days}d</span>
          )}
        </p>
      ) : (
        <p className="text-ink-muted">No matching catalog action found.</p>
      )}
      {r.gap != null && (
        <p className="mt-1 text-xs text-ink-muted">
          {r.gap > 0 ? `${r.gap.toFixed(2)} below role target` : `${Math.abs(r.gap).toFixed(2)} above role target`}
        </p>
      )}

      {/* D4: the concrete, sized evidence ask behind an observation_gap recommendation */}
      {r.evidence_request && (
        <div className="mt-2 rounded-md border border-dashed border-line bg-surface p-2 text-xs text-ink-muted">
          <span className="font-medium text-ink">What would change this: </span>
          {r.evidence_request.description}
          {r.evidence_request.projected_score != null && (
            <span> (sufficiency {r.evidence_request.current_score?.toFixed(2)} → ~{r.evidence_request.projected_score.toFixed(2)})</span>
          )}
        </div>
      )}

      {/* D1: close the loop — mark the action taken, and show where tracking stands */}
      <div className="mt-2 flex items-center gap-2">
        {!outcome ? (
          <button
            onClick={handleComplete}
            disabled={busy || !r.action_name}
            className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Marking…" : "Mark action taken"}
          </button>
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ color: OUTCOME_STYLE[outcome.status]?.color, background: `color-mix(in srgb, ${OUTCOME_STYLE[outcome.status]?.color} 16%, transparent)` }}
          >
            {OUTCOME_STYLE[outcome.status]?.label || outcome.status}
            {outcome.status === "evaluated" && outcome.realized_uplift != null && (
              <> · realized {outcome.realized_uplift >= 0 ? "+" : ""}{outcome.realized_uplift.toFixed(2)} (predicted +{outcome.predicted_uplift?.toFixed(2)})</>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
