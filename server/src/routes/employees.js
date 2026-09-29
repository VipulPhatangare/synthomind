import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { competenciesForDepartment } from "../../data_gen/referenceData.js";

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

employeesRouter.get("/", async (req, res) => {
  const db = mongoose.connection.db;
  const { department, verdict, shape, q, page = 1, limit = 25 } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

  const match = {};
  if (department) match.department = department;
  if (q) match.name = { $regex: q, $options: "i" };

  // Filtering by verdict or divergence shape requires knowing which
  // employees qualify BEFORE paginating — resolve that first via the
  // indexed fields on the small derived collections, on a projection,
  // rather than pulling full verdict/profile docs.
  if (verdict) {
    const matchingIds = await db.collection("verdicts")
      .distinct("employee_id", { verdict });
    match.employee_id = { $in: matchingIds };
  }
  if (shape) {
    const matchingIds = await db.collection("employee_profiles")
      .distinct("employee_id", { profile_shape: shape });
    match.employee_id = match.employee_id
      ? { $in: matchingIds.filter((id) => match.employee_id.$in.includes(id)) }
      : { $in: matchingIds };
  }

  // Real server-side pagination: never fetch more employees or verdicts
  // than this one page actually needs. (Previously fetched all 500
  // employees + all 3000 verdicts on every request — took 50s+ under load.)
  const [total, employees] = await Promise.all([
    db.collection("employees").countDocuments(match),
    db.collection("employees")
      .find(match)
      .sort({ employee_id: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .toArray(),
  ]);

  const employeeIds = employees.map((e) => e.employee_id);
  const [verdicts, profiles] = await Promise.all([
    employeeIds.length
      ? db.collection("verdicts").find({ employee_id: { $in: employeeIds } }).toArray()
      : [],
    employeeIds.length
      ? db.collection("employee_profiles").find({ employee_id: { $in: employeeIds } }).toArray()
      : [],
  ]);

  const verdictsByEmployee = new Map();
  for (const v of verdicts) {
    if (!verdictsByEmployee.has(v.employee_id)) verdictsByEmployee.set(v.employee_id, []);
    verdictsByEmployee.get(v.employee_id).push(v);
  }
  const profileByEmployee = new Map(profiles.map((p) => [p.employee_id, p]));

  const enriched = employees.map((e) => {
    const vs = verdictsByEmployee.get(e.employee_id) || [];
    const counts = { improving: 0, declining: 0, stagnating: 0, insufficient_evidence: 0 };
    for (const v of vs) counts[v.verdict] = (counts[v.verdict] || 0) + 1;
    const profile = profileByEmployee.get(e.employee_id) || null;
    return {
      ...e,
      verdict_summary: vs.map((v) => ({
        competency_id: v.competency_id, verdict: v.verdict, confidence: v.confidence,
        // Compact [t, level] pairs only — NOT the full level_history (which
        // carries level_sd/observed_level/eventId per point, meant for the
        // detail page's one big chart, not 25 rows x 6 tiny sparklines).
        // Still only the verdicts already fetched for THIS page, so it
        // doesn't reintroduce the all-employees payload the comment above
        // was written to avoid.
        sparkline: (v.level_history || []).map((h) => [h.t, h.level]),
      })),
      verdict_counts: counts,
      profile_shape: profile?.profile_shape || null,
      divergence_score: profile?.divergence_score ?? null,
      n_tradeoff_pairs: profile?.tradeoff_pairs?.length || 0,
    };
  });

  res.json({ total, page: pageNum, limit: limitNum, employees: enriched });
});

employeesRouter.get("/:employeeId", async (req, res) => {
  const db = mongoose.connection.db;
  const { employeeId } = req.params;

  const employee = await db.collection("employees").findOne({ employee_id: employeeId });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const compIds = competenciesForDepartment(employee.department);
  const [competencyDocs, verdicts, recommendations, orgEvents, profile, outcomes] = await Promise.all([
    db.collection("competencies").find({ competency_id: { $in: compIds } }).toArray(),
    db.collection("verdicts").find({ employee_id: employeeId }).toArray(),
    db.collection("recommendations_issued").find({ employee_id: employeeId }).toArray(),
    db.collection("org_events").find({ employee_id: employeeId }).sort({ occurred_at: 1 }).toArray(),
    db.collection("employee_profiles").findOne({ employee_id: employeeId }),
    db.collection("recommendation_outcomes").find({ employee_id: employeeId }).toArray(),
  ]);

  const verdictByComp = new Map(verdicts.map((v) => [v.competency_id, v]));
  const outcomeByRec = new Map(outcomes.map((o) => [o.rec_id, o]));
  const recByComp = new Map(recommendations.map((r) => [r.competency_id, { ...r, outcome: outcomeByRec.get(r.rec_id) || null }]));
  const compByld = new Map(competencyDocs.map((c) => [c.competency_id, c]));

  const competencies = compIds.map((cid) => ({
    competency_id: cid,
    name: compByld.get(cid)?.name || cid,
    anchors: compByld.get(cid)?.anchors || {},
    verdict: verdictByComp.get(cid) || null,
    recommendation: recByComp.get(cid) || null,
  }));

  res.json({ employee, competencies, org_events: orgEvents, profile });
});

employeesRouter.get("/:employeeId/evidence/:competencyId", async (req, res) => {
  const db = mongoose.connection.db;
  const { employeeId, competencyId } = req.params;

  const [events, verdict] = await Promise.all([
    db.collection("evidence_events")
      .find({ employee_id: employeeId, competency_id: competencyId })
      .sort({ occurred_at: -1 })
      .toArray(),
    db.collection("verdicts").findOne({ employee_id: employeeId, competency_id: competencyId }),
  ]);

  const annotated = events.map((e) => ({
    ...e,
    quote: e.raw_text && e.quote_start != null ? e.raw_text.slice(e.quote_start, e.quote_end) : null,
  }));

  const topInfluentialIds = new Set((verdict?.top_influential_evidence || []).map((i) => i.eventId));
  for (const e of annotated) e.is_top_influential = topInfluentialIds.has(e.event_id);

  res.json({ events: annotated, verdict });
});
