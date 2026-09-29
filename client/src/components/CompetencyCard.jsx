import { useState } from "react";
import VerdictChip from "./VerdictChip.jsx";
import TrajectoryChart from "./TrajectoryChart.jsx";
import Sparkline from "./ui/Sparkline.jsx";
import EvidenceCounterfactual from "./EvidenceCounterfactual.jsx";
import RecommendationCard from "./RecommendationCard.jsx";
import WhyThisVerdict from "./WhyThisVerdict.jsx";

const VERDICT_COLOR = {
  improving: "var(--color-improving)", declining: "var(--color-declining)",
  stagnating: "var(--color-stagnating)", insufficient_evidence: "var(--color-insufficient)",
};

const SUFFICIENCY_LABEL = (score) => {
  if (score >= 0.7) return { label: "Strong", color: "var(--color-improving)" };
  if (score >= 0.4) return { label: "Moderate", color: "var(--color-gold)" };
  return { label: "Weak", color: "var(--color-declining)" };
};

/**
 * One competency's full picture, collapsible. Collapsed shows a scannable
 * summary row (verdict, sparkline, gap); expanded shows the full chart,
 * counterfactual, WhyThisVerdict breakdown, and recommendation — reading
 * six of these to form an impression of a person was the EmployeeDetail
 * problem this fixes, and it also means only the expanded card's Recharts
 * instance is mounted at once.
 */
export default function CompetencyCard({ competency: c, expanded, onToggleExpand, forecast, asOfResult, asOfDate, orgEvents, nowT, onViewEvidence, whyDefaultOpen, syncId }) {
  const [whyOpen, setWhyOpen] = useState(!!whyDefaultOpen);
  const v = c.verdict;

  if (!v) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-section text-ink">{c.name}</h2>
        <p className="text-meta mt-1 text-ink-muted">No verdict computed yet.</p>
      </div>
    );
  }

  const suff = SUFFICIENCY_LABEL(v.sufficiency_score);
  const regimeSinceT = v.evidence_window?.scope === "recent_regime" && v.evidence_window.since_t != null ? v.evidence_window.since_t : null;

  if (!expanded) {
    return (
      <button
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-brand"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="text-section min-w-0 truncate text-ink">{c.name}</span>
          <Sparkline history={v.level_history} color={VERDICT_COLOR[v.verdict]} />
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <VerdictChip verdict={v.verdict} confidence={v.confidence} size="sm" />
          <span className="text-meta text-ink-muted">+</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-brand/40 bg-surface p-4">
      <button onClick={onToggleExpand} className="mb-2 flex w-full items-center justify-between text-left">
        <h2 className="text-section text-ink">{c.name}</h2>
        <span className="flex items-center gap-2">
          <VerdictChip verdict={v.verdict} confidence={v.confidence} />
          <span className="text-meta text-ink-muted">−</span>
        </span>
      </button>

      <TrajectoryChart
        history={v.level_history}
        roleTargetLevel={v.role_target_level}
        verdict={v.verdict}
        forecast={forecast?.forecast}
        nowT={nowT}
        regimeSinceT={regimeSinceT}
        orgEvents={orgEvents}
        syncId={syncId}
      />
      <div className="num mt-2 flex items-center justify-between text-meta text-ink-muted">
        <span>level {v.level_mu.toFixed(2)} ± {v.level_sd.toFixed(2)} · velocity {v.velocity_mu >= 0 ? "+" : ""}{v.velocity_mu.toFixed(2)}/qtr</span>
        <span style={{ color: suff.color }}>{suff.label} evidence ({v.n_observations} obs)</span>
      </div>

      {regimeSinceT != null && (
        <p className="text-meta mt-1 italic text-ink-muted">
          Full history reads {v.full_series?.verdict?.replace(/_/g, " ")} ({((v.full_series?.confidence ?? 0) * 100).toFixed(0)}%);
          this verdict is based on the {v.n_observations} observations since {new Date(v.evidence_window.since_date).toISOString().slice(0, 10)}.
        </p>
      )}

      {forecast?.forecast?.reaches_target && (
        <p className="text-meta mt-1 text-ink-muted">
          On current trajectory, reaches role target in ~{forecast.forecast.median_t?.toFixed(1)} quarters
          {forecast.forecast.early_t != null && forecast.forecast.late_t != null && (
            <> (80% CI: {forecast.forecast.early_t.toFixed(1)}–{forecast.forecast.late_t.toFixed(1)})</>
          )}
          {forecast.forecast_with_action?.reaches_target && (
            <> · with "{forecast.action_name}": ~{forecast.forecast_with_action.median_t?.toFixed(1)} quarters</>
          )}
        </p>
      )}

      {v.sufficiency_flags?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {v.sufficiency_flags.map((f) => (
            <span key={f} className="text-meta rounded-full bg-surface-2 px-2 py-0.5 text-ink-muted">{f.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}

      <EvidenceCounterfactual counterfactual={v.evidence_counterfactual} />

      {asOfResult && (
        <div className="mt-2 rounded-md border border-line bg-surface-2 p-2 text-meta">
          <span className="font-medium text-ink">As of {asOfDate}: </span>
          <span className="text-ink-muted">
            {asOfResult.verdict.replace(/_/g, " ")}
            {asOfResult.confidence != null && ` (${(asOfResult.confidence * 100).toFixed(0)}%)`}
            {" · "}{asOfResult.n_observations} observations existed then, vs {v.n_observations_total ?? v.n_observations} now
          </span>
        </div>
      )}

      <div className="mt-3 flex items-center gap-4">
        <button onClick={onViewEvidence} className="text-meta font-medium text-brand hover:text-brand-hover">
          View evidence →
        </button>
        <button onClick={() => setWhyOpen((o) => !o)} className="text-meta font-medium text-ink-muted hover:text-ink">
          {whyOpen ? "Hide reasoning" : "Why this verdict?"}
        </button>
      </div>

      {whyOpen && (
        <div className="mt-3">
          <WhyThisVerdict verdict={v} />
        </div>
      )}

      {c.recommendation && (
        <div className="mt-3">
          <RecommendationCard recommendation={c.recommendation} />
        </div>
      )}
    </div>
  );
}
