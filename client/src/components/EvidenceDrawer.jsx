import { useEffect, useState } from "react";
import { getEvidence, createDispute } from "../api/client.js";

const SOURCE_LABEL = {
  assessment: "Assessment", kpi: "KPI", training: "Training", project: "Project",
  manager_feedback: "Manager feedback", peer_feedback: "Peer feedback",
  self_assessment: "Self-assessment", certification: "Certification",
};

function fmtDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function round2(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : n;
}

/** Human-readable sentence for structured (non-text) sources — the raw JSON
 * was unreadable and unrounded floats (e.g. 3.0019873870316642) made it worse. */
function formatRawValue(sourceType, rawValue) {
  if (!rawValue) return null;
  switch (sourceType) {
    case "assessment":
      return `Scored ${rawValue.raw_score}/${rawValue.max_score} on the assessment.`;
    case "self_assessment":
      return `Self-rated their level at ${rawValue.self_level}/5.`;
    case "project":
      return `Project outcome quality ${round2(rawValue.outcome_quality)}/5, on a complexity ${rawValue.complexity}/5 task.`;
    case "kpi":
      return `KPI result: ${round2(rawValue.value)} against a target of ${round2(rawValue.target)}.`;
    case "training":
      return `Training completed with a final score of ${rawValue.final_score}/100.`;
    case "certification":
      return "Certification awarded.";
    default:
      return null;
  }
}

export default function EvidenceDrawer({ employeeId, competencyId, onClose }) {
  const [data, setData] = useState(null);
  const [disputingId, setDisputingId] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [submitted, setSubmitted] = useState(new Set());

  useEffect(() => {
    getEvidence(employeeId, competencyId).then(setData);
  }, [employeeId, competencyId]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleDispute(eventId) {
    if (!disputeReason.trim()) return;
    await createDispute({ evidence_event_id: eventId, employee_id: employeeId, reason: disputeReason.trim() });
    setSubmitted((prev) => new Set(prev).add(eventId));
    setDisputingId(null);
    setDisputeReason("");
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-line bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">Evidence · {competencyId.replace(/_/g, " ")}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">✕</button>
        </div>

        {!data && <p className="text-sm text-ink-muted">Loading…</p>}

        {data && (
          <div className="space-y-3">
            {data.events.length === 0 && <p className="text-sm text-ink-muted">No evidence recorded.</p>}
            {data.events.map((e) => (
              <div
                key={e.event_id}
                className={`rounded-lg border p-3 text-sm ${
                  e.is_top_influential ? "border-brand/50 bg-brand/5" : "border-line bg-surface-2"
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                  <span>
                    <span className="font-medium text-ink">{SOURCE_LABEL[e.source_type] || e.source_type}</span>
                    {" · "}{fmtDate(e.occurred_at)}
                    {e.is_top_influential && <span className="ml-2 rounded-full bg-brand/20 px-1.5 py-0.5 text-brand">high influence</span>}
                    {e.disputed && <span className="ml-2 rounded-full bg-declining/15 px-1.5 py-0.5 text-declining">disputed · downweighted</span>}
                  </span>
                  <span>level {e.observed_level?.toFixed?.(2) ?? e.observed_level}/5</span>
                </div>

                {e.quote ? (
                  <p className="text-ink">"{e.quote}"</p>
                ) : (
                  <p className="text-ink-muted">{formatRawValue(e.source_type, e.raw_value) || "No further detail recorded."}</p>
                )}

                <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
                  <span>weight components: reliability {e.source_reliability} · specificity {e.specificity} · difficulty {e.difficulty_context}</span>
                </div>

                {!submitted.has(e.event_id) && disputingId !== e.event_id && (
                  <button
                    onClick={() => setDisputingId(e.event_id)}
                    className="mt-2 text-xs text-ink-muted underline hover:text-brand"
                  >
                    Contest this evidence
                  </button>
                )}
                {disputingId === e.event_id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      autoFocus
                      value={disputeReason}
                      onChange={(ev) => setDisputeReason(ev.target.value)}
                      placeholder="Why does this not reflect the full context?"
                      className="flex-1 rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink outline-none focus:border-brand"
                    />
                    <button
                      onClick={() => handleDispute(e.event_id)}
                      className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-black hover:bg-brand-hover"
                    >
                      Submit
                    </button>
                  </div>
                )}
                {submitted.has(e.event_id) && (
                  <p className="mt-2 text-xs text-improving">Dispute submitted for review.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
