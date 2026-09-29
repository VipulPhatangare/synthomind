/**
 * Composite observation weight per evidence event — the single formula the
 * whole system hangs off. Kept as a product of separable components so
 * leave-one-out sensitivity (services/analytics/kalman.js) can drop one
 * factor class cleanly.
 *
 * credibility_override (set by disputes.js when a dispute against this
 * event is upheld) short-circuits the normal rater-stats lookup — a
 * successful dispute is a direct, human-confirmed statement that this
 * SPECIFIC observation shouldn't carry its usual weight, which is a
 * stronger signal than the rater's population-level credibility and
 * shouldn't be diluted by it.
 */
const ATTRIBUTION_FACTOR = { individual: 1.0, shared: 0.6, team: 0.3 };
const R_BASE = 0.3; // baseline observation-noise variance at weight=1, on the 0-5 scale — tuned alongside kalman.js's Q values

export function raterCredibilityFor(event, raterStats) {
  if (event.credibility_override != null) return event.credibility_override;
  if (!event.rater_id) return 1.0; // no rater-bias concept for structured/self sources
  const s = raterStats.get(event.rater_id);
  return s ? s.credibility : 0.7; // unseen rater (shouldn't happen) — neutral default
}

export function computeWeight(event, raterStats) {
  const raterCredibility = raterCredibilityFor(event, raterStats);
  const attributionFactor = ATTRIBUTION_FACTOR[event.attribution] ?? 1.0;
  const specificityFactor = 0.4 + 0.6 * (event.specificity ?? 0.6);

  const weight =
    (event.source_reliability ?? 0.5) *
    raterCredibility *
    specificityFactor *
    (event.difficulty_context ?? 1.0) *
    (event.independence ?? 1.0) *
    (event.extraction_confidence ?? 1.0) *
    attributionFactor;

  const variance = R_BASE / Math.max(weight, 0.05);
  return { weight: Math.max(weight, 0.01), variance, raterCredibility };
}
