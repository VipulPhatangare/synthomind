/**
 * Rater calibration: per-rater leniency, range restriction, and halo index,
 * computed once across the whole dataset from manager_feedback /
 * peer_feedback evidence_events. This is what stops "a manager swapped
 * mid-series" or "one rater gives everyone a 5" from reading as a genuine
 * skill change.
 */

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function variance(arr, m) { return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length; }

/**
 * ratedEvents: evidence_events with source_type in manager_feedback/peer_feedback,
 * each having { rater_id, source_ref_id, observed_level }.
 * Returns Map<rater_id, { leniency, rangeRestriction, haloIndex, credibility, nRatings }>
 */
export function computeRaterStats(ratedEvents) {
  const globalMean = mean(ratedEvents.map((e) => e.observed_level));
  const globalSd = Math.sqrt(variance(ratedEvents.map((e) => e.observed_level), globalMean)) || 0.8;

  // group by session (rater_id + source_ref_id) for halo variance
  const sessions = new Map();
  for (const e of ratedEvents) {
    const key = `${e.rater_id}::${e.source_ref_id}`;
    if (!sessions.has(key)) sessions.set(key, { rater_id: e.rater_id, levels: [] });
    sessions.get(key).levels.push(e.observed_level);
  }

  const multiRatingSessions = [...sessions.values()].filter((s) => s.levels.length >= 2);
  const globalAvgSessionVariance = multiRatingSessions.length
    ? mean(multiRatingSessions.map((s) => variance(s.levels, mean(s.levels))))
    : 0.5;

  const byRaterSessions = new Map();
  for (const s of multiRatingSessions) {
    if (!byRaterSessions.has(s.rater_id)) byRaterSessions.set(s.rater_id, []);
    byRaterSessions.get(s.rater_id).push(variance(s.levels, mean(s.levels)));
  }

  const byRaterRatings = new Map();
  for (const e of ratedEvents) {
    if (!byRaterRatings.has(e.rater_id)) byRaterRatings.set(e.rater_id, []);
    byRaterRatings.get(e.rater_id).push(e.observed_level);
  }

  const stats = new Map();
  for (const [raterId, ratings] of byRaterRatings.entries()) {
    const raterMean = mean(ratings);
    const raterSd = Math.sqrt(variance(ratings, raterMean)) || 0.01;
    const leniency = raterMean - globalMean;
    const rangeRestriction = raterSd / globalSd;

    const sessionVars = byRaterSessions.get(raterId);
    const haloIndex = sessionVars && sessionVars.length
      ? Math.min(1, Math.max(0, 1 - mean(sessionVars) / globalAvgSessionVariance))
      : 0;

    const credibility = Math.min(1, Math.max(0.2,
      1.0 - 0.4 * haloIndex - 0.3 * Math.max(0, 1 - rangeRestriction)
    ));

    stats.set(raterId, {
      leniency: Math.round(leniency * 1000) / 1000,
      rangeRestriction: Math.round(rangeRestriction * 1000) / 1000,
      haloIndex: Math.round(haloIndex * 1000) / 1000,
      credibility: Math.round(credibility * 1000) / 1000,
      nRatings: ratings.length,
    });
  }

  return { raterStats: stats, globalMean, globalSd };
}
