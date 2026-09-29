import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res) => {
  const db = mongoose.connection.db;

  const [verdictDist, deptDist, topGaps, openDisputes, shapeDist, tradeoffCount, decliningVerdicts, staleCount] = await Promise.all([
    db.collection("verdicts").aggregate([
      { $group: { _id: "$verdict", n: { $sum: 1 } } },
    ]).toArray(),
    db.collection("employees").aggregate([
      { $group: { _id: "$department", n: { $sum: 1 } } },
    ]).toArray(),
    db.collection("recommendations_issued").find({}).sort({ priority: -1 }).limit(10).toArray(),
    db.collection("disputes").countDocuments({ resolution: "open" }),
    db.collection("employee_profiles").aggregate([
      { $group: { _id: "$profile_shape", n: { $sum: 1 } } },
    ]).toArray(),
    db.collection("employee_profiles").aggregate([
      { $project: { n: { $size: { $ifNull: ["$tradeoff_pairs", []] } } } },
      { $group: { _id: null, total: { $sum: "$n" } } },
    ]).toArray(),
    // "critical" = dept-specific competency (role_profiles.is_growth_edge),
    // not just any decline — joined at query time rather than stored on the
    // verdict doc, to avoid a pipeline field + full regen for one dashboard tile.
    db.collection("verdicts").find({ verdict: "declining" }, { projection: { employee_id: 1, competency_id: 1 } }).toArray(),
    db.collection("verdicts").countDocuments({ sufficiency_flags: "stale" }),
  ]);

  let decliningOnCritical = 0;
  if (decliningVerdicts.length) {
    const employeeIds = [...new Set(decliningVerdicts.map((v) => v.employee_id))];
    const employees = await db.collection("employees")
      .find({ employee_id: { $in: employeeIds } }, { projection: { employee_id: 1, role_id: 1 } }).toArray();
    const roleByEmployee = new Map(employees.map((e) => [e.employee_id, e.role_id]));
    const roleProfiles = await db.collection("role_profiles")
      .find({ is_growth_edge: true }, { projection: { role_id: 1, competency_id: 1 } }).toArray();
    const criticalPairs = new Set(roleProfiles.map((rp) => `${rp.role_id}::${rp.competency_id}`));
    decliningOnCritical = decliningVerdicts.filter((v) =>
      criticalPairs.has(`${roleByEmployee.get(v.employee_id)}::${v.competency_id}`)
    ).length;
  }

  res.json({
    verdict_distribution: Object.fromEntries(verdictDist.map((d) => [d._id, d.n])),
    department_distribution: Object.fromEntries(deptDist.map((d) => [d._id, d.n])),
    top_priority_recommendations: topGaps,
    open_disputes: openDisputes,
    profile_shape_distribution: Object.fromEntries(shapeDist.map((d) => [d._id, d.n])),
    n_tradeoff_pairs: tradeoffCount[0]?.total || 0,
    declining_on_critical: decliningOnCritical,
    stale_evidence_count: staleCount,
  });
});

/**
 * Fairness audit: verdict distribution split by the synthetic demographic
 * bucket — this field is used ONLY here, never by the analytics engine.
 * A meaningful skew between groups is the signal this view exists to catch.
 *
 * Also audits EVIDENCE volume/diversity by group, not just verdicts. A
 * verdict-only audit can look clean while still being unfair upstream: if
 * one group systematically gets fewer observations or a narrower mix of
 * source types, they'll hit the sufficiency gate and land in
 * insufficient_evidence more often — a fairness problem the model didn't
 * cause and can't see, because by the time it runs, the evidence gap is
 * already baked into the input.
 */
dashboardRouter.get("/bias-audit", async (req, res) => {
  const db = mongoose.connection.db;

  const employees = await db.collection("employees").find({}, {
    projection: { employee_id: 1, demographic_group_synthetic: 1 },
  }).toArray();
  const groupByEmployee = new Map(employees.map((e) => [e.employee_id, e.demographic_group_synthetic]));
  const groupCounts = { A: 0, B: 0 };
  for (const g of groupByEmployee.values()) if (groupCounts[g] != null) groupCounts[g] += 1;

  const verdicts = await db.collection("verdicts").find({}).toArray();

  const byGroup = { A: { improving: 0, declining: 0, stagnating: 0, insufficient_evidence: 0 },
                    B: { improving: 0, declining: 0, stagnating: 0, insufficient_evidence: 0 } };
  const specificityByGroup = { A: [], B: [] };
  const suffScoreByGroup = { A: [], B: [] };
  const nObsByGroup = { A: [], B: [] };

  for (const v of verdicts) {
    const g = groupByEmployee.get(v.employee_id);
    if (!g || !byGroup[g]) continue;
    byGroup[g][v.verdict] = (byGroup[g][v.verdict] || 0) + 1;
    suffScoreByGroup[g].push(v.sufficiency_score);
    nObsByGroup[g].push(v.n_observations_total ?? v.n_observations ?? 0);
  }

  // Evidence volume/diversity audit: distinct source-type count per
  // (employee, competency) pair, grouped by demographic bucket.
  const allEvents = await db.collection("evidence_events").find(
    {},
    { projection: { employee_id: 1, competency_id: 1, source_type: 1, specificity: 1 } }
  ).toArray();
  const sourceTypesByPair = new Map();
  for (const e of allEvents) {
    const g = groupByEmployee.get(e.employee_id);
    if (g && specificityByGroup[g] && e.specificity != null) specificityByGroup[g].push(e.specificity);
    const key = `${e.employee_id}::${e.competency_id}`;
    if (!sourceTypesByPair.has(key)) sourceTypesByPair.set(key, { group: g, types: new Set() });
    sourceTypesByPair.get(key).types.add(e.source_type);
  }
  const diversityByGroup = { A: [], B: [] };
  for (const { group, types } of sourceTypesByPair.values()) {
    if (group && diversityByGroup[group]) diversityByGroup[group].push(types.size);
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

  res.json({
    group_sizes: groupCounts,
    verdict_distribution_by_group: byGroup,
    avg_feedback_specificity_by_group: {
      A: round3(avg(specificityByGroup.A)),
      B: round3(avg(specificityByGroup.B)),
    },
    evidence_volume_audit: {
      avg_observations_per_pair_by_group: { A: round3(avg(nObsByGroup.A)), B: round3(avg(nObsByGroup.B)) },
      avg_sufficiency_score_by_group: { A: round3(avg(suffScoreByGroup.A)), B: round3(avg(suffScoreByGroup.B)) },
      avg_source_type_diversity_by_group: { A: round3(avg(diversityByGroup.A)), B: round3(avg(diversityByGroup.B)) },
      note: "If these differ meaningfully between groups, verdict-distribution parity above can look fine while still masking an upstream evidence gap — a group with fewer/less-diverse observations will hit the sufficiency gate more often regardless of actual performance.",
    },
    note: "demographic_group_synthetic is a fictional audit-only field — never used as a model input.",
  });
});

/**
 * Competency × department heatmap: mean velocity, pair count, and mean
 * sufficiency per cell. Replaces the headcount-by-department bar chart as
 * the dashboard's second visual — headcount alone says nothing about
 * trajectory, and this is the one view that shows "which department is
 * struggling on which competency" at a glance.
 */
dashboardRouter.get("/heatmap", async (req, res) => {
  const db = mongoose.connection.db;

  const employees = await db.collection("employees")
    .find({}, { projection: { employee_id: 1, department: 1 } }).toArray();
  const deptByEmployee = new Map(employees.map((e) => [e.employee_id, e.department]));

  const verdicts = await db.collection("verdicts")
    .find({}, { projection: { employee_id: 1, competency_id: 1, velocity_mu: 1, sufficiency_score: 1 } })
    .toArray();

  const cells = new Map(); // `${dept}::${competency}` -> { velocities: [], sufficiencies: [] }
  for (const v of verdicts) {
    const dept = deptByEmployee.get(v.employee_id);
    if (!dept) continue;
    const key = `${dept}::${v.competency_id}`;
    if (!cells.has(key)) cells.set(key, { department: dept, competency_id: v.competency_id, velocities: [], sufficiencies: [] });
    const cell = cells.get(key);
    cell.velocities.push(v.velocity_mu);
    cell.sufficiencies.push(v.sufficiency_score);
  }

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const round3 = (x) => Math.round(x * 1000) / 1000;

  const grid = [...cells.values()].map((c) => ({
    department: c.department,
    competency_id: c.competency_id,
    n: c.velocities.length,
    mean_velocity: round3(avg(c.velocities)),
    mean_sufficiency: round3(avg(c.sufficiencies)),
  }));

  res.json({ grid });
});

/**
 * Team / succession rollup: competency coverage by manager and by
 * competency across the whole org, plus single-point-of-failure detection
 * — a critical competency where exactly one person currently clears the
 * role target. Built entirely from `verdicts` + `role_profiles`, no new
 * evidence source.
 */
dashboardRouter.get("/team-rollup", async (req, res) => {
  const db = mongoose.connection.db;
  const { department } = req.query;

  const empMatch = department ? { department } : {};
  const employees = await db.collection("employees")
    .find(empMatch, { projection: { employee_id: 1, name: 1, department: 1, manager_id: 1, role_id: 1 } })
    .toArray();
  const employeeIds = employees.map((e) => e.employee_id);
  const empById = new Map(employees.map((e) => [e.employee_id, e]));

  const verdicts = employeeIds.length
    ? await db.collection("verdicts").find({ employee_id: { $in: employeeIds } }).toArray()
    : [];

  // By-manager verdict skew: flags a manager whose reports skew declining
  // more than the org baseline — could be a real team problem, or a rater
  // calibration artifact (that distinction is what calibration.js's
  // per-rater stats are for; this view just surfaces the skew to look into).
  const byManager = new Map();
  for (const v of verdicts) {
    const emp = empById.get(v.employee_id);
    if (!emp?.manager_id) continue;
    if (!byManager.has(emp.manager_id)) {
      byManager.set(emp.manager_id, { improving: 0, declining: 0, stagnating: 0, insufficient_evidence: 0, n: 0 });
    }
    const bucket = byManager.get(emp.manager_id);
    bucket[v.verdict] = (bucket[v.verdict] || 0) + 1;
    bucket.n += 1;
  }
  const orgDecliningRate = verdicts.length
    ? verdicts.filter((v) => v.verdict === "declining").length / verdicts.length
    : 0;
  const managerRollup = [...byManager.entries()].map(([managerId, bucket]) => ({
    manager_id: managerId,
    manager_name: empById.get(managerId)?.name || managerId,
    n_reports_competency_pairs: bucket.n,
    declining_rate: bucket.n ? Math.round((bucket.declining / bucket.n) * 1000) / 1000 : 0,
    skew_vs_org: bucket.n ? Math.round(((bucket.declining / bucket.n) - orgDecliningRate) * 1000) / 1000 : 0,
    counts: bucket,
  })).sort((a, b) => b.skew_vs_org - a.skew_vs_org);

  // Bench depth / single-point-of-failure: per competency, how many people
  // in scope currently clear their role target level.
  const roleProfiles = await db.collection("role_profiles").find({}).toArray();
  const targetByRoleComp = new Map(roleProfiles.map((rp) => [`${rp.role_id}::${rp.competency_id}`, rp]));

  const byCompetency = new Map();
  for (const v of verdicts) {
    const emp = empById.get(v.employee_id);
    const rp = targetByRoleComp.get(`${emp?.role_id}::${v.competency_id}`);
    const target = rp?.target_level ?? v.role_target_level;
    if (target == null) continue;
    if (!byCompetency.has(v.competency_id)) byCompetency.set(v.competency_id, { above: [], total: 0, critical: rp?.is_growth_edge || false });
    const bucket = byCompetency.get(v.competency_id);
    bucket.total += 1;
    if (v.level_mu >= target) bucket.above.push(emp.employee_id);
  }
  const benchDepth = [...byCompetency.entries()].map(([competencyId, bucket]) => ({
    competency_id: competencyId,
    n_above_target: bucket.above.length,
    n_total: bucket.total,
    is_single_point_of_failure: bucket.above.length === 1,
    at_risk_employee_id: bucket.above.length === 1 ? bucket.above[0] : null,
  })).sort((a, b) => a.n_above_target - b.n_above_target);

  res.json({
    manager_rollup: managerRollup,
    bench_depth: benchDepth,
    single_point_of_failure_count: benchDepth.filter((b) => b.is_single_point_of_failure).length,
    org_declining_rate: Math.round(orgDecliningRate * 1000) / 1000,
  });
});
