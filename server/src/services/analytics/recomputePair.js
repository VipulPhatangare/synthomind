/**
 * On-demand single-pair recompute — shared by the dispute-correction route
 * (weight one specific event down, see what changes) and the time-travel
 * route (replay with only evidence up to a date). Full-history only: no
 * regime segmentation / recency-override, which is a pipeline-level
 * decision made across the whole employee×competency population in
 * runAnalytics.js, not something worth re-deriving for a single on-demand
 * pair. A dispute correction or a time-travel replay that lands on
 * "insufficient_evidence" where the batch pipeline found a confident recent
 * regime is the one place these two paths can disagree — both routes that
 * use this say so explicitly rather than silently presenting a different
 * number than the stored verdict.
 */
import { computeWeight } from "./weighting.js";
import { runKalmanAdaptive } from "./kalman.js";
import { computeSufficiency } from "./sufficiency.js";
import { ropeVerdict } from "./verdictLogic.js";

const DATASET_START = new Date(Date.UTC(2024, 9, 1));
const MS_PER_QUARTER = 91.25 * 86400000;
export function tForDate(date) {
  return (new Date(date).getTime() - DATASET_START.getTime()) / MS_PER_QUARTER;
}

/**
 * events: evidence_events for one (employee, competency) pair, each needing
 * ._quarterIdx set (Math.floor(tForDate(e.occurred_at))) before calling.
 * raterStats: Map from calibration.js.
 * nowDate: Date to treat as "today" for recency scoring.
 */
export function recomputePairVerdict(events, raterStats, nowDate) {
  if (events.length === 0) {
    return {
      verdict: "insufficient_evidence", confidence: null, probs: null,
      level_mu: null, velocity_mu: null, velocity_sd: null,
      n_observations: 0, sufficiency_score: 0, sufficiency_flags: ["no_evidence"],
    };
  }

  const weighted = events.map((e) => ({ event: e, ...computeWeight(e, raterStats) }));
  const observations = weighted.map((w) => ({
    t: tForDate(w.event.occurred_at), level: w.event.observed_level, variance: w.variance,
    eventId: w.event.event_id, sourceType: w.event.source_type,
  }));

  const kalman = runKalmanAdaptive(observations);
  const sufficiency = computeSufficiency(events, weighted.map((w) => w.weight), raterStats, nowDate);
  const result = ropeVerdict(kalman.velocityMu, kalman.velocityVar, sufficiency.score);

  return {
    verdict: result.verdict,
    confidence: result.confidence,
    probs: result.probs,
    level_mu: Math.round(kalman.levelMu * 1000) / 1000,
    velocity_mu: Math.round(kalman.velocityMu * 1000) / 1000,
    velocity_sd: Math.round(Math.sqrt(kalman.velocityVar) * 1000) / 1000,
    n_observations: events.length,
    sufficiency_score: sufficiency.score,
    sufficiency_flags: sufficiency.flags,
  };
}
