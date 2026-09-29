/**
 * Folds REALIZED recommendation outcomes back into action_catalog, so the
 * system's own ranking (recommend.js sorts candidates by
 * historical_uplift_median) is eventually driven by what actually happened
 * on this population, not just the seeded generator defaults it started
 * with. This is what makes the recommendation loop closed rather than
 * one-shot: outcomes accrue via POST /api/recommendations/:recId/complete
 * and /outcomes/evaluate as managers actually use the system, and running
 * this script periodically (not part of run-analytics — outcomes accrue
 * over real time, not per dataset regen) lets enough real evidence
 * gradually override the seed.
 *
 * Deliberately conservative: an action needs MIN_SAMPLES evaluated outcomes
 * before its median is touched at all, and even then blends toward the
 * observed median rather than replacing the seed outright — a handful of
 * outcomes for one action ranking above a well-seeded, extensively-used
 * action on pure recency would be overfitting to a small sample.
 *
 *   npm run update-action-uplift
 */
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";

const MIN_SAMPLES = 5;
const BLEND_WEIGHT_AT_MIN_SAMPLES = 0.4; // how much the observed median counts vs the seed, growing with sample count

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  await connectDb();
  const db = mongoose.connection.db;

  const outcomes = await db.collection("recommendation_outcomes").find({ status: "evaluated" }).toArray();
  console.log(`Loaded ${outcomes.length} evaluated outcomes.`);

  const byAction = new Map();
  for (const o of outcomes) {
    if (o.realized_uplift == null || !o.action_id) continue;
    if (!byAction.has(o.action_id)) byAction.set(o.action_id, []);
    byAction.get(o.action_id).push(o.realized_uplift);
  }

  if (byAction.size === 0) {
    console.log("No actions have enough evaluated outcomes yet — nothing to update.");
    console.log("(Outcomes accrue via POST /api/recommendations/:recId/complete, then /outcomes/evaluate once past check-in date.)");
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  for (const [actionId, uplifts] of byAction.entries()) {
    if (uplifts.length < MIN_SAMPLES) {
      console.log(`  ${actionId}: ${uplifts.length} samples, below MIN_SAMPLES=${MIN_SAMPLES} — skipped`);
      continue;
    }
    const action = await db.collection("action_catalog").findOne({ action_id: actionId });
    if (!action) continue;

    const observedMedian = median(uplifts);
    // Blend weight grows slowly with sample count past the minimum, capped —
    // more real data earns more trust, but the seed is never fully discarded.
    const blendWeight = Math.min(0.8, BLEND_WEIGHT_AT_MIN_SAMPLES + 0.05 * (uplifts.length - MIN_SAMPLES));
    const newMedian = Math.round(
      (blendWeight * observedMedian + (1 - blendWeight) * action.historical_uplift_median) * 1000
    ) / 1000;

    await db.collection("action_catalog").updateOne(
      { action_id: actionId },
      { $set: { historical_uplift_median: newMedian, n_realized_outcomes: uplifts.length, last_uplift_update: new Date() } }
    );
    console.log(`  ${actionId}: seed=${action.historical_uplift_median} observed_median=${Math.round(observedMedian * 1000) / 1000} (n=${uplifts.length}) -> blended=${newMedian}`);
    updated += 1;
  }

  console.log(`\nUpdated ${updated} action(s) in action_catalog.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
