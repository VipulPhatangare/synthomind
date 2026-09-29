import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";

export const evaluationRouter = Router();
evaluationRouter.use(requireAuth);

/**
 * Serves data_gen/eval_report.json (npm run evaluate) — the single
 * strongest credibility artifact this system has (accuracy, macro-F1, ECE,
 * abstention/risk-coverage, per-archetype breakdown) and, until this route
 * existed, completely unreachable from the UI. Also flags staleness: this
 * file is a point-in-time snapshot from whenever `evaluate` last ran, and
 * if verdicts have been recomputed since, the report no longer describes
 * what's actually live — better to say so than present a stale number as
 * current.
 */
evaluationRouter.get("/", async (req, res) => {
  const reportPath = path.resolve("data_gen", "eval_report.json");
  if (!fs.existsSync(reportPath)) {
    return res.status(404).json({ error: "No eval_report.json — run npm run evaluate to produce one." });
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

  const db = mongoose.connection.db;
  const mostRecentVerdict = await db.collection("verdicts")
    .find({}).sort({ updated_at: -1 }).limit(1).project({ updated_at: 1 }).toArray();
  const verdictsUpdatedAt = mostRecentVerdict[0]?.updated_at ?? null;
  const reportGeneratedAt = report.generated_at ? new Date(report.generated_at) : null;
  const stale = !!(verdictsUpdatedAt && reportGeneratedAt && new Date(verdictsUpdatedAt) > reportGeneratedAt);

  res.json({ ...report, stale, verdicts_updated_at: verdictsUpdatedAt });
});
