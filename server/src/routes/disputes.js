import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { getRaterStats, invalidateRaterStatsCache } from "../services/analytics/raterStatsCache.js";
import { recomputePairVerdict, tForDate } from "../services/analytics/recomputePair.js";

export const disputesRouter = Router();
disputesRouter.use(requireAuth);

function nextDisputeId() {
  return `DSP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// How each resolution affects the disputed event's weight in future
// recomputes. "overturned" removes it from practical consideration without
// deleting the record (the evidence still shows in the drawer, marked
// disputed — deleting audit trail evidence outright isn't the right move
// even when a dispute succeeds). "upheld_with_context_added" is a partial
// correction: the rater's observation stands but is judged less reliable
// once the added context is accounted for. "no_change" applies no override.
const CREDIBILITY_OVERRIDE_BY_RESOLUTION = {
  overturned: 0.05,
  upheld_with_context_added: 0.4,
};

disputesRouter.get("/", async (req, res) => {
  const db = mongoose.connection.db;
  const { employee_id, resolution } = req.query;
  const match = {};
  if (employee_id) match.employee_id = employee_id;
  if (resolution === "open") match.resolution = "open";
  else if (resolution) match.resolution = resolution;

  const docs = await db.collection("disputes").find(match).sort({ raised_at: -1 }).toArray();

  const employeeIds = [...new Set(docs.map((d) => d.employee_id))];
  const eventIds = [...new Set(docs.map((d) => d.evidence_event_id))];
  const disputeIds = docs.map((d) => d.dispute_id);
  const [employees, events, verdictsWithCorrections] = await Promise.all([
    db.collection("employees").find({ employee_id: { $in: employeeIds } }, { projection: { employee_id: 1, name: 1, department: 1 } }).toArray(),
    db.collection("evidence_events").find({ event_id: { $in: eventIds } }).toArray(),
    // Corrections persist on the verdict doc (correction_history), not the
    // dispute doc — they survive a page refresh, unlike the React-state-only
    // version this used to be. Pull the specific entry back out by dispute_id.
    db.collection("verdicts").find(
      { "correction_history.dispute_id": { $in: disputeIds } },
      { projection: { employee_id: 1, competency_id: 1, correction_history: 1 } }
    ).toArray(),
  ]);
  const empMap = new Map(employees.map((e) => [e.employee_id, e]));
  const evMap = new Map(events.map((e) => [e.event_id, e]));
  const correctionByDisputeId = new Map();
  for (const v of verdictsWithCorrections) {
    for (const entry of v.correction_history || []) {
      correctionByDisputeId.set(entry.dispute_id, { employee_id: v.employee_id, competency_id: v.competency_id, ...entry });
    }
  }

  const enriched = docs.map((d) => {
    const ev = evMap.get(d.evidence_event_id);
    return {
      ...d,
      employee_name: empMap.get(d.employee_id)?.name || d.employee_id,
      department: empMap.get(d.employee_id)?.department || null,
      competency_id: ev?.competency_id || null,
      source_type: ev?.source_type || null,
      quote: ev?.raw_text && ev.quote_start != null ? ev.raw_text.slice(ev.quote_start, ev.quote_end) : null,
      correction: correctionByDisputeId.get(d.dispute_id) || null,
    };
  });

  res.json({ disputes: enriched });
});

disputesRouter.post("/", async (req, res) => {
  const db = mongoose.connection.db;
  const { evidence_event_id, employee_id, reason } = req.body || {};
  if (!evidence_event_id || !employee_id || !reason) {
    return res.status(400).json({ error: "evidence_event_id, employee_id and reason are required" });
  }
  const evidenceEvent = await db.collection("evidence_events").findOne({ event_id: evidence_event_id });
  if (!evidenceEvent) return res.status(404).json({ error: "Evidence event not found" });

  const doc = {
    dispute_id: nextDisputeId(),
    evidence_event_id,
    employee_id,
    raised_at: new Date(),
    reason,
    resolution: "open",
    resolved_by: null,
    resolved_at: null,
    raised_by: req.user.email,
  };
  await db.collection("disputes").insertOne(doc);
  res.status(201).json(doc);
});

/**
 * Resolving a dispute doesn't just change a status label — when the
 * resolution implies a credibility correction, it re-weights the disputed
 * event and RE-RUNS that one (employee, competency) pair's verdict
 * immediately, so the correction is visible where everyone actually looks
 * (the employee's profile), not just on the dispute record. Returns
 * before/after so the resolving user sees the effect of what they just
 * did, and the verdict doc keeps a correction_history entry recording it.
 */
disputesRouter.patch("/:disputeId", async (req, res) => {
  const db = mongoose.connection.db;
  const { resolution } = req.body || {};
  if (!resolution) return res.status(400).json({ error: "resolution is required" });

  const dispute = await db.collection("disputes").findOneAndUpdate(
    { dispute_id: req.params.disputeId },
    { $set: { resolution, resolved_by: req.user.email, resolved_at: new Date() } },
    { returnDocument: "after" }
  );
  if (!dispute) return res.status(404).json({ error: "Dispute not found" });

  const override = CREDIBILITY_OVERRIDE_BY_RESOLUTION[resolution];
  let correction = null;

  if (override != null) {
    const disputedEvent = await db.collection("evidence_events").findOne({ event_id: dispute.evidence_event_id });
    if (disputedEvent) {
      await db.collection("evidence_events").updateOne(
        { event_id: disputedEvent.event_id },
        { $set: { credibility_override: override, disputed: true } }
      );
      invalidateRaterStatsCache(); // conservative: an override changes this rater's effective ratings pool

      const { employee_id: employeeId, competency_id: competencyId } = disputedEvent;
      const [beforeDoc, pairEvents, raterStats] = await Promise.all([
        db.collection("verdicts").findOne({ employee_id: employeeId, competency_id: competencyId }),
        db.collection("evidence_events").find({ employee_id: employeeId, competency_id: competencyId }).toArray(),
        getRaterStats(db),
      ]);

      for (const e of pairEvents) e._quarterIdx = Math.floor(tForDate(e.occurred_at));
      const after = recomputePairVerdict(pairEvents, raterStats, new Date());

      const correctionEntry = {
        dispute_id: dispute.dispute_id,
        resolution,
        corrected_at: new Date(),
        verdict_before: beforeDoc?.verdict ?? null,
        confidence_before: beforeDoc?.confidence ?? null,
        verdict_after: after.verdict,
        confidence_after: after.confidence,
      };

      // Only overwrite the fields this on-demand recompute actually derives
      // (see recomputePair.js's doc comment — it doesn't replay regime
      // segmentation/recency-override, so it deliberately leaves the batch
      // pipeline's regime/evidence_window/recommendation fields untouched
      // rather than presenting a partially-recomputed doc as complete).
      if (beforeDoc) {
        await db.collection("verdicts").updateOne(
          { employee_id: employeeId, competency_id: competencyId },
          {
            $set: {
              verdict: after.verdict, confidence: after.confidence, probs: after.probs,
              level_mu: after.level_mu, velocity_mu: after.velocity_mu, velocity_sd: after.velocity_sd,
              sufficiency_score: after.sufficiency_score, sufficiency_flags: after.sufficiency_flags,
              corrected_by_dispute: true,
            },
            $push: { correction_history: correctionEntry },
          }
        );
      }

      correction = { employee_id: employeeId, competency_id: competencyId, ...correctionEntry };
    }
  }

  res.json({ ...dispute, correction });
});
