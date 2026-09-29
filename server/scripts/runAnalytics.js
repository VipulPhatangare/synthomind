/**
 * Phase 3 entrypoint: runs the full analytics engine over the generated
 * dataset — rater calibration, per-pair Kalman filtering, ROPE verdicts,
 * evidence sufficiency, Theil-Sen/Mann-Kendall cross-checks, CUSUM change
 * points, leave-one-source-out sensitivity, recommendations, and (once all
 * of an employee's per-competency verdicts exist) employee-level divergence
 * profiles. Writes `verdicts`, `recommendations_issued`, and
 * `employee_profiles`, clearing them first (idempotent).
 *
 *   npm run run-analytics
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";
import { competenciesForDepartment } from "../data_gen/referenceData.js";
import { computeRaterStats } from "../src/services/analytics/calibration.js";
import { computeWeight } from "../src/services/analytics/weighting.js";
import { fitTrajectorySegments, runKalmanAdaptive } from "../src/services/analytics/kalman.js";
import { computeSufficiency, suggestEvidenceForSufficiency } from "../src/services/analytics/sufficiency.js";
import { ropeVerdict } from "../src/services/analytics/verdictLogic.js";
import { theilSenSlope, mannKendall, cusumChangePoint } from "../src/services/analytics/stats.js";
import { buildRecommendation } from "../src/services/analytics/recommend.js";
import { computeDivergence } from "../src/services/analytics/divergence.js";

const DATASET_START = new Date(Date.UTC(2024, 9, 1)); // matches data_gen/archetypes.js QUARTERS[0].start
const NOW_DATE = new Date(Date.UTC(2026, 8, 29));
const MS_PER_QUARTER = 91.25 * 86400000;

function tFor(date) {
  return (date.getTime() - DATASET_START.getTime()) / MS_PER_QUARTER;
}

async function main() {
  await connectDb();
  const db = mongoose.connection.db;

  console.log("Loading data...");
  const [employees, roleProfiles, actionCatalog, evidenceEvents, orgEvents] = await Promise.all([
    db.collection("employees").find({}).toArray(),
    db.collection("role_profiles").find({}).toArray(),
    db.collection("action_catalog").find({}).toArray(),
    db.collection("evidence_events").find({}).toArray(),
    db.collection("org_events").find({}).toArray(),
  ]);
  console.log(`  employees: ${employees.length}, role_profiles: ${roleProfiles.length}, action_catalog: ${actionCatalog.length}, evidence_events: ${evidenceEvents.length}, org_events: ${orgEvents.length}`);

  const orgEventsByEmployee = new Map();
  for (const oe of orgEvents) {
    if (!orgEventsByEmployee.has(oe.employee_id)) orgEventsByEmployee.set(oe.employee_id, []);
    orgEventsByEmployee.get(oe.employee_id).push(oe);
  }

  const roleProfileMap = new Map();
  for (const rp of roleProfiles) roleProfileMap.set(`${rp.role_id}::${rp.competency_id}`, rp);

  // --- rater calibration (global, across manager+peer feedback) ---
  const ratedEvents = evidenceEvents.filter((e) => e.source_type === "manager_feedback" || e.source_type === "peer_feedback");
  const { raterStats } = computeRaterStats(ratedEvents);
  console.log(`  computed calibration stats for ${raterStats.size} raters`);

  // --- group evidence by (employee, competency) pair ---
  const byPair = new Map();
  for (const e of evidenceEvents) {
    e._quarterIdx = Math.floor(tFor(e.occurred_at));
    const key = `${e.employee_id}::${e.competency_id}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(e);
  }

  const verdictDocs = [];
  const recommendationDocs = [];
  let processed = 0;

  for (const employee of employees) {
    const comps = competenciesForDepartment(employee.department);
    for (const competencyId of comps) {
      const key = `${employee.employee_id}::${competencyId}`;
      const events = byPair.get(key) || [];

      const weighted = events.map((e) => ({ event: e, ...computeWeight(e, raterStats) }));
      const observations = weighted.map((w) => ({
        t: tFor(w.event.occurred_at), level: w.event.observed_level, variance: w.variance,
        eventId: w.event.event_id, sourceType: w.event.source_type,
      }));

      // cross-checks — the change point is computed FIRST because the
      // trajectory fit uses it to decide whether a two-regime model is
      // warranted (previously it was computed, stored, and never used).
      const points = events.map((e) => ({ t: tFor(e.occurred_at), y: e.observed_level }));
      const theilSen = points.length >= 2 ? theilSenSlope(points) : null;
      const mk = points.length >= 3 ? mannKendall(points) : null;
      const sortedByT = [...points].sort((a, b) => a.t - b.t).map((p) => p.y);
      const changePointIdx = cusumChangePoint(sortedByT);

      const fit = fitTrajectorySegments(observations, changePointIdx) || {
        full: { levelMu: 2.5, levelVar: 4.0, velocityMu: 0, velocityVar: 1.0, influences: [], history: [], nObservations: 0, qLevelScale: 1 },
        post: null,
        regime: { change_point_index: null, segment_available: false, reason: "no_evidence" },
      };

      const fullSufficiency = computeSufficiency(events, weighted.map((w) => w.weight), raterStats, NOW_DATE);
      const fullVerdict = ropeVerdict(fit.full.velocityMu, fit.full.velocityVar, fullSufficiency.score);

      // RECENCY PROMOTION: a confident, independently-evidenced post-break
      // read is allowed to promote an "insufficient_evidence" full-history
      // verdict into a real one — e.g. a late bloomer whose whole-history
      // velocity dilutes a genuine recent climb into statistical noise, but
      // whose last few quarters alone tell a clear, well-evidenced story.
      // It NEVER overrides a full-history verdict that was already
      // confident (improving/declining/stagnating): more data beats less
      // data whenever the full history already had enough to decide, so
      // this can only convert an abstention, never flip a call. See
      // kalman.js's fitTrajectorySegments doc comment for why this isn't
      // gated on the BIC comparison.
      let operative = { source: "full_history", kalman: fit.full, result: fullVerdict, sufficiency: fullSufficiency, events };
      if (fit.post && fullVerdict.verdict === "insufficient_evidence") {
        const sinceT = fit.regime.change_point_t;
        const postEvents = events.filter((e) => tFor(e.occurred_at) >= sinceT);
        const postWeighted = weighted.filter((w) => tFor(w.event.occurred_at) >= sinceT);
        const postSufficiency = computeSufficiency(postEvents, postWeighted.map((w) => w.weight), raterStats, NOW_DATE);
        const postVerdict = ropeVerdict(fit.post.velocityMu, fit.post.velocityVar, postSufficiency.score);
        // postVerdict.verdict being improving/declining already implies
        // postSufficiency cleared the same 0.30 gate everything else does —
        // ropeVerdict forces insufficient_evidence below that regardless of
        // the posterior, so there's no separate threshold to duplicate here.
        if (postVerdict.verdict === "improving" || postVerdict.verdict === "declining") {
          operative = { source: "recent_regime", kalman: fit.post, result: postVerdict, sufficiency: postSufficiency, events: postEvents };
        }
      }

      const { verdict, confidence, probs, p_equivalence } = operative.result;
      const kalman = operative.kalman;
      const sufficiency = operative.sufficiency;

      // leave-one-source-out sensitivity
      const distinctSourceTypes = [...new Set(events.map((e) => e.source_type))];
      const looSensitivity = [];
      if (distinctSourceTypes.length >= 2) {
        for (const st of distinctSourceTypes) {
          const subsetObs = observations.filter((o) => o.sourceType !== st);
          const subsetEvents = events.filter((e) => e.source_type !== st);
          if (subsetObs.length === 0) continue;
          const kalmanSub = runKalmanAdaptive(subsetObs);
          const weightsSub = weighted.filter((w) => w.event.source_type !== st).map((w) => w.weight);
          const sufficiencySub = computeSufficiency(subsetEvents, weightsSub, raterStats, NOW_DATE);
          const verdictSub = ropeVerdict(kalmanSub.velocityMu, kalmanSub.velocityVar, sufficiencySub.score);
          looSensitivity.push({
            excluded_source_type: st, verdict_without: verdictSub.verdict,
            confidence_without: verdictSub.confidence, verdict_changed: verdictSub.verdict !== verdict,
          });
        }
      }

      const roleProfile = roleProfileMap.get(`${employee.role_id}::${competencyId}`);

      // "What would change my mind" counterfactual — only meaningful when
      // we actually abstained. Uses the OPERATIVE sufficiency/weights so a
      // recency-promoted pair (which already found a confident recent
      // regime) doesn't get a redundant suggestion.
      let evidenceCounterfactual = null;
      if (verdict === "insufficient_evidence") {
        const operativeWeights = weighted
          .filter((w) => operative.events.includes(w.event))
          .map((w) => w.weight);
        const avgWeight = operativeWeights.length
          ? operativeWeights.reduce((a, b) => a + b, 0) / operativeWeights.length
          : undefined;
        evidenceCounterfactual = suggestEvidenceForSufficiency(sufficiency, avgWeight);
      }

      verdictDocs.push({
        employee_id: employee.employee_id,
        competency_id: competencyId,
        verdict,
        confidence,
        probs,
        p_equivalence,
        // Which evidence window actually produced this verdict, and — when
        // it's the recent-regime override — the full-history read it
        // superseded, so the UI can show the contrast ("flat across the
        // full history; improving since Q1 2026, based on the last 6
        // observations").
        evidence_window: {
          scope: operative.source,
          since_t: operative.source === "recent_regime" ? fit.regime.change_point_t : null,
          since_date: operative.source === "recent_regime"
            ? new Date(DATASET_START.getTime() + fit.regime.change_point_t * MS_PER_QUARTER)
            : null,
        },
        regime: fit.regime,
        full_series: operative.source === "recent_regime" ? {
          level_mu: Math.round(fit.full.levelMu * 1000) / 1000,
          velocity_mu: Math.round(fit.full.velocityMu * 1000) / 1000,
          velocity_sd: Math.round(Math.sqrt(fit.full.velocityVar) * 1000) / 1000,
          verdict: fullVerdict.verdict,
          confidence: fullVerdict.confidence,
          n_observations: fit.full.nObservations,
        } : null,
        q_level_scale: Math.round((kalman.qLevelScale ?? 1) * 1000) / 1000,
        level_mu: Math.round(kalman.levelMu * 1000) / 1000,
        level_sd: Math.round(Math.sqrt(kalman.levelVar) * 1000) / 1000,
        velocity_mu: Math.round(kalman.velocityMu * 1000) / 1000,
        velocity_sd: Math.round(Math.sqrt(kalman.velocityVar) * 1000) / 1000,
        n_observations: operative.events.length,
        n_observations_total: events.length,
        sufficiency_score: sufficiency.score,
        sufficiency_components: sufficiency.components,
        sufficiency_flags: sufficiency.flags,
        evidence_counterfactual: evidenceCounterfactual,
        cross_checks: {
          theil_sen_slope: theilSen != null ? Math.round(theilSen * 1000) / 1000 : null,
          mann_kendall_tau: mk ? Math.round(mk.tau * 1000) / 1000 : null,
          mann_kendall_p: mk ? Math.round(mk.pValue * 1000) / 1000 : null,
          change_point_index: changePointIdx,
        },
        top_influential_evidence: [...kalman.influences].sort((a, b) => b.influence - a.influence).slice(0, 5),
        level_history: fit.full.history,
        loo_sensitivity: looSensitivity,
        role_target_level: roleProfile ? roleProfile.target_level : null,
        updated_at: NOW_DATE,
      });

      const rec = buildRecommendation({
        employeeId: employee.employee_id, competencyId, verdict,
        levelMu: kalman.levelMu, velocityMu: kalman.velocityMu, sufficiency,
        roleProfile, events, actionCatalog, influences: kalman.influences, nowDate: NOW_DATE,
        evidenceCounterfactual,
      });
      if (rec) recommendationDocs.push(rec);

      processed += 1;
    }
  }

  console.log(`\nComputed ${processed} verdicts, ${recommendationDocs.length} recommendations.`);

  // --- employee-level divergence profiles ---
  // Requires all of an employee's per-competency verdicts, so this runs
  // after the main loop rather than inline with it.
  console.log("\nComputing divergence profiles...");
  const verdictsByEmployee = new Map();
  for (const v of verdictDocs) {
    if (!verdictsByEmployee.has(v.employee_id)) verdictsByEmployee.set(v.employee_id, []);
    verdictsByEmployee.get(v.employee_id).push(v);
  }

  const profileDocs = [];
  for (const employee of employees) {
    const empVerdicts = verdictsByEmployee.get(employee.employee_id) || [];
    const divergence = computeDivergence(empVerdicts);

    // Attach candidate explanations: an org event (role/team/manager change)
    // that falls inside the shared evidence window of a trade-off pair is
    // offered as a plausible cause, not asserted as one — surfaced in the UI
    // as "around the same time as: <event>", not as established causation.
    const empOrgEvents = orgEventsByEmployee.get(employee.employee_id) || [];
    for (const pair of divergence.tradeoff_pairs) {
      const gaining = empVerdicts.find((v) => v.competency_id === pair.gaining_competency_id);
      const losing = empVerdicts.find((v) => v.competency_id === pair.losing_competency_id);
      const tStart = Math.max(gaining.level_history[0]?.t ?? 0, losing.level_history[0]?.t ?? 0);
      const tEnd = Math.min(
        gaining.level_history[gaining.level_history.length - 1]?.t ?? 0,
        losing.level_history[losing.level_history.length - 1]?.t ?? 0
      );
      pair.candidate_org_events = empOrgEvents
        .filter((oe) => {
          const t = tFor(oe.occurred_at);
          return t >= tStart && t <= tEnd;
        })
        .map((oe) => ({ event_type: oe.event_type, occurred_at: oe.occurred_at }));
    }

    profileDocs.push({
      employee_id: employee.employee_id,
      ...divergence,
      n_competencies: empVerdicts.length,
      updated_at: NOW_DATE,
    });
  }
  const divergentCount = profileDocs.filter((p) => p.profile_shape === "divergent").length;
  const tradeoffCount = profileDocs.reduce((a, p) => a + p.tradeoff_pairs.length, 0);
  console.log(`  ${divergentCount} employees flagged divergent, ${tradeoffCount} trade-off pairs identified`);

  console.log("\nClearing previous verdicts/recommendations/profiles...");
  await db.collection("verdicts").deleteMany({});
  await db.collection("recommendations_issued").deleteMany({});
  await db.collection("employee_profiles").deleteMany({});

  console.log("Writing verdicts...");
  for (let i = 0; i < verdictDocs.length; i += 1000) {
    await db.collection("verdicts").insertMany(verdictDocs.slice(i, i + 1000), { ordered: false });
  }
  console.log("Writing recommendations...");
  for (let i = 0; i < recommendationDocs.length; i += 1000) {
    await db.collection("recommendations_issued").insertMany(recommendationDocs.slice(i, i + 1000), { ordered: false });
  }
  console.log("Writing employee profiles...");
  for (let i = 0; i < profileDocs.length; i += 1000) {
    await db.collection("employee_profiles").insertMany(profileDocs.slice(i, i + 1000), { ordered: false });
  }

  // verdict distribution
  const dist = {};
  for (const v of verdictDocs) dist[v.verdict] = (dist[v.verdict] || 0) + 1;
  console.log("\n--- Verdict distribution ---");
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(22)} ${v}`);

  // quick accuracy check against generator ground truth, if available
  const gtPath = path.resolve("data_gen", "ground_truth.json");
  if (fs.existsSync(gtPath)) {
    const groundTruth = JSON.parse(fs.readFileSync(gtPath, "utf8"));
    const gtMap = new Map(groundTruth.map((g) => [`${g.employee_id}::${g.competency_id}`, g.expected_verdict]));
    let correct = 0, total = 0;
    const confusion = {};
    for (const v of verdictDocs) {
      const expected = gtMap.get(`${v.employee_id}::${v.competency_id}`);
      if (!expected) continue;
      total += 1;
      if (expected === v.verdict) correct += 1;
      const ck = `${expected}->${v.verdict}`;
      confusion[ck] = (confusion[ck] || 0) + 1;
    }
    console.log(`\n--- Quick accuracy vs. ground truth ---`);
    console.log(`  raw accuracy: ${correct}/${total} = ${(100 * correct / total).toFixed(1)}%`);
    console.log(`  (this is a sanity check, not the full Phase 9 calibration/ECE eval)`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
