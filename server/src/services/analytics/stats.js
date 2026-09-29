/**
 * Small stats primitives with no external dependency: normal CDF (via an
 * erf approximation), Theil-Sen slope, Mann-Kendall trend test, and a
 * sequential CUSUM change-point detector.
 *
 * CUSUM is a deliberate simplification of the "ruptures/PELT" approach
 * named in the original plan — good enough to flag an approximate change
 * point and explain it, not a full offline changepoint search.
 */

// Abramowitz & Stegun 7.1.26 approximation, accurate to ~1.5e-7
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function normalCdf(x, mean = 0, sd = 1) {
  if (sd <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

/** points: [{t, y}] — median of all pairwise slopes. Robust to outliers. */
export function theilSenSlope(points) {
  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = points[j].t - points[i].t;
      if (dt === 0) continue;
      slopes.push((points[j].y - points[i].y) / dt);
    }
  }
  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  return slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;
}

/** points: [{t, y}] (any order) — sign-based trend test, no tie correction. */
export function mannKendall(points) {
  const n = points.length;
  if (n < 3) return { S: 0, z: 0, pValue: 1, tau: 0 };
  const sorted = [...points].sort((a, b) => a.t - b.t);
  let S = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      S += Math.sign(sorted[j].y - sorted[i].y);
    }
  }
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  let z = 0;
  if (S > 0) z = (S - 1) / Math.sqrt(varS);
  else if (S < 0) z = (S + 1) / Math.sqrt(varS);
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const tau = S / (0.5 * n * (n - 1));
  return { S, z, pValue, tau };
}

/**
 * Offline CUSUM change-point LOCALIZER over an ORDERED (by time) value
 * series. Returns the index of the first post-break observation (matching
 * fitTrajectory's `obs.slice(0, idx)` / `obs.slice(idx)` split convention),
 * or null if the series is too short to localize.
 *
 * This is the classic single-changepoint CUSUM estimator (Page 1954 /
 * Taylor's "detection of a step change" form): C_k = sum_{i<=k}(x_i - xbar).
 * Since sum of all deviations from the mean is 0, C_k starts and ends at 0
 * and reaches its extreme at the true break — argmax|C_k| localizes it
 * directly, with no threshold to tune.
 *
 * Deliberately NOT Page's sequential monitoring CUSUM (accumulate-and-reset
 * against a drift allowance k and alarm threshold h): that variant is built
 * to raise an alarm as soon as a shift is confirmed, which for a series
 * that keeps climbing after the break drifts the "alarm" index toward the
 * END of the series rather than the actual onset — the wrong answer for
 * localization, which is what regime segmentation (kalman.js) needs.
 * Significance ("is a two-regime model actually justified") is left to the
 * caller's BIC comparison rather than a k/h threshold here — cleaner
 * separation between "where" (this function) and "whether" (fitTrajectory).
 */
export function cusumChangePoint(values) {
  const n = values.length;
  if (n < 6) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  let cum = 0;
  let bestIdx = null, bestMag = 0;
  // Exclude the last index: C_(n-1) == 0 by construction, so it can never
  // be a genuine extreme and including it would just add dead work.
  for (let i = 0; i < n - 1; i++) {
    cum += values[i] - mean;
    const mag = Math.abs(cum);
    if (mag > bestMag) { bestMag = mag; bestIdx = i; }
  }
  return bestIdx == null ? null : bestIdx + 1;
}
