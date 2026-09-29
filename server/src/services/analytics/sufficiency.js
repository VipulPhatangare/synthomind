/**
 * Evidence Sufficiency Score: volume × recency × diversity × independence ×
 * temporal span, combined as a GEOMETRIC mean so one collapsed component
 * (e.g. zero diversity — everything from one source) vetoes the whole
 * score rather than being averaged away.
 *
 * Also exports suggestEvidenceForSufficiency — the "what would change my
 * mind" counterfactual for a pair that's currently gated to
 * insufficient_evidence. An abstention on its own is a dead end for whoever
 * reads it; this turns it into a concrete, sized ask ("2 more peer ratings
 * from raters outside the current group would raise sufficiency 0.24 ->
 * 0.41") by simulating the cheapest single realistic evidence addition that
 * would cross the gate, holding everything else about the pair fixed.
 */
const N_TARGET = 6;          // weighted-equivalent observations for a "full" volume score
const RECENCY_TAU_DAYS = 180;
const DIVERSITY_K = 5;       // "good diversity" reference count of source categories
const INDEPENDENCE_TARGET = 3;
const SUFFICIENCY_GATE = 0.30; // kept in sync with verdictLogic.js's own constant by contract, not import, to avoid a circular module edge — both are covered by the eval's coverage/ECE numbers if they drift

function shannonEntropy(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h;
}

/** Shared geometric-mean composition, used by both the real score and the counterfactual simulator. */
function composeScore(components) {
  const EPS = 0.03;
  const vals = Object.values(components).map((v) => Math.max(v, v === 0 ? 0 : EPS));
  const hasZero = Object.values(components).some((v) => v === 0);
  return hasZero ? 0 : Math.pow(vals.reduce((a, b) => a * b, 1), 1 / vals.length);
}

/**
 * events: raw evidence_events for one (employee, competency) pair.
 * weights: parallel array of composite weights from weighting.js.
 * raterStats: Map from calibration.js (for halo flag).
 * nowDate: Date to compute recency against (dataset "today").
 */
export function computeSufficiency(events, weights, raterStats, nowDate) {
  if (events.length === 0) {
    return { score: 0, components: {}, flags: ["no_evidence"] };
  }

  const volumeScore = Math.min(1, weights.reduce((a, b) => a + b, 0) / N_TARGET);

  const lastOccurred = new Date(Math.max(...events.map((e) => e.occurred_at.getTime())));
  const daysSinceLast = (nowDate - lastOccurred) / 86400000;
  const recencyScore = Math.exp(-daysSinceLast / RECENCY_TAU_DAYS);

  const typeCounts = {};
  for (const e of events) typeCounts[e.source_type] = (typeCounts[e.source_type] || 0) + 1;
  const entropy = shannonEntropy(Object.values(typeCounts));
  const diversityScore = Math.min(1, entropy / Math.log(DIVERSITY_K));

  const independentUnits = new Set();
  for (const e of events) {
    independentUnits.add(e.rater_id ? `rater:${e.rater_id}` : `source:${e.source_type}`);
  }
  const independenceScore = Math.min(1, independentUnits.size / INDEPENDENCE_TARGET);

  const distinctQuarters = new Set(events.map((e) => e._quarterIdx));
  const spanScore = distinctQuarters.size >= 2 ? 1.0 : 0.4;

  const components = {
    volume: Math.round(volumeScore * 1000) / 1000,
    recency: Math.round(recencyScore * 1000) / 1000,
    diversity: Math.round(diversityScore * 1000) / 1000,
    independence: Math.round(independenceScore * 1000) / 1000,
    span: Math.round(spanScore * 1000) / 1000,
  };

  const score = composeScore(components);

  const flags = [];
  if (independentUnits.size <= 1) flags.push("single_rater_or_source");
  if (Object.keys(typeCounts).length === 1) flags.push("single_source_type");
  if (Object.keys(typeCounts).length === 1 && typeCounts.self_assessment) flags.push("self_report_only");
  if (recencyScore < 0.3) flags.push("stale");
  if (events.some((e) => e.rater_id && raterStats.get(e.rater_id)?.haloIndex > 0.5)) flags.push("halo_suspected");
  if (events.length <= 2) flags.push("very_thin");

  return {
    score: Math.round(score * 1000) / 1000, components, flags,
    // raw internals, needed by suggestEvidenceForSufficiency to simulate
    // additions without re-deriving them from events a second time.
    _raw: { totalWeight: weights.reduce((a, b) => a + b, 0), typeCounts, independentUnitCount: independentUnits.size, distinctQuarterCount: distinctQuarters.size },
  };
}

const CANDIDATE_MAX_N = 6;

/**
 * Simulates the cheapest single realistic evidence addition that would
 * cross the sufficiency gate, holding every other component fixed
 * (ceteris paribus — this does NOT re-run the Kalman filter, so it can't
 * promise a resulting VERDICT, only that the pair would stop being
 * evidence-gated). Returns null when already sufficient or when nothing
 * within CANDIDATE_MAX_N additions would close the gap — at that point the
 * honest answer is "this needs a broader evidence effort, not a quick ask".
 */
export function suggestEvidenceForSufficiency(sufficiencyResult, avgWeight) {
  const { score, components, _raw } = sufficiencyResult;
  if (score >= SUFFICIENCY_GATE || !_raw) return null;

  const w = avgWeight && avgWeight > 0 ? avgWeight : 0.5; // conservative default: a mid-credibility, mid-specificity rating
  const nDistinctTypesNow = Object.keys(_raw.typeCounts).length;

  const candidates = [];

  // Lever 1: peer/manager ratings from raters NOT already in the pool —
  // moves volume AND independence together (the combination this system's
  // sufficiency flags most often names: single_rater_or_source).
  for (let n = 1; n <= CANDIDATE_MAX_N; n++) {
    const simulated = {
      volume: Math.min(1, (_raw.totalWeight + n * w) / N_TARGET),
      recency: components.recency, // unchanged unless the new rating is dated "now" — kept conservative
      diversity: components.diversity, // same source type, no new category
      independence: Math.min(1, (_raw.independentUnitCount + n) / INDEPENDENCE_TARGET),
      span: components.span,
    };
    const projected = composeScore(simulated);
    if (projected >= SUFFICIENCY_GATE) {
      candidates.push({
        lever: "independent_ratings",
        description: `${n} more rating${n > 1 ? "s" : ""} from rater${n > 1 ? "s" : ""} not already represented in this competency's evidence`,
        n_needed: n,
        projected_score: Math.round(projected * 1000) / 1000,
      });
      break;
    }
  }

  // Lever 2: one fresh, current observation — fixes a stale/thin pair fast
  // when recency is the dominant weak link (span usually improves for free
  // since a "now" observation is almost always a new quarter).
  {
    const simulated = {
      volume: Math.min(1, (_raw.totalWeight + w) / N_TARGET),
      recency: 1.0,
      diversity: components.diversity,
      independence: Math.min(1, (_raw.independentUnitCount + 1) / INDEPENDENCE_TARGET),
      span: 1.0,
    };
    const projected = composeScore(simulated);
    if (projected >= SUFFICIENCY_GATE) {
      candidates.push({
        lever: "fresh_observation",
        description: "1 current observation (any source) — the existing evidence has gone stale",
        n_needed: 1,
        projected_score: Math.round(projected * 1000) / 1000,
      });
    }
  }

  // Lever 3: a source type not yet represented — the only lever that moves
  // diversity, so it's the right ask specifically when the flag is
  // single_source_type / self_report_only.
  if (nDistinctTypesNow >= 1) {
    for (let n = 1; n <= CANDIDATE_MAX_N; n++) {
      const simulatedTypeCounts = { ...(_raw.typeCounts), __new_type__: n };
      const entropy = shannonEntropy(Object.values(simulatedTypeCounts));
      const simulated = {
        volume: Math.min(1, (_raw.totalWeight + n * w) / N_TARGET),
        recency: components.recency,
        diversity: Math.min(1, entropy / Math.log(DIVERSITY_K)),
        independence: Math.min(1, (_raw.independentUnitCount + n) / INDEPENDENCE_TARGET),
        span: components.span,
      };
      const projected = composeScore(simulated);
      if (projected >= SUFFICIENCY_GATE) {
        candidates.push({
          lever: "new_source_type",
          description: `${n} observation${n > 1 ? "s" : ""} from a source type not yet used for this competency (e.g. a project outcome or training result instead of another self-assessment)`,
          n_needed: n,
          projected_score: Math.round(projected * 1000) / 1000,
        });
        break;
      }
    }
  }

  if (candidates.length === 0) {
    return {
      lever: "broad_evidence_gap",
      description: "No single realistic addition closes this within a few observations — this pair needs a sustained evidence effort across multiple sources, not a one-off ask.",
      n_needed: null,
      projected_score: null,
      current_score: score,
    };
  }

  candidates.sort((a, b) => a.n_needed - b.n_needed);
  return { ...candidates[0], current_score: score };
}
