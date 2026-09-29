/**
 * Trajectory forecasting: projects the Kalman posterior (level/velocity,
 * each with their own uncertainty) forward in time to estimate WHEN an
 * employee reaches their role target level, with a confidence band — not
 * just the current slope. Computed on demand from a stored verdict rather
 * than precomputed, since it's cheap (closed-form-ish, no re-fit) and
 * naturally reflects the role's current target without a data regen if
 * that target changes.
 *
 * Approximation: level(t) ~ Normal(levelMu + t*velocityMu, levelVar +
 * t^2*velocityVar) — i.e. uncertainty in the CURRENT slope propagated
 * linearly forward, ignoring the level/velocity covariance term (not
 * tracked past the end of filtering) and ignoring further process noise
 * accrual beyond what's already in velocityVar. This is a first-passage-time
 * estimate via the normal approximation at each fixed t, not an exact
 * first-passage distribution — documented here rather than presented as
 * more precise than it is.
 */
import { normalCdf } from "./stats.js";

const DEFAULT_MAX_HORIZON_QUARTERS = 12; // 3 years out — beyond this we just say "not on a visible timeline"
const MS_PER_QUARTER = 91.25 * 86400000;

/**
 * Returns null when there's no target to forecast against or the employee
 * is already there; { reaches_target: false, reason } when velocity isn't
 * positive enough to ever cross it within the horizon; otherwise
 * { median_t, early_t, late_t, median_date, early_date, late_date }, each
 * t in quarters from "now" (the verdict's updated_at).
 */
export function forecastTimeToTarget({ levelMu, levelVar, velocityMu, velocityVar, target, asOfDate, maxHorizonQuarters = DEFAULT_MAX_HORIZON_QUARTERS, tOffset = 0 }) {
  if (target == null) return null;
  if (levelMu >= target) return { already_at_target: true };

  const sd0 = Math.sqrt(Math.max(levelVar, 1e-6));
  if (velocityMu <= 0.02) {
    return {
      reaches_target: false,
      reason: velocityMu < -0.02 ? "currently_declining" : "currently_flat",
      gap: Math.round((target - levelMu) * 100) / 100,
    };
  }

  const levelAt = (t) => levelMu + t * velocityMu;
  const sdAt = (t) => Math.sqrt(Math.max(levelVar + t * t * velocityVar, 1e-6));
  const pReachedBy = (t) => 1 - normalCdf(target, levelAt(t), sdAt(t));

  if (pReachedBy(maxHorizonQuarters) < 0.5) {
    return {
      reaches_target: false,
      reason: "beyond_horizon",
      gap: Math.round((target - levelMu) * 100) / 100,
      p_reached_by_horizon: Math.round(pReachedBy(maxHorizonQuarters) * 1000) / 1000,
    };
  }

  // Bisection: pReachedBy is monotonically increasing in t (for
  // velocityMu > 0.02, the trend eventually dominates the fixed sd0
  // floor), so a simple binary search finds each percentile's crossing.
  const findT = (p) => {
    let lo = 0, hi = maxHorizonQuarters;
    if (pReachedBy(hi) < p) return null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (pReachedBy(mid) >= p) hi = mid; else lo = mid;
    }
    return hi;
  };

  const medianT = findT(0.5);
  const earlyT = findT(0.9);  // 10th percentile of ETA — could reach this early
  const lateT = findT(0.1);   // 90th percentile of ETA — 90% confident by this point

  const toDate = (t) => (t == null || !asOfDate ? null : new Date(asOfDate.getTime() + (t + tOffset) * MS_PER_QUARTER));

  return {
    reaches_target: true,
    median_t: medianT != null ? Math.round((medianT + tOffset) * 100) / 100 : null,
    early_t: earlyT != null ? Math.round((earlyT + tOffset) * 100) / 100 : null,
    late_t: lateT != null ? Math.round((lateT + tOffset) * 100) / 100 : null,
    median_date: toDate(medianT),
    early_date: toDate(earlyT),
    late_date: toDate(lateT),
  };
}

/**
 * "With the recommended action" overlay: models the action as a one-time
 * level bump (expected_uplift) landing at expected_time_to_effect_days,
 * after which the SAME velocity continues. Deliberately not more elaborate
 * than that — expected_uplift/expected_time_to_effect_days are themselves
 * seeded medians from action_catalog (real-world variance not modeled), so
 * a more detailed simulation here would be false precision on top of an
 * already-approximate input. See D1 in the plan (recommendation outcome
 * tracking) for how those seeded numbers get replaced with observed ones
 * over time.
 */
export function forecastWithAction({ levelMu, levelVar, velocityMu, velocityVar, target, asOfDate, maxHorizonQuarters }, action) {
  if (!action?.expected_uplift) return null;
  const tEffect = Math.max((action.expected_time_to_effect_days || 90) / 91.25, 0.1);
  const boostedLevel = levelMu + tEffect * velocityMu + action.expected_uplift;
  const boostedVar = levelVar + tEffect * tEffect * velocityVar;
  return forecastTimeToTarget({
    levelMu: boostedLevel, levelVar: boostedVar, velocityMu, velocityVar, target, asOfDate,
    maxHorizonQuarters: maxHorizonQuarters != null ? Math.max(maxHorizonQuarters - tEffect, 1) : undefined,
    tOffset: tEffect,
  });
}
