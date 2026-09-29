/**
 * Builds the two chunk tiers described in the plan:
 *   - "evidence"  : one chunk per free-text evidence_event (manager/peer
 *                   feedback) — the raw session text, already natural
 *                   language, so it's embedded as-is.
 *   - "summary"   : one chunk per (employee, competency) verdict — a
 *                   synthesized paragraph, regenerated whenever verdicts
 *                   are recomputed, for answering broad questions
 *                   ("who's declining in X this quarter") without reading
 *                   hundreds of raw chunks.
 *
 * Deliberately scoped to free-text sources only (not assessments/KPIs/etc)
 * to stay within Atlas M0's storage budget — see Phase 5 notes.
 */

const TEXT_SOURCE_TYPES = new Set(["manager_feedback", "peer_feedback"]);

export function buildEvidenceChunks(evidenceEvents) {
  return evidenceEvents
    .filter((e) => TEXT_SOURCE_TYPES.has(e.source_type) && e.raw_text)
    .map((e) => ({
      chunk_id: `CHK-EV-${e.event_id}`,
      chunk_type: "evidence",
      source_id: e.event_id,
      employee_id: e.employee_id,
      competency_id: e.competency_id,
      department: e._department || null,
      occurred_at: e.occurred_at,
      text: e.raw_text,
    }));
}

function verdictSummaryText(v, employee, competencyName) {
  const flags = (v.sufficiency_flags || []).join(", ") || "none";
  return [
    `${employee.name} (${employee.role_title}, ${employee.department}) — ${competencyName}.`,
    `Verdict: ${v.verdict.replace(/_/g, " ")} (confidence ${(v.confidence * 100).toFixed(0)}%).`,
    `Estimated current level ${v.level_mu.toFixed(2)} of 5, velocity ${v.velocity_mu >= 0 ? "+" : ""}${v.velocity_mu.toFixed(2)} per quarter.`,
    `Based on ${v.n_observations} observations; evidence sufficiency ${(v.sufficiency_score * 100).toFixed(0)}% (flags: ${flags}).`,
    v.role_target_level != null ? `Role target level is ${v.role_target_level}.` : "",
  ].filter(Boolean).join(" ");
}

export function buildSummaryChunks(verdicts, employeesById, competenciesById) {
  return verdicts.map((v) => {
    const employee = employeesById.get(v.employee_id);
    const competencyName = competenciesById.get(v.competency_id)?.name || v.competency_id;
    return {
      chunk_id: `CHK-SUM-${v.employee_id}-${v.competency_id}`,
      chunk_type: "summary",
      source_id: `${v.employee_id}::${v.competency_id}`,
      employee_id: v.employee_id,
      competency_id: v.competency_id,
      department: employee?.department || null,
      occurred_at: v.updated_at,
      text: verdictSummaryText(v, employee || { name: v.employee_id, role_title: "", department: "" }, competencyName),
    };
  });
}
