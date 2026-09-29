/**
 * Quarter calendar + true-trajectory dynamics for the 11 archetypes.
 * JS port of the Python archetypes.py — see that file's header comment for
 * the full rationale (true-trajectory vs observation-layer archetypes).
 */
export const N_QUARTERS = 8;

const QUARTER_SEQ = [
  [2024, 4], [2025, 1], [2025, 2], [2025, 3],
  [2025, 4], [2026, 1], [2026, 2], [2026, 3],
];

function quarterBounds(year, q) {
  const startMonth = (q - 1) * 3; // 0-indexed month
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = q === 4
    ? new Date(Date.UTC(year, 11, 31))
    : new Date(Date.UTC(year, startMonth + 3, 0)); // day 0 = last day of prev month
  return { start, end };
}

export function buildQuarters() {
  const quarters = QUARTER_SEQ.map(([year, q], idx) => {
    let { start, end } = quarterBounds(year, q);
    if (idx === QUARTER_SEQ.length - 1) {
      const cap = new Date(Date.UTC(2026, 8, 29));
      if (end > cap) end = cap;
    }
    return { idx, label: `${year}-Q${q}`, start, end };
  });
  return quarters;
}

export const QUARTERS = buildQuarters();

export function randomTimestampInQuarter(rng, quarter) {
  const spanDays = Math.max(Math.round((quarter.end - quarter.start) / 86400000), 1);
  const offset = rng.integers(0, spanDays + 1);
  return new Date(quarter.start.getTime() + offset * 86400000);
}

// ---------------------------------------------------------------------------
// True-trajectory archetypes
// ---------------------------------------------------------------------------

export const TRUE_DYNAMICS = {
  // Magnitudes are set well clear of the verdict engine's ROPE delta (0.15)
  // so a well-estimated posterior can actually cross the 80% confidence
  // bar — a true beta only marginally past delta is undetectable by ANY
  // estimator once realistic observation noise is folded in (see Phase 3
  // debugging notes). Still well within the 0-5 scale ceiling over 8 quarters.
  steady_improver: { beta: () => 0.35, noiseSd: 0.08 },
  true_stagnator: { beta: () => 0.0, noiseSd: 0.06 },
  noisy_flat: { beta: () => 0.0, noiseSd: 0.22 },
  decliner: { beta: () => -0.32, noiseSd: 0.08 },
  late_bloomer: { beta: (q) => (q < 4 ? 0.0 : 0.42), noiseSd: 0.10 },
  role_switch_up: { beta: () => 0.38, noiseSd: 0.08 },
  role_switch_down: { beta: () => -0.28, noiseSd: 0.08 },
  biased_rater_true: { beta: () => 0.0, noiseSd: 0.06 },
  halo_true: { beta: () => 0.0, noiseSd: 0.10 },
  sparse_true: { beta: () => 0.08, noiseSd: 0.05 },
  unobserved_true: { beta: () => 0.05, noiseSd: 0.05 },
  // True dynamics look exactly like a clean steady_improver — the point is
  // that the EVIDENCE (see generate.js's dropoutFromQuarter for this
  // archetype in the general random pool) stops early enough that by the
  // dataset's "now", it's 14-17 months stale. A system that only checks
  // volume/diversity would call this one improving; sufficiency.js's
  // recency component is specifically what should catch it instead.
  stale_true: { beta: () => 0.35, noiseSd: 0.08 },
};

// sparse_true / unobserved_true previously existed only as two single
// showcase employees (eval support: n=2, n=1) — nowhere near enough to
// measure insufficient_evidence precision/recall, and macro-F1 is
// structurally capped low while that class has ~0 support. Added to the
// general pool (with generate.js's assignment loop also giving them their
// defining evidence constraint — sparseCap / dropoutFromQuarter — not just
// the trajectory) alongside a new stale_true, at a combined ~7.5%: dense
// evidence density elsewhere in this dataset means the sufficiency gate
// almost never binds without a dedicated archetype exercising it.
export const RANDOM_POOL = [
  "steady_improver", "true_stagnator", "noisy_flat", "decliner", "late_bloomer",
  "sparse_true", "unobserved_true", "stale_true",
];
export const RANDOM_POOL_WEIGHTS = [0.259, 0.2775, 0.13875, 0.111, 0.13875, 0.025, 0.025, 0.025];

export function simulateTrueSeries(rng, archetype, startLevel) {
  const dyn = TRUE_DYNAMICS[archetype];
  const theta = [Math.round(rng.clip(startLevel, 0.2, 5.0) * 1000) / 1000];
  const betaList = [0.0];
  for (let q = 1; q < N_QUARTERS; q++) {
    const beta = dyn.beta(q) + rng.normal(0, 0.04);
    const noise = rng.normal(0, dyn.noiseSd);
    const newTheta = rng.clip(theta[theta.length - 1] + beta + noise, 0.2, 5.0);
    theta.push(Math.round(newTheta * 1000) / 1000);
    betaList.push(Math.round(beta * 1000) / 1000);
  }
  return { theta, betaList };
}

export function expectedVerdict(archetype, betaList, delta = 0.15) {
  // All three: the underlying trend may be perfectly real, but the evidence
  // backing it is too thin/stale for ANY estimator to call it confidently —
  // that's the property being tested, independent of the true beta.
  if (archetype === "sparse_true" || archetype === "unobserved_true" || archetype === "stale_true") {
    return "insufficient_evidence";
  }
  const finalBeta = betaList[betaList.length - 1];
  if (Math.abs(finalBeta) < delta) return "stagnating";
  return finalBeta > 0 ? "improving" : "declining";
}
