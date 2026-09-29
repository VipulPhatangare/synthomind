/**
 * Free-text feedback generation for manager_feedback / peer_feedback
 * sessions. Reuses each competency's L1-L5 behavioral anchor text as the
 * "evidence sentence" and wraps 1-3 of them into one raw_text blob per
 * session — giving realistic *mixed-valence* feedback: one paragraph
 * touching several competencies, each with its own sentiment/level, exactly
 * like a real review. quote_start/quote_end are computed at construction
 * time, not via string search, so there's no ambiguity from repeated wording.
 */

const MANAGER_INTROS = [
  "In this review cycle, ", "Looking at recent work, ", "Based on the last few sprints, ",
  "Over the past quarter, ", "In our 1:1s this cycle, ", "",
];
const PEER_INTROS = [
  "From working together this cycle, ", "In our joint project work, ",
  "Based on recent collaboration, ", "As a peer on the same team, ", "",
];
const CONNECTORS = [
  " Separately, ", " On a different note, ", " Also worth mentioning: ",
  " In addition, ", " ",
];
const OUTROS = [
  " Will continue to monitor.", " Noted for the next review.", "",
  " Keep this up next cycle.", " This is an area to keep developing.",
];
const TREND_CLAUSES = {
  up: [" This is a clear step up from last cycle.", " Noticeably stronger than before."],
  down: [" This is a step back compared to last cycle.", " A decline from where they were."],
  flat: [" Consistent with prior cycles.", ""],
};

export function levelBucket(level) {
  return Math.min(5, Math.max(1, Math.round(level)));
}

/**
 * entries: [{competency_id, anchor_text, trend: "up"|"down"|"flat"}]
 * returns { rawText, exploded: [{competency_id, quote_start, quote_end}] }
 */
export function buildSessionText(rng, sourceType, entries) {
  const intros = sourceType === "manager_feedback" ? MANAGER_INTROS : PEER_INTROS;
  const parts = [];
  const exploded = [];
  let cursor = 0;

  const emit = (s) => { parts.push(s); cursor += s.length; };

  entries.forEach((entry, i) => {
    emit(i === 0 ? rng.choice(intros) : rng.choice(CONNECTORS));
    const quoteStart = cursor;
    emit(entry.anchor_text);
    const quoteEnd = cursor;
    emit(rng.choice(TREND_CLAUSES[entry.trend]));
    emit(rng.choice(OUTROS));
    exploded.push({ competency_id: entry.competency_id, quote_start: quoteStart, quote_end: quoteEnd });
  });

  return { rawText: parts.join("").trim(), exploded };
}

export function specificityFor(rng, sourceType) {
  const baseline = { manager_feedback: 0.75, peer_feedback: 0.55, self_assessment: 0.40 }[sourceType];
  return rng.clip(rng.normal(baseline, 0.12), 0.25, 0.98);
}
