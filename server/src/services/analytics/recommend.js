/**
 * Recommendation engine: prioritizes the gap, diagnoses a root cause from
 * the EVIDENCE PATTERN (not just the gap size), and matches an action from
 * the catalog. "Insufficient evidence" gets its own root cause too —
 * "go generate more evidence" is a legitimate, targeted recommendation.
 */
function variance(arr) {
  if (arr.length === 0) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
}

function diagnoseRootCause(verdict, events) {
  if (verdict === "insufficient_evidence") return "observation_gap";

  const hasTraining = events.some((e) => e.source_type === "training");
  const hasProject = events.some((e) => e.source_type === "project");

  if (!hasTraining && !hasProject) return "knowledge_gap";

  if (hasTraining) {
    const firstTraining = events.filter((e) => e.source_type === "training")
      .sort((a, b) => a.occurred_at - b.occurred_at)[0];
    const projectAfter = events.some((e) => e.source_type === "project" && e.occurred_at > firstTraining.occurred_at);
    if (!projectAfter) return "application_gap";
  }

  const rated = events.filter((e) => e.rater_id);
  if (rated.length >= 3) {
    const v = variance(rated.map((e) => e.observed_level));
    if (v > 1.0) return "consistency_gap";
  }

  return "practice_gap";
}

function matchAction(actionCatalog, competencyId, levelMu, rootCause) {
  let candidates = actionCatalog.filter(
    (a) => a.competency_tags.includes(competencyId) && a.prerequisite_level <= Math.round(levelMu) + 1
  );
  if (rootCause === "observation_gap") {
    const evidenceGenerating = candidates.filter((a) => ["project", "stretch_assignment"].includes(a.action_type));
    if (evidenceGenerating.length) candidates = evidenceGenerating;
  } else if (rootCause === "application_gap") {
    const applied = candidates.filter((a) => ["project", "stretch_assignment", "mentor"].includes(a.action_type));
    if (applied.length) candidates = applied;
  } else if (rootCause === "consistency_gap") {
    const coaching = candidates.filter((a) => a.action_type === "coaching");
    if (coaching.length) candidates = coaching;
  }
  candidates.sort((a, b) => b.historical_uplift_median - a.historical_uplift_median);
  return candidates[0] || null;
}

/**
 * Returns a recommendation doc, or null if there's no meaningful gap to close.
 *
 * evidenceCounterfactual (from sufficiency.js's suggestEvidenceForSufficiency,
 * already computed for this pair when it abstained) is threaded straight
 * through as evidence_request when the root cause IS the evidence gap —
 * this is what makes an "observation_gap" recommendation concrete ("ask for
 * 2 ratings from raters outside the current group") instead of a generic
 * "go generate more evidence" restated as an action-catalog entry.
 */
export function buildRecommendation({
  employeeId, competencyId, verdict, levelMu, velocityMu, sufficiency,
  roleProfile, events, actionCatalog, influences, nowDate, evidenceCounterfactual,
}) {
  if (!roleProfile) return null;
  const gap = roleProfile.target_level - levelMu;
  if (gap <= 0.3 && verdict !== "insufficient_evidence") return null;

  const momentum = Math.min(1, Math.max(-1, velocityMu / 0.3));
  const businessImpact = roleProfile.is_growth_edge ? 1.2 : 1.0;
  const priority = Math.max(gap, 0) * roleProfile.criticality * (1 - momentum) * businessImpact;

  const rootCause = diagnoseRootCause(verdict, events);
  const action = matchAction(actionCatalog, competencyId, levelMu, rootCause);

  const topEvidence = [...influences]
    .sort((a, b) => b.influence - a.influence)
    .slice(0, 3);

  return {
    rec_id: `REC-${employeeId}-${competencyId}`,
    employee_id: employeeId,
    competency_id: competencyId,
    issued_at: nowDate,
    verdict,
    root_cause_tag: rootCause,
    gap: Math.round(gap * 100) / 100,
    priority: Math.round(priority * 1000) / 1000,
    action_id: action?.action_id ?? null,
    action_name: action?.name ?? null,
    expected_uplift: action?.historical_uplift_median ?? null,
    expected_time_to_effect_days: action?.historical_time_to_effect_days ?? null,
    top_evidence: topEvidence,
    evidence_request: rootCause === "observation_gap" ? (evidenceCounterfactual || null) : null,
  };
}
