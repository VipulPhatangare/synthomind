/**
 * Local-linear-trend Kalman filter, hand-rolled (2-state: level + velocity),
 * over CONTINUOUS time (irregular Δt between observations, in quarters) —
 * this is what "continuous talent intelligence" actually means: no binning
 * to fixed cycles, evidence updates the belief the moment it arrives.
 *
 * State x = [level, velocity]. Transition F(dt) = [[1,dt],[0,1]].
 * Process noise Q(dt) uses a diagonal-scaled-by-dt approximation (a
 * deliberate simplification of the exact integrated-Brownian-motion
 * covariance — documented in the plan).
 *
 * Starts from a generic, uncertain prior at t=0 (dataset start) rather than
 * snapping to the first observation, so the first data point still goes
 * through a normal update step (and gets an influence score).
 *
 * Two additions on top of the plain filter, both driven by the evaluation:
 *
 *  1. ADAPTIVE PROCESS NOISE (runKalmanAdaptive). A single global Q_LEVEL
 *     cannot serve both a clean series (latent sd ~0.06/quarter) and a
 *     churny one (~0.22/quarter, i.e. ~6x the variance). When Q is too
 *     small the filter has nowhere to put the scatter, so it attributes it
 *     to VELOCITY — exactly the quantity the verdict depends on. We
 *     estimate the per-series scale from the normalised innovation squared
 *     (NIS), whose expectation is 1 under a correctly specified model, and
 *     iterate to that fixed point.
 *
 *  2. REGIME SEGMENTATION (fitTrajectory). A late bloomer — flat for a
 *     year, then climbing — has a whole-series velocity that averages the
 *     two phases into an indecisive middle. The verdict question is "is
 *     this person improving NOW", so we test a two-regime model against a
 *     one-regime model by BIC and, when the split genuinely earns its extra
 *     parameters, report the CURRENT regime's velocity.
 */

const Q_LEVEL = 0.008; // process noise on level, per quarter (baseline; scaled per series)
const Q_TREND = 0.0008; // process noise on velocity, per quarter
const PRIOR_LEVEL = 2.5;
const PRIOR_LEVEL_VAR = 2.0;
const PRIOR_TREND_VAR = 0.5;

// Bounds on the adaptive Q_LEVEL multiplier. The upper bound covers the
// noisiest archetype (latent sd 0.22 -> variance 0.048 -> ~6x baseline) with
// headroom; the lower bound stops a short, quiet series from collapsing Q to
// zero and reading every wobble as a real trend.
const MIN_Q_SCALE = 0.4;
const MAX_Q_SCALE = 15;
const Q_SCALE_ITERATIONS = 4;
const MIN_OBS_FOR_ADAPTATION = 5;

export const KALMAN_DEFAULTS = { Q_LEVEL, Q_TREND, PRIOR_LEVEL, PRIOR_LEVEL_VAR, PRIOR_TREND_VAR };

/**
 * observations: [{ t, level, variance, eventId, sourceType }], any order —
 * sorted internally by t. Returns null if empty.
 *
 * opts lets a caller re-run the same filter with a scaled Q, or seed it from
 * a previous segment's posterior (used by fitTrajectory for regime 2).
 */
export function runKalman(observations, opts = {}) {
  if (!observations || observations.length === 0) return null;

  const {
    qLevelScale = 1,
    priorLevel = PRIOR_LEVEL,
    priorLevelVar = PRIOR_LEVEL_VAR,
    priorTrend = 0,
    priorTrendVar = PRIOR_TREND_VAR,
    t0 = 0,
  } = opts;

  const qLevel = Q_LEVEL * qLevelScale;
  const obs = [...observations].sort((a, b) => a.t - b.t);

  let level = priorLevel, trend = priorTrend;
  let P00 = priorLevelVar, P01 = 0, P11 = priorTrendVar;
  let prevT = t0;

  const influences = [];
  const history = [];
  let logLik = 0;
  let nisSum = 0, nisCount = 0;

  for (let i = 0; i < obs.length; i += 1) {
    const o = obs[i];
    const dt = Math.max(o.t - prevT, 0.02);
    prevT = o.t;

    // predict: x_pred = F x ; P_pred = F P F^T + Q(dt)
    const levelPred = level + dt * trend;
    const trendPred = trend;

    const FPFt00 = P00 + 2 * dt * P01 + dt * dt * P11;
    const FPFt01 = P01 + dt * P11;
    const FPFt11 = P11;

    const Ppred00 = FPFt00 + qLevel * dt;
    const Ppred01 = FPFt01;
    const Ppred11 = FPFt11 + Q_TREND * dt;

    // update (H = [1, 0])
    const S = Ppred00 + o.variance;
    const K0 = Ppred00 / S;
    const K1 = Ppred01 / S;
    const innovation = o.level - levelPred;

    // Gaussian log-likelihood of this observation given everything before it
    // — the prediction-error decomposition. Summed, this is the series
    // log-likelihood that fitTrajectory's BIC comparison runs on.
    logLik += -0.5 * (Math.log(2 * Math.PI * S) + (innovation * innovation) / S);

    // NIS, skipping the first update: at i=0 the prediction is the generic
    // prior, so its innovation says nothing about this series' process noise.
    if (i > 0) {
      nisSum += (innovation * innovation) / S;
      nisCount += 1;
    }

    level = levelPred + K0 * innovation;
    trend = trendPred + K1 * innovation;

    P00 = (1 - K0) * Ppred00;
    P01 = (1 - K0) * Ppred01;
    P11 = Ppred11 - K1 * Ppred01;

    const influence = Math.abs(K0 * innovation);
    influences.push({ eventId: o.eventId, sourceType: o.sourceType, influence: Math.round(influence * 1000) / 1000 });
    history.push({
      t: Math.round(o.t * 1000) / 1000,
      level: Math.round(level * 1000) / 1000,
      level_sd: Math.round(Math.sqrt(Math.max(P00, 1e-6)) * 1000) / 1000,
      trend: Math.round(trend * 1000) / 1000,
      // trend_sd (sqrt(P11) at this point in the filter) is what lets the
      // time-travel view ("what would we have said as of this date") run
      // ropeVerdict AS OF each historical point, not just chart the level —
      // an "as of" verdict needs the posterior's uncertainty at that time,
      // not just its mean.
      trend_sd: Math.round(Math.sqrt(Math.max(P11, 1e-6)) * 1000) / 1000,
      observed_level: o.level,
      eventId: o.eventId,
    });
  }

  return {
    levelMu: level, levelVar: Math.max(P00, 1e-6),
    velocityMu: trend, velocityVar: Math.max(P11, 1e-6),
    influences, history, nObservations: obs.length,
    logLik,
    nis: nisCount ? nisSum / nisCount : null,
    qLevelScale,
    tStart: obs[0].t, tEnd: prevT,
  };
}

/**
 * Same filter, but with the level process noise estimated from this series
 * rather than assumed. E[NIS] = 1 under a correct model, so scale <- scale *
 * NIS is a fixed-point iteration onto a consistent Q. Short series keep the
 * baseline: with <5 observations the NIS estimate is noisier than the
 * parameter it is trying to correct.
 */
export function runKalmanAdaptive(observations, opts = {}) {
  const baseline = runKalman(observations, opts);
  if (!baseline) return null;
  if (baseline.nObservations < MIN_OBS_FOR_ADAPTATION) return baseline;

  let scale = 1;
  for (let i = 0; i < Q_SCALE_ITERATIONS; i += 1) {
    const r = runKalman(observations, { ...opts, qLevelScale: scale });
    if (r.nis == null || !Number.isFinite(r.nis) || r.nis <= 0) break;
    const next = Math.min(MAX_Q_SCALE, Math.max(MIN_Q_SCALE, scale * r.nis));
    const converged = Math.abs(next - scale) / scale < 0.05;
    scale = next;
    if (converged) break;
  }

  return runKalman(observations, { ...opts, qLevelScale: scale });
}

/** Free parameters charged to each model in the BIC comparison. */
const PARAMS_ONE_REGIME = 2;   // initial level + initial velocity
const PARAMS_TWO_REGIME = 5;   // + post-break level, post-break velocity, break location
const MIN_SEGMENT_OBS = 3;

/**
 * Fits the full-series trajectory and, when a change point is supplied, the
 * post-break segment alongside it — WITHOUT deciding which one the verdict
 * should use. That decision needs each segment's own Evidence Sufficiency
 * Score (volume/diversity/independence of ITS OWN evidence, not borrowed
 * from the full series), which lives in runAnalytics.js alongside the raw
 * events, not here. This function's job is purely "what would each model
 * say"; the caller's job is "which one do we believe".
 *
 * A BIC comparison is still computed as EXPLANATORY metadata (bic_one_regime
 * / bic_two_regime / bic_supports_break) — useful for showing "is this a
 * statistically confirmed structural break or just a recent trend" — but it
 * is deliberately NOT used to gate anything. At this dataset's typical
 * evidence density (~15-20 observations/pair over ~2 years), a rigid
 * two-piecewise-linear model essentially never clears BIC's parameter
 * penalty against a single ADAPTIVE-noise trend line, because the adaptive
 * model already explains a real slope change as inflated process noise
 * almost as well — even under AIC's much smaller penalty. Gating on it would
 * make regime detection dead code on real data. What DOES change the
 * verdict (see runAnalytics.js) is narrower and safer: a confident,
 * independently-sufficient post-break verdict is allowed to promote an
 * "insufficient_evidence" full-series read into a real one — never to
 * overrule a full-series verdict that was already confident.
 *
 * changePointIndex indexes into the TIME-SORTED observation array.
 */
export function fitTrajectorySegments(observations, changePointIndex = null) {
  const full = runKalmanAdaptive(observations);
  if (!full) return null;

  const obs = [...observations].sort((a, b) => a.t - b.t);
  const n = obs.length;

  const result = {
    full,
    post: null,
    regime: {
      change_point_index: changePointIndex,
      change_point_t: null,
      segment_available: false,
      bic_one_regime: null,
      bic_two_regime: null,
      bic_supports_break: null,
      reason: changePointIndex == null ? "no_change_point_detected" : null,
    },
  };

  if (changePointIndex == null) return result;

  const pre = obs.slice(0, changePointIndex);
  const post = obs.slice(changePointIndex);
  if (pre.length < MIN_SEGMENT_OBS || post.length < MIN_SEGMENT_OBS) {
    result.regime.reason = "segment_too_short";
    return result;
  }

  const preFit = runKalmanAdaptive(pre);
  // Regime 2 starts from regime 1's posterior LEVEL (skill does not teleport
  // at a change point) but a deliberately diffuse VELOCITY prior — the whole
  // premise of a change point is that the old trend stopped applying.
  const postFit = runKalmanAdaptive(post, {
    priorLevel: preFit.levelMu,
    priorLevelVar: preFit.levelVar + Q_LEVEL,
    priorTrend: 0,
    priorTrendVar: PRIOR_TREND_VAR,
    t0: pre[pre.length - 1].t,
  });

  const bicOne = -2 * full.logLik + PARAMS_ONE_REGIME * Math.log(n);
  const bicTwo = -2 * (preFit.logLik + postFit.logLik) + PARAMS_TWO_REGIME * Math.log(n);

  result.post = postFit;
  result.regime.change_point_t = Math.round(obs[changePointIndex].t * 1000) / 1000;
  result.regime.segment_available = true;
  result.regime.bic_one_regime = Math.round(bicOne * 100) / 100;
  result.regime.bic_two_regime = Math.round(bicTwo * 100) / 100;
  result.regime.bic_supports_break = bicTwo < bicOne;
  result.regime.n_observations_pre = pre.length;
  result.regime.n_observations_post = post.length;
  result.regime.prior_regime_velocity_mu = Math.round(preFit.velocityMu * 1000) / 1000;
  result.regime.reason = "segment_fitted";

  return result;
}
