import { useState } from "react";

// Matches server/data_gen/archetypes.js's QUARTERS (buildQuarters()) exactly
// — 8 quarters, Oct 2024 through the dataset's "now" cap (Aug 29 2026). This
// duplicates a server constant client-side (same tradeoff EmployeeDetail.jsx
// already makes for tFor()); it's fixed by the dataset's seed, not runtime
// state, so it's safe to hardcode rather than round-trip an API call for it.
const QUARTER_LABELS = ["2024 Q4", "2025 Q1", "2025 Q2", "2025 Q3", "2025 Q4", "2026 Q1", "2026 Q2", "2026 Q3"];
const QUARTER_END_DATES = [
  "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30",
  "2025-12-31", "2026-03-31", "2026-06-30", "2026-08-29",
];

/**
 * C3, reworked from a date-input + button into a draggable quarter scrubber
 * — the single clearest demo of "continuous belief, not a snapshot report":
 * dragging left visibly changes verdicts and trajectories in place. The API
 * call fires on release (pointerUp/keyUp), not on every drag frame, so
 * dragging itself stays free while still feeling live.
 */
export default function TimeTravelControl({ onReplay, onReset, active, loading }) {
  const [step, setStep] = useState(QUARTER_LABELS.length - 1);

  function commit(nextStep) {
    setStep(nextStep);
    onReplay(QUARTER_END_DATES[nextStep]);
  }

  const isNow = step === QUARTER_LABELS.length - 1;

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface-2 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-meta text-ink-muted">
          Time travel — replay verdicts as of an earlier quarter
        </span>
        {active && !isNow && (
          <button onClick={() => { setStep(QUARTER_LABELS.length - 1); onReset(); }} className="text-meta text-brand hover:text-brand-hover">
            Reset to now
          </button>
        )}
      </div>

      <input
        type="range"
        min={0}
        max={QUARTER_LABELS.length - 1}
        step={1}
        value={step}
        onChange={(e) => setStep(Number(e.target.value))} // live label while dragging, no API call yet
        onPointerUp={(e) => commit(Number(e.target.value))}
        onKeyUp={(e) => commit(Number(e.target.value))}
        className="w-full accent-brand"
        aria-label="Replay date"
      />
      <div className="text-meta mt-1 flex justify-between text-ink-muted">
        {QUARTER_LABELS.map((label, i) => (
          <span key={label} className={i === step ? "font-medium text-ink" : ""}>{label}</span>
        ))}
      </div>

      <p className="text-meta mt-2 text-ink-muted">
        {loading
          ? "Replaying…"
          : isNow
            ? "Showing current verdicts — drag left to see what the system would have said earlier."
            : `Showing verdicts as of ${QUARTER_LABELS[step]}, computed from only the evidence that existed by then.`}
      </p>
    </div>
  );
}
