import { useState } from "react";
import ProbabilityBar from "./ProbabilityBar.jsx";
import SufficiencyRadar from "./SufficiencyRadar.jsx";
import RobustnessRow from "./RobustnessRow.jsx";
import Term from "./ui/Term.jsx";

function Stage({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-meta font-medium text-ink">{title}</span>
        <span className="text-meta text-ink-muted">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/**
 * The evidence -> verdict reasoning chain, expandable per stage. Every
 * number here already exists on the stored verdict doc (probs,
 * sufficiency_components, cross_checks, loo_sensitivity, regime) — this is
 * purely a presentation layer making them visible instead of computed and
 * discarded. Converts "trust me, 84%" into "here's the arithmetic".
 */
export default function WhyThisVerdict({ verdict }) {
  if (!verdict) return null;
  const v = verdict;
  const nSince = v.evidence_window?.scope === "recent_regime";

  return (
    <div className="rounded-lg border border-line bg-surface-2/50 p-3">
      <Stage title={`1. Evidence — ${v.n_observations} observations${nSince ? " (recent regime)" : ""}`}>
        <p className="text-meta text-ink-muted">
          {v.n_observations} observation{v.n_observations === 1 ? "" : "s"}
          {v.n_observations_total != null && v.n_observations_total !== v.n_observations && ` of ${v.n_observations_total} total`},
          weighted by source reliability × rater <Term term="calibration">credibility</Term> × specificity × independence.
        </p>
        {nSince && (
          <p className="text-meta mt-1 text-ink-muted">
            Full history read differently ({v.full_series?.verdict?.replace(/_/g, " ")}, {((v.full_series?.confidence ?? 0) * 100).toFixed(0)}%)
            — this verdict is based on the <Term term="regime">current regime</Term> since {v.evidence_window.since_date ? new Date(v.evidence_window.since_date).toISOString().slice(0, 10) : "the detected change point"}.
          </p>
        )}
      </Stage>

      <Stage title={`2. Posterior — level ${v.level_mu?.toFixed(2)} ±${v.level_sd?.toFixed(2)}, velocity ${v.velocity_mu >= 0 ? "+" : ""}${v.velocity_mu?.toFixed(2)}/qtr`}>
        <p className="text-meta text-ink-muted">
          The Kalman filter's updated belief (<Term term="posterior">posterior</Term>) after combining a generic starting
          assumption with every weighted observation, propagated over continuous time.
        </p>
      </Stage>

      <Stage title={`3. ${"±"}0.15/qtr threshold test (ROPE)`} defaultOpen>
        <ProbabilityBar probs={v.probs} velocityMu={v.velocity_mu} velocitySd={v.velocity_sd} />
      </Stage>

      <Stage title={`4. Evidence sufficiency — ${v.sufficiency_score?.toFixed(2)} (gate: 0.30)`}>
        <SufficiencyRadar components={v.sufficiency_components} flags={v.sufficiency_flags} />
        {v.evidence_counterfactual && (
          <p className="text-meta mt-2 rounded-md border border-dashed border-insufficient/40 bg-insufficient/5 p-2 text-ink-muted">
            <span className="font-medium text-ink">What would change this: </span>{v.evidence_counterfactual.description}
          </p>
        )}
      </Stage>

      <Stage title="Robustness — does the verdict survive dropping a source?">
        <RobustnessRow sensitivity={v.loo_sensitivity} />
      </Stage>

      {v.cross_checks && (v.cross_checks.theil_sen_slope != null || v.cross_checks.mann_kendall_tau != null) && (
        <Stage title="Independent cross-checks">
          <div className="text-meta space-y-1 text-ink-muted">
            {v.cross_checks.theil_sen_slope != null && (
              <p>Theil-Sen slope (outlier-robust, no distributional assumption): {v.cross_checks.theil_sen_slope >= 0 ? "+" : ""}{v.cross_checks.theil_sen_slope.toFixed(2)}/qtr</p>
            )}
            {v.cross_checks.mann_kendall_tau != null && (
              <p>Mann-Kendall trend test: {"τ"}={v.cross_checks.mann_kendall_tau.toFixed(2)}, p={v.cross_checks.mann_kendall_p?.toFixed(3)}</p>
            )}
          </div>
        </Stage>
      )}
    </div>
  );
}
