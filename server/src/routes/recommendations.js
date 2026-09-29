import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";

export const recommendationsRouter = Router();
recommendationsRouter.use(requireAuth);

const MS_PER_DAY = 86400000;

recommendationsRouter.get("/", async (req, res) => {
  const db = mongoose.connection.db;
  const { employee_id, competency_id, root_cause_tag, limit = 100 } = req.query;

  const match = {};
  if (employee_id) match.employee_id = employee_id;
  if (competency_id) match.competency_id = competency_id;
  if (root_cause_tag) match.root_cause_tag = root_cause_tag;

  const [docs, outcomes] = await Promise.all([
    db.collection("recommendations_issued")
      .find(match)
      .sort({ priority: -1 })
      .limit(Math.min(1000, parseInt(limit, 10) || 100))
      .toArray(),
    db.collection("recommendation_outcomes").find({}).toArray(),
  ]);
  const outcomeByRec = new Map(outcomes.map((o) => [o.rec_id, o]));
  const enriched = docs.map((d) => ({ ...d, outcome: outcomeByRec.get(d.rec_id) || null }));

  res.json({ recommendations: enriched });
});

/**
 * Closes the recommendation loop (D1 in the plan): marks a recommendation's
 * action as actually taken, snapshotting the pair's CURRENT level/velocity
 * as the baseline to measure against. The check-in date is derived from the
 * action's own expected_time_to_effect_days — asking too early would just
 * measure noise, not the action's effect.
 */
recommendationsRouter.post("/:recId/complete", async (req, res) => {
  const db = mongoose.connection.db;
  const { recId } = req.params;

  const rec = await db.collection("recommendations_issued").findOne({ rec_id: recId });
  if (!rec) return res.status(404).json({ error: "Recommendation not found" });

  const existing = await db.collection("recommendation_outcomes").findOne({ rec_id: recId });
  if (existing) return res.status(409).json({ error: "This recommendation is already being tracked", outcome: existing });

  const verdict = await db.collection("verdicts").findOne({ employee_id: rec.employee_id, competency_id: rec.competency_id });
  const completedAt = new Date();
  const checkInDays = rec.expected_time_to_effect_days || 90;

  const outcome = {
    outcome_id: `OUT-${recId}-${completedAt.getTime()}`,
    rec_id: recId,
    employee_id: rec.employee_id,
    competency_id: rec.competency_id,
    action_id: rec.action_id,
    action_name: rec.action_name,
    completed_at: completedAt,
    completed_by: req.user.email,
    check_in_at: new Date(completedAt.getTime() + checkInDays * MS_PER_DAY),
    baseline_level_mu: verdict?.level_mu ?? null,
    baseline_velocity_mu: verdict?.velocity_mu ?? null,
    predicted_uplift: rec.expected_uplift ?? null,
    status: "pending",
    realized_uplift: null,
    realized_verdict: null,
    evaluated_at: null,
  };
  await db.collection("recommendation_outcomes").insertOne(outcome);
  res.status(201).json(outcome);
});

/**
 * Evaluates every outcome past its check-in date: compares the pair's
 * CURRENT level (from the live `verdicts` collection, which run-analytics
 * keeps up to date as new evidence arrives) against the baseline snapshotted
 * at completion. This is the only source of REAL uplift numbers in the
 * system — action_catalog.historical_uplift_median starts from seeded
 * defaults and is meant to be replaced by this over time, via
 * scripts/updateActionUplift.js, once enough outcomes accumulate per
 * action. Safe to call repeatedly / on a schedule; only touches
 * still-pending outcomes whose check-in date has passed.
 */
recommendationsRouter.post("/outcomes/evaluate", async (req, res) => {
  const db = mongoose.connection.db;
  const now = new Date();

  const due = await db.collection("recommendation_outcomes").find({
    status: "pending", check_in_at: { $lte: now },
  }).toArray();

  let evaluated = 0;
  for (const outcome of due) {
    const verdict = await db.collection("verdicts").findOne({
      employee_id: outcome.employee_id, competency_id: outcome.competency_id,
    });
    if (!verdict || outcome.baseline_level_mu == null) continue;

    const realizedUplift = Math.round((verdict.level_mu - outcome.baseline_level_mu) * 1000) / 1000;
    await db.collection("recommendation_outcomes").updateOne(
      { outcome_id: outcome.outcome_id },
      {
        $set: {
          status: "evaluated", evaluated_at: now,
          realized_uplift: realizedUplift, realized_verdict: verdict.verdict,
        },
      }
    );
    evaluated += 1;
  }

  res.json({ evaluated, checked: due.length });
});

recommendationsRouter.get("/outcomes", async (req, res) => {
  const db = mongoose.connection.db;
  const { status, employee_id } = req.query;
  const match = {};
  if (status) match.status = status;
  if (employee_id) match.employee_id = employee_id;
  const outcomes = await db.collection("recommendation_outcomes").find(match).sort({ completed_at: -1 }).toArray();
  res.json({ outcomes });
});
