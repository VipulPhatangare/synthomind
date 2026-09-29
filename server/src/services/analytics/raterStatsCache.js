/**
 * Rater calibration is global (computed once from ALL manager/peer feedback)
 * and changes only when run-analytics runs, so on-demand routes that need
 * it (time-travel, dispute correction) share one per-process cache rather
 * than each re-scanning the whole feedback collection per request.
 * Invalidated on dispute resolution (the one thing that changes an event's
 * effective credibility outside of a full run-analytics) via invalidate().
 */
import { computeRaterStats } from "./calibration.js";

let raterStatsCache = null;

export async function getRaterStats(db) {
  if (raterStatsCache) return raterStatsCache;
  const ratedEvents = await db.collection("evidence_events")
    .find({ source_type: { $in: ["manager_feedback", "peer_feedback"] } })
    .toArray();
  raterStatsCache = computeRaterStats(ratedEvents).raterStats;
  return raterStatsCache;
}

export function invalidateRaterStatsCache() {
  raterStatsCache = null;
}
