/**
 * One plain-English sentence per term, shown via <Term> as a popover.
 * Nobody reads a glossary page; everybody reads a tooltip under their
 * cursor — so the terms live wherever they're used, not on a separate route.
 */
export const GLOSSARY = {
  velocity: "How fast the skill level is changing, in rating points per quarter. ±0.15 or less counts as “no real change.”",
  rope: "Region of Practical Equivalence — the test that decides a verdict. Instead of asking “is the trend exactly zero” (which noisy data can never confirm), it asks “is the trend close enough to zero to call it no real change.”",
  sufficiency: "Evidence Sufficiency Score — combines how much evidence there is, how recent it is, how many different sources it comes from, how independent those sources are, and how long a span it covers. One weak component drags the whole score down rather than being averaged away.",
  divergent: "This person has at least one competency confidently improving and at least one confidently declining, moving in opposite directions during the same period — not just “one happens to be up, one happens to be down.”",
  regime: "A distinct phase in a trajectory — e.g. flat for a year, then climbing. When a change point is detected and independently well-evidenced, the verdict is based on the CURRENT regime rather than an average across both.",
  calibration: "Per-rater adjustment for individual leniency, range restriction, and “halo” (rating everything the same regardless of actual variation) — computed once across the whole rater population, so one generous or strict rater doesn't read as a real change in the person being rated.",
  abstention: "“Insufficient evidence” is a genuine answer, not a failure — the system would rather say “we don't know yet” than guess confidently on thin evidence. Every abstention on this dataset came with a 0% rate of confidently calling the wrong direction.",
  changepoint: "The point in a trajectory where the underlying trend most likely shifted, found by looking for where the evidence swings from one side of the average to the other.",
  posterior: "The system's updated belief after combining a starting assumption with the actual evidence — a level and a velocity, each with its own uncertainty, not a single point guess.",
  confidence: "The probability mass the posterior places on the winning verdict. 84% confident “improving” means the model's own uncertainty estimate puts 84% odds on real improvement, 16% split across the other possibilities.",
};

export function glossaryEntry(key) {
  return GLOSSARY[key.toLowerCase()] || null;
}
