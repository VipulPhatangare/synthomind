/**
 * Employee-level divergence detection: the part of the brief the per-pair
 * verdict pipeline supports structurally (every verdict is already scoped
 * to one competency) but never surfaces — "cases where one skill improves
 * while another weakens". Runs once per employee, after all of that
 * employee's per-competency verdicts exist, over the SAME verdict docs
 * (no separate model, no new evidence source).
 *
 * Two things come out of it:
 *
 *  1. profile_shape — a coarse classification of the whole competency set,
 *     for list/filter views ("show me divergent profiles").
 *
 *  2. tradeoff_pairs — specific (gaining, losing) competency pairs whose
 *     LEVEL HISTORIES move in opposite directions DURING THE SAME WINDOW,
 *     not just "one is up and one is down somewhere in the history" (which
 *     would flag almost every profile with >=2 confident verdicts). What
 *     the correlation check establishes is CONCURRENCY — these two moved
 *     opposite ways at the same time, ruling out e.g. one declining in
 *     2024 and the other rising in 2026 with no real overlap. It does NOT
 *     establish causation, and two competencies that are each confidently
 *     (near-linearly) trending in opposite directions will correlate
 *     strongly whenever they overlap in time pretty much by construction —
 *     both are close to linear functions of the same time axis. That's why
 *     candidate_org_events (below) is offered as a hint to look into, not
 *     asserted as an explanation: the correlation says "concurrent",
 *     org_events might say "here's why".
 *
 *     The correlation itself is still gated on SIGNIFICANCE, not just
 *     magnitude, since a Pearson r on a handful of interpolated points is
 *     close to meaningless on its own — at n=3 even r=0.99 doesn't clear
 *     p<0.05. Fisher's z-transform (a standard normal approximation for the
 *     sampling distribution of r) gives a real p-value cheaply, consistent
 *     with the normal-approximation approach already used for Mann-Kendall
 *     in stats.js. This rules out NOISE as the explanation; it can't rule
 *     out "both are just trending, unrelated" as one.
 */
import { normalCdf } from "./stats.js";

const MIN_TRADEOFF_CORRELATION = -0.5;   // effect-size floor: must be meaningfully negative, not just significant
const MIN_OVERLAP_POINTS = 6;            // >= 3 quarters of shared evidence at step=0.5, so Fisher's z is meaningful
const MAX_TRADEOFF_P_VALUE = 0.10;       // one-sided: exploratory "candidate trade-off" bar, not a strict scientific claim

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** One-sided p-value for r being significantly NEGATIVE, via Fisher's z. */
function correlationPValue(r, n) {
  if (n < 4 || r <= -1 || r >= 1) return r <= -1 ? 0 : 1;
  const z = Math.atanh(r) * Math.sqrt(n - 3);
  return normalCdf(z); // P(Z <= z): small when r is significantly negative
}

/**
 * Resamples two level_history arrays ([{t, level}]) onto their shared time
 * range at a fixed step, linearly interpolating each series onto that grid
 * — the two competencies almost never have evidence at the same timestamps,
 * so a raw pairing isn't possible.
 */
function alignedLevels(historyA, historyB, step = 0.5) {
  if (!historyA?.length || !historyB?.length) return null;
  const tStart = Math.max(historyA[0].t, historyB[0].t);
  const tEnd = Math.min(historyA[historyA.length - 1].t, historyB[historyB.length - 1].t);
  if (tEnd - tStart < step * MIN_OVERLAP_POINTS) return null;

  const interp = (hist, t) => {
    if (t <= hist[0].t) return hist[0].level;
    if (t >= hist[hist.length - 1].t) return hist[hist.length - 1].level;
    for (let i = 1; i < hist.length; i++) {
      if (hist[i].t >= t) {
        const a = hist[i - 1], b = hist[i];
        const frac = (t - a.t) / (b.t - a.t || 1);
        return a.level + frac * (b.level - a.level);
      }
    }
    return hist[hist.length - 1].level;
  };

  const xs = [], ys = [];
  for (let t = tStart; t <= tEnd + 1e-9; t += step) {
    xs.push(interp(historyA, t));
    ys.push(interp(historyB, t));
  }
  return xs.length >= MIN_OVERLAP_POINTS ? { xs, ys } : null;
}

/**
 * verdicts: this employee's verdict docs (one per competency, already
 * computed by the main pipeline). Returns { profile_shape, divergence_score,
 * tradeoff_pairs, n_confident_improving, n_confident_declining }.
 */
export function computeDivergence(verdicts) {
  const confidentImproving = verdicts.filter((v) => v.verdict === "improving");
  const confidentDeclining = verdicts.filter((v) => v.verdict === "declining");
  const withVerdict = verdicts.filter((v) => v.verdict !== "insufficient_evidence");

  const velocities = withVerdict.map((v) => v.velocity_mu);
  const divergenceScore = velocities.length >= 2
    ? Math.round((Math.max(...velocities) - Math.min(...velocities)) * 1000) / 1000
    : 0;

  let profileShape;
  if (withVerdict.length === 0) {
    profileShape = "unclear";
  } else if (confidentImproving.length >= 1 && confidentDeclining.length >= 1) {
    profileShape = "divergent";
  } else if (confidentImproving.length >= 1 && confidentDeclining.length === 0) {
    profileShape = "uniform_improving";
  } else if (confidentDeclining.length >= 1 && confidentImproving.length === 0) {
    profileShape = "uniform_declining";
  } else {
    profileShape = "mixed_flat"; // all stagnating (or a mix of stagnating + insufficient)
  }

  // Trade-off pairs: only worth reporting between one CONFIDENT-improving
  // and one CONFIDENT-declining competency — pairing two merely-stagnating
  // competencies isn't a trade-off, it's two flat lines.
  const tradeoffPairs = [];
  for (const gaining of confidentImproving) {
    for (const losing of confidentDeclining) {
      const aligned = alignedLevels(gaining.level_history, losing.level_history);
      if (!aligned) continue;
      const r = pearson(aligned.xs, aligned.ys);
      if (r == null || r > MIN_TRADEOFF_CORRELATION) continue; // not negatively co-moving enough
      const pValue = correlationPValue(r, aligned.xs.length);
      if (pValue > MAX_TRADEOFF_P_VALUE) continue; // not distinguishable from chance at this n
      tradeoffPairs.push({
        gaining_competency_id: gaining.competency_id,
        losing_competency_id: losing.competency_id,
        correlation: Math.round(r * 1000) / 1000,
        p_value: Math.round(pValue * 1000) / 1000,
        n_overlap_points: aligned.xs.length,
        gaining_velocity: gaining.velocity_mu,
        losing_velocity: losing.velocity_mu,
        confidence: Math.round(Math.min(gaining.confidence, losing.confidence) * 1000) / 1000,
      });
    }
  }
  tradeoffPairs.sort((a, b) => a.correlation - b.correlation); // strongest (most negative) first

  return {
    profile_shape: profileShape,
    divergence_score: divergenceScore,
    tradeoff_pairs: tradeoffPairs,
    n_confident_improving: confidentImproving.length,
    n_confident_declining: confidentDeclining.length,
  };
}
