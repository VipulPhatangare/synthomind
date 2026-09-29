import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { streamDocsAsCsv } from "../services/csv.js";
import { COLLECTIONS } from "../db/schema.js";
import { competenciesForDepartment } from "../../data_gen/referenceData.js";

export const exportRouter = Router();
exportRouter.use(requireAuth);

exportRouter.get("/collections", (req, res) => {
  res.json({ collections: COLLECTIONS });
});

exportRouter.get("/:collection.csv", async (req, res) => {
  const { collection } = req.params;
  if (!COLLECTIONS.includes(collection)) return res.status(404).json({ error: "Unknown collection" });

  const db = mongoose.connection.db;
  const docs = await db.collection(collection).find({}).toArray();
  streamDocsAsCsv(res, `${collection}.csv`, docs);
});

/** A single employee's full record — profile, verdicts, recommendations, evidence — flattened to one CSV. */
exportRouter.get("/employee/:employeeId.csv", async (req, res) => {
  const db = mongoose.connection.db;
  const { employeeId } = req.params;

  const employee = await db.collection("employees").findOne({ employee_id: employeeId });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const compIds = competenciesForDepartment(employee.department);
  const [verdicts, recommendations, evidence] = await Promise.all([
    db.collection("verdicts").find({ employee_id: employeeId }).toArray(),
    db.collection("recommendations_issued").find({ employee_id: employeeId }).toArray(),
    db.collection("evidence_events").find({ employee_id: employeeId }).sort({ occurred_at: -1 }).toArray(),
  ]);

  const recByComp = new Map(recommendations.map((r) => [r.competency_id, r]));
  const rows = compIds.map((cid) => {
    const v = verdicts.find((x) => x.competency_id === cid) || {};
    const r = recByComp.get(cid) || {};
    return {
      employee_id: employee.employee_id,
      name: employee.name,
      department: employee.department,
      role_title: employee.role_title,
      competency_id: cid,
      verdict: v.verdict, confidence: v.confidence,
      level_mu: v.level_mu, velocity_mu: v.velocity_mu,
      sufficiency_score: v.sufficiency_score,
      n_observations: v.n_observations,
      root_cause_tag: r.root_cause_tag, recommended_action: r.action_name,
      n_evidence_events: evidence.filter((e) => e.competency_id === cid).length,
    };
  });

  streamDocsAsCsv(res, `${employeeId}.csv`, rows);
});
