import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { getRaterStats } from "../services/analytics/raterStatsCache.js";
import { recomputePairVerdict, tForDate } from "../services/analytics/recomputePair.js";
import { forecastTimeToTarget, forecastWithAction } from "../services/analytics/forecast.js";

export const verdictsRouter = Router();
verdictsRouter.use(requireAuth);

verdictsRouter.get("/", async (req, res) => {
  const db = mongoose.connection.db;
  const { employee_id, competency_id, verdict, limit = 100 } = req.query;

  const match = {};
  if (employee_id) match.employee_id = employee_id;
  if (competency_id) match.competency_id = competency_id;
  if (verdict) match.verdict = verdict;

  const docs = await db.collection("verdicts")
    .find(match)
    .limit(Math.min(1000, parseInt(limit, 10) || 100))
    .toArray();
  res.json({ verdicts: docs });
});

function buildForecastFor(verdict, recommendation) {
  if (verdict.role_target_level == null) {
    return { forecast: null, forecast_with_action: null, action_name: null, note: "No role target level for this competency." };
  }
  const base = {
    levelMu: verdict.level_mu, levelVar: verdict.level_sd ** 2,
    velocityMu: verdict.velocity_mu, velocityVar: verdict.velocity_sd ** 2,
    target: verdict.role_target_level, asOfDate: verdict.updated_at,
  };
  return {
    target_level: verdict.role_target_level,
    current_level: verdict.level_mu,
    forecast: forecastTimeToTarget(base),
    forecast_with_action: recommendation ? forecastWithAction(base, recommendation) : null,
    action_name: recommendation?.action_name || null,
  };
}

/**
 * Batch forecast for every competency an employee has a verdict for, in one
 * round trip — EmployeeDetail previously fired one /forecast request PER
 * competency card (6 parallel requests per page load). Same computation,
 * one query pair instead of N.
 *
 * MUST be registered before /:employeeId/:competencyId below — that route's
 * wildcard second segment would otherwise swallow a request for
 * "/E-0001/forecasts" (competencyId="forecasts") before this one is ever
 * reached, since Express matches routes in registration order.
 */
verdictsRouter.get("/:employeeId/forecasts", async (req, res) => {
  const db = mongoose.connection.db;
  const { employeeId } = req.params;

  const [verdicts, recommendations] = await Promise.all([
    db.collection("verdicts").find({ employee_id: employeeId }).toArray(),
    db.collection("recommendations_issued").find({ employee_id: employeeId }).toArray(),
  ]);
  const recByComp = new Map(recommendations.map((r) => [r.competency_id, r]));

  const byCompetency = {};
  for (const v of verdicts) {
    byCompetency[v.competency_id] = buildForecastFor(v, recByComp.get(v.competency_id));
  }

  res.json({ forecasts: byCompetency });
});

verdictsRouter.get("/:employeeId/:competencyId", async (req, res) => {
  const db = mongoose.connection.db;
  const doc = await db.collection("verdicts").findOne({
    employee_id: req.params.employeeId,
    competency_id: req.params.competencyId,
  });
  if (!doc) return res.status(404).json({ error: "No verdict for this pair" });
  res.json(doc);
});

/**
 * Time travel: "what would this system have said as of an earlier date" —
 * re-runs the SAME pipeline (weighting -> adaptive Kalman -> sufficiency ->
 * ROPE) restricted to evidence that existed by that date. This is the
 * clearest demonstration that verdicts are a continuously-updated belief,
 * not a snapshot report: the same employee/competency pair can show
 * "insufficient_evidence, 45%" in March and "improving, 91%" today, built
 * from the same model just fed less evidence.
 *
 * Simplification: uses TODAY's rater calibration applied to the historical
 * subset, rather than recalibrating raters as of the earlier date too —
 * recalibrating calibration itself at every replay date is a second-order
 * effect not worth the added complexity here.
 */
verdictsRouter.get("/:employeeId/:competencyId/as-of", async (req, res) => {
  const db = mongoose.connection.db;
  const { employeeId, competencyId } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date query param is required (ISO date)" });
  const asOfDate = new Date(date);
  if (Number.isNaN(asOfDate.getTime())) return res.status(400).json({ error: "invalid date" });

  const [allEvents, raterStats] = await Promise.all([
    db.collection("evidence_events")
      .find({ employee_id: employeeId, competency_id: competencyId })
      .sort({ occurred_at: 1 })
      .toArray(),
    getRaterStats(db),
  ]);

  const events = allEvents.filter((e) => new Date(e.occurred_at) <= asOfDate);
  for (const e of events) e._quarterIdx = Math.floor(tForDate(e.occurred_at));

  const result = recomputePairVerdict(events, raterStats, asOfDate);
  res.json({ as_of_date: asOfDate, ...result });
});

/**
 * Trajectory forecast: projects the CURRENT (stored) verdict's posterior
 * forward to estimate when the role target is reached, plus — when a live
 * recommendation exists for this pair — a second projection assuming that
 * action is taken. See forecast.js for the approximation this rests on.
 */
verdictsRouter.get("/:employeeId/:competencyId/forecast", async (req, res) => {
  const db = mongoose.connection.db;
  const { employeeId, competencyId } = req.params;

  const [verdict, recommendation] = await Promise.all([
    db.collection("verdicts").findOne({ employee_id: employeeId, competency_id: competencyId }),
    db.collection("recommendations_issued").findOne({ employee_id: employeeId, competency_id: competencyId }),
  ]);
  if (!verdict) return res.status(404).json({ error: "No verdict for this pair" });

  res.json(buildForecastFor(verdict, recommendation));
});
