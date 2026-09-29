/**
 * ROPE (Region of Practical Equivalence) verdict logic. Converts the
 * Kalman posterior over velocity into a probabilistic 4-way verdict, then
 * gates it by the Evidence Sufficiency Score — a tight-looking posterior
 * built on thin/biased evidence is NOT allowed to produce a confident
 * verdict. "Insufficient evidence" is a first-class, computed output, not
 * a fallback for an error.
 *
 * ASYMMETRIC ROPE. "Improving" and "declining" are one-sided tests: enough
 * posterior mass past +δ or −δ. "Stagnating" is a two-sided EQUIVALENCE
 * test: essentially all the mass inside ±δ. Those are not the same
 * question, and holding them to the same band and the same threshold makes
 * stagnating strictly the hardest verdict to reach — with velocity sd
 * ~0.09, P(|v| < 0.15) drops under 0.80 as soon as the true velocity
 * exceeds ~0.07, which is well inside the noise floor of a genuinely flat
 * series. The result was a system that could see improvement and decline
 * but went quiet on stagnation, the single most common real state.
 *
 * Standard equivalence testing (TOST and its Bayesian analogues) treats the
 * equivalence bound and the directional effect-size threshold as separate
 * parameters, so we do too: a slightly wider band for the equivalence test,
 * at a slightly lower threshold. Directional checks still run first, so a
 * clearly improving employee is never swallowed by the wider band.
 */
import { normalCdf } from "./stats.js";

const DELTA = 0.15;              // smallest velocity (level/quarter) considered "real" change
const DELTA_EQUIV = 0.20;        // half-width of the practical-equivalence band for "stagnating"
const CONFIDENCE_THRESHOLD = 0.80;
const STAGNATING_THRESHOLD = 0.72;
const SUFFICIENCY_GATE = 0.30;   // below this, force insufficient_evidence regardless of posterior

export const VERDICT_PARAMS = {
  DELTA, DELTA_EQUIV, CONFIDENCE_THRESHOLD, STAGNATING_THRESHOLD, SUFFICIENCY_GATE,
};

export function ropeVerdict(velocityMu, velocityVar, sufficiencyScore) {
  const sd = Math.sqrt(Math.max(velocityVar, 1e-6));

  const pImproving = 1 - normalCdf(DELTA, velocityMu, sd);
  const pDeclining = normalCdf(-DELTA, velocityMu, sd);
  // Reported as a coherent 3-way partition at ±DELTA so the three numbers
  // still sum to 1 for display...
  const pStagnatingNarrow = normalCdf(DELTA, velocityMu, sd) - normalCdf(-DELTA, velocityMu, sd);
  // ...while the DECISION uses the wider equivalence band.
  const pEquivalence = normalCdf(DELTA_EQUIV, velocityMu, sd) - normalCdf(-DELTA_EQUIV, velocityMu, sd);

  let verdict, confidence;
  if (sufficiencyScore < SUFFICIENCY_GATE) {
    verdict = "insufficient_evidence";
    confidence = Math.max(pImproving, pDeclining, pStagnatingNarrow);
  } else if (pImproving >= CONFIDENCE_THRESHOLD) {
    verdict = "improving"; confidence = pImproving;
  } else if (pDeclining >= CONFIDENCE_THRESHOLD) {
    verdict = "declining"; confidence = pDeclining;
  } else if (pEquivalence >= STAGNATING_THRESHOLD) {
    verdict = "stagnating"; confidence = pEquivalence;
  } else {
    verdict = "insufficient_evidence";
    confidence = Math.max(pImproving, pDeclining, pStagnatingNarrow);
  }

  return {
    verdict,
    confidence: Math.round(confidence * 1000) / 1000,
    probs: {
      improving: Math.round(pImproving * 1000) / 1000,
      declining: Math.round(pDeclining * 1000) / 1000,
      stagnating: Math.round(pStagnatingNarrow * 1000) / 1000,
    },
    p_equivalence: Math.round(pEquivalence * 1000) / 1000,
  };
}
