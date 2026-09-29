/**
 * Main orchestration: builds the full 500-employee synthetic dataset in
 * memory (pure, no DB calls) — the CLI script (scripts/generateData.js)
 * bulk-inserts the result. See the conversation's master plan for the full
 * rationale; this is the implementation of Phase 2.
 */
import { Rng } from "./rng.js";
import { FIRST_NAMES, LAST_NAMES, CITIES } from "./names.js";
import {
  DEPARTMENTS, LEVELS,
  buildCompetencies, competenciesForDepartment,
  buildRoles, buildRoleProfiles, buildActionCatalog,
} from "./referenceData.js";
import {
  QUARTERS, N_QUARTERS, randomTimestampInQuarter,
  RANDOM_POOL, RANDOM_POOL_WEIGHTS,
  simulateTrueSeries, expectedVerdict,
} from "./archetypes.js";
import { buildSessionText, specificityFor } from "./textBank.js";

const SEED = 42;

// KPI-mapped competencies per department: execution + one dept-specific one
const KPI_MAPPED = {
  Engineering: ["execution", "system_design"],
  Sales: ["execution", "pipeline_mgmt"],
  Marketing: ["execution", "campaign_strategy"],
  Product: ["execution", "roadmap_prioritization"],
  Design: ["execution", "visual_craft"],
  Finance: ["execution", "financial_modeling"],
  HR: ["execution", "talent_assessment"],
  Support: ["execution", "customer_resolution"],
};

let eventCounter = 0;
function nextId(prefix) {
  eventCounter += 1;
  return `${prefix}-${String(eventCounter).padStart(7, "0")}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

// ---------------------------------------------------------------------------
// Employees + org structure
// ---------------------------------------------------------------------------

function generateEmployees(rng, n = 500) {
  const employees = [];
  const levelWeights = [0.35, 0.35, 0.20, 0.10];
  const now = new Date(Date.UTC(2026, 8, 29));

  for (let i = 0; i < n; i++) {
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    const level = rng.weightedChoice(LEVELS, levelWeights);
    const levelIdx = LEVELS.indexOf(level);
    const teamNum = rng.integers(1, 4); // 1-3
    const tenureDays = rng.integers(180, 6 * 365);
    const joinedAt = addDays(now, -tenureDays);
    const roleStartedAt = rng.random() < 0.15
      ? addDays(joinedAt, rng.integers(0, Math.min(tenureDays, 500)))
      : joinedAt;

    employees.push({
      employee_id: `E-${String(i + 1).padStart(4, "0")}`,
      name: `${rng.choice(FIRST_NAMES)} ${rng.choice(LAST_NAMES)}`,
      department: dept,
      level,
      level_idx: levelIdx,
      role_id: `${dept.slice(0, 3).toUpperCase()}-${level.toUpperCase()}`,
      role_title: `${level} ${dept}`,
      team_id: `${dept.slice(0, 3).toUpperCase()}-T${teamNum}`,
      manager_id: null,
      joined_at: joinedAt,
      role_started_at: roleStartedAt,
      location: rng.choice(CITIES),
      employment_type: rng.random() < 0.9 ? "full_time" : "contractor",
      status: "active",
      departure_quarter: null,
      demographic_group_synthetic: rng.random() < 0.5 ? "A" : "B",
    });
  }
  return employees;
}

function assignManagers(rng, employees) {
  const byDept = {};
  for (const e of employees) (byDept[e.department] ??= []).push(e);

  const deptManagerPool = {};

  for (const dept of DEPARTMENTS) {
    const list = byDept[dept] || [];
    let leads = list.filter((e) => e.level === "Lead");
    let seniors = list.filter((e) => e.level === "Senior");
    if (leads.length === 0 && list.length > 0) {
      list[0].level = "Lead";
      list[0].level_idx = 3;
      list[0].role_id = `${dept.slice(0, 3).toUpperCase()}-LEAD`;
      list[0].role_title = `Lead ${dept}`;
      leads = [list[0]];
    }
    const managerPool = [...leads, ...seniors];
    deptManagerPool[dept] = managerPool.map((e) => e.employee_id);

    for (const e of list) {
      if (e.level === "Lead") { e.manager_id = null; continue; }
      if (e.level === "Senior") {
        e.manager_id = leads.length ? rng.choice(leads).employee_id : null;
        continue;
      }
      // Associate / Mid
      e.manager_id = managerPool.length ? rng.choice(managerPool).employee_id : null;
    }
  }
  return deptManagerPool;
}

// ---------------------------------------------------------------------------
// Archetype assignment (the interesting part)
// ---------------------------------------------------------------------------

function pickShowcaseIndices() {
  return {
    mixedProfile: 0,
    roleSwitcher: 70,
    biasedRater: 140,
    halo: 210,
    unobserved: 280,
    sparse: 350,
    crossSectional: [30, 100, 170, 240, 310, 380, 420, 460],
    attrition: [15, 55, 95, 135, 175, 225, 265, 305, 345, 405],
  };
}

function buildTrajectoryPlans(rng, employees, roleProfiles, deptManagerPool) {
  const roleProfileMap = {};
  for (const rp of roleProfiles) roleProfileMap[`${rp.role_id}::${rp.competency_id}`] = rp;

  const plans = {}; // key: `${employee_id}::${competency_id}` -> plan
  const orgEvents = [];
  const managerLeniencyOverrides = {}; // manager_id -> leniency delta
  const haloManagers = new Set();
  const managerByQuarterOverride = {}; // employee_id -> [8] manager_ids (only set when different from default)

  // Manifest of the deliberately-constructed demo cases, emitted as
  // data_gen/showcase.json and served via /api/meta/showcase. Built HERE, at
  // generation time, rather than hardcoded in the client: showcase employees
  // are picked by ARRAY INDEX (pickShowcaseIndices), so any change to the
  // employee roster silently repoints them — a hardcoded E-0001 in the UI
  // would rot the moment anyone re-runs generate-data.
  const showcases = [];
  const addShowcase = (entry) => showcases.push(entry);

  const showcase = pickShowcaseIndices();

  // Directional headroom: a strong decliner/improver needs enough runway
  // that its true trajectory doesn't hit the 0.2-5.0 floor/ceiling (or the
  // 1-5 rating scale's own practical floor/ceiling) partway through and
  // flatten out — which would dilute the observable slope back below the
  // ROPE delta. See Phase 3 debugging notes.
  const RISING = new Set(["steady_improver", "role_switch_up"]);
  const DECLINING = new Set(["decliner", "role_switch_down"]);

  function startLevelFor(employee, competencyId, archetype) {
    const rp = roleProfileMap[`${employee.role_id}::${competencyId}`];
    const target = rp ? rp.target_level : 2.5;
    if (RISING.has(archetype)) return rng.clip(1.2 + rng.normal(0, 0.3), 0.8, 1.8);
    if (archetype === "late_bloomer") return rng.clip(1.3 + rng.normal(0, 0.3), 0.8, 1.9);
    if (DECLINING.has(archetype)) return rng.clip(4.0 + rng.normal(0, 0.3), 3.5, 4.6);
    return rng.clip(target - 0.8 + rng.normal(0, 0.4), 1.5, 4.0);
  }

  function assignPair(employee, competencyId, archetype, extra = {}) {
    const startLevel = startLevelFor(employee, competencyId, archetype);
    const { theta, betaList } = simulateTrueSeries(rng, archetype, startLevel);
    plans[`${employee.employee_id}::${competencyId}`] = {
      employee_id: employee.employee_id,
      competency_id: competencyId,
      archetype,
      theta,
      betaList,
      dropoutFromQuarter: extra.dropoutFromQuarter ?? null,
      sparseCap: extra.sparseCap ?? null,
      conflictQuarter: extra.conflictQuarter ?? null,
      expected_verdict: expectedVerdict(archetype, betaList),
    };
  }

  // 1. default random assignment for everyone
  //
  // sparse_true / unobserved_true / stale_true only produce their defining
  // property (insufficient evidence) if the EVIDENCE, not just the true
  // trajectory, is constrained to match — sparseCap/dropoutFromQuarter is
  // what does that. Randomized within each archetype's range for variety
  // rather than a single fixed value (previously only ever 2 or 5, from the
  // two showcase employees).
  for (const employee of employees) {
    const comps = competenciesForDepartment(employee.department);
    for (const cid of comps) {
      const archetype = rng.weightedChoice(RANDOM_POOL, RANDOM_POOL_WEIGHTS);
      const extra = {};
      // sparseCap's VALUE isn't read below (the sparse path always emits
      // exactly 2 fixed events, one early/one late) — it's used only as a
      // truthy flag to route into that path, so it's set to the same
      // constant the showcase employee uses rather than a misleading random
      // number that would never actually be honored.
      if (archetype === "sparse_true") extra.sparseCap = 2;
      if (archetype === "unobserved_true") extra.dropoutFromQuarter = rng.integers(4, 7); // cuts off partway through
      if (archetype === "stale_true") extra.dropoutFromQuarter = rng.integers(2, 4); // stops early -> 14-17mo stale by dataset end
      assignPair(employee, cid, archetype, extra);
    }
  }

  // 2. mixed-profile showcase employee — one of each archetype family
  {
    const e = employees[showcase.mixedProfile];
    const [comm, execution, collab, problem, dept1, dept2] = competenciesForDepartment(e.department);
    assignPair(e, comm, "steady_improver");
    assignPair(e, execution, "decliner");
    assignPair(e, collab, "true_stagnator");
    assignPair(e, problem, "noisy_flat");
    assignPair(e, dept1, "late_bloomer");
    assignPair(e, dept2, "sparse_true", { sparseCap: 2 });

    orgEvents.push({
      event_id: nextId("ORG"), employee_id: e.employee_id, event_type: "team_change",
      occurred_at: QUARTERS[3].start, from_value: e.team_id, to_value: `${e.team_id}-NEW`,
      note: "Reassigned to a new team mid-year.",
    });

    addShowcase({
      key: "divergent_profile",
      capability: "Divergence detection",
      headline: "One skill up, another down",
      blurb: "Communication is climbing while execution slips — during the same quarters, around a team change. The system flags the trade-off and points at the org event without claiming it caused anything.",
      employee_id: e.employee_id,
      competency_id: execution,
      archetype: "mixed_profile",
    });
    addShowcase({
      key: "late_bloomer",
      capability: "Regime detection",
      headline: "Flat for a year, then climbing",
      blurb: "Averaged over the full history this looks like noise. The system finds the point the trend changed and reports the CURRENT regime instead of a diluted whole-series average.",
      employee_id: e.employee_id,
      competency_id: dept1,
      archetype: "late_bloomer",
    });
    addShowcase({
      key: "time_travel",
      capability: "Time travel",
      headline: "What we said 18 months ago",
      blurb: "Replay the same pipeline against only the evidence that existed at an earlier date. Same model, same code — the verdict itself has genuinely moved as evidence accrued, which is the whole point of \"continuous\" over \"snapshot\".",
      employee_id: e.employee_id,
      competency_id: comm,
      archetype: "steady_improver",
    });
  }

  // 3. role-switcher — leadership up, technical down
  {
    const e = employees[showcase.roleSwitcher];
    const [comm, execution, collab, problem, dept1, dept2] = competenciesForDepartment(e.department);
    assignPair(e, collab, "role_switch_up");
    assignPair(e, dept1, "role_switch_down");
    // comm, execution, problem, dept2 keep their random-pool assignment from step 1

    orgEvents.push({
      event_id: nextId("ORG"), employee_id: e.employee_id, event_type: "role_change",
      occurred_at: QUARTERS[4].start, from_value: e.role_title, to_value: `${e.level} ${e.department} (People Lead track)`,
      note: "Moved toward a people-leadership track.",
    });
  }

  // 4. biased rater — manager swap mid-series, true skill flat
  {
    const e = employees[showcase.biasedRater];
    const [comm, execution] = competenciesForDepartment(e.department);
    assignPair(e, execution, "biased_rater_true");

    const mNew = e.manager_id;
    const pool = (deptManagerPool[e.department] || []).filter((id) => id !== mNew);
    const mOld = pool.length ? rng.choice(pool) : mNew;

    managerLeniencyOverrides[mOld] = 0.8;
    managerLeniencyOverrides[mNew] = -0.6;

    const arr = new Array(N_QUARTERS).fill(mNew);
    for (let q = 0; q < 4; q++) arr[q] = mOld;
    managerByQuarterOverride[e.employee_id] = arr;

    orgEvents.push({
      event_id: nextId("ORG"), employee_id: e.employee_id, event_type: "manager_change",
      occurred_at: QUARTERS[4].start, from_value: mOld, to_value: mNew,
      note: "New manager assigned.",
    });

    addShowcase({
      key: "biased_rater",
      capability: "Rater calibration",
      headline: "The manager changed, not the person",
      blurb: "True skill was flat the whole time, but the rating series looks like a jump — because a lenient rater was swapped for a stricter one partway through. Per-rater calibration is what keeps that from reading as a real change.",
      employee_id: e.employee_id,
      competency_id: execution,
      archetype: "biased_rater_true",
    });
  }

  // 5. halo rater — one manager flattens all competency ratings for this employee
  {
    const e = employees[showcase.halo];
    const [comm, execution, collab, problem, dept1] = competenciesForDepartment(e.department);
    assignPair(e, comm, "steady_improver");
    assignPair(e, dept1, "decliner");
    if (e.manager_id) haloManagers.add(e.manager_id);
  }

  // 6. unobserved competency — evidence stops partway through
  {
    const e = employees[showcase.unobserved];
    const comps = competenciesForDepartment(e.department);
    const cid = comps[3]; // problem_solving
    assignPair(e, cid, "unobserved_true", { dropoutFromQuarter: 5 });

    addShowcase({
      key: "unobserved",
      capability: "Sufficiency gate + counterfactual",
      headline: "We don't know — and here's why",
      blurb: "Evidence stopped partway through the year. Rather than guess, the system abstains and states exactly what evidence would resolve it — a sized, concrete ask instead of a dead end.",
      employee_id: e.employee_id,
      competency_id: cid,
      archetype: "unobserved_true",
    });
  }

  // 7. sparse competency — only 2 data points ever
  {
    const e = employees[showcase.sparse];
    const comps = competenciesForDepartment(e.department);
    const cid = comps[2]; // collaboration
    assignPair(e, cid, "sparse_true", { sparseCap: 2 });

    addShowcase({
      key: "sparse_evidence",
      capability: "Evidence Sufficiency Score",
      headline: "Two data points, honestly labeled",
      blurb: "Only two observations exist for this competency, ever. The sufficiency gate catches it and abstains rather than producing a confident-looking number off almost nothing.",
      employee_id: e.employee_id,
      competency_id: cid,
      archetype: "sparse_true",
    });
  }

  // 8. cross-sectional disagreement — one quarter of high inter-rater dispersion
  for (const idx of showcase.crossSectional) {
    const e = employees[idx];
    const comps = competenciesForDepartment(e.department);
    const cid = rng.choice(comps);
    const key = `${e.employee_id}::${cid}`;
    plans[key].conflictQuarter = rng.integers(2, 7);
  }

  // 9. attrition — employee exits mid-dataset
  for (const idx of showcase.attrition) {
    const e = employees[idx];
    const depQuarter = rng.integers(3, 7);
    e.status = "departed";
    e.departure_quarter = depQuarter;
    const comps = competenciesForDepartment(e.department);
    for (const cid of comps) {
      const key = `${e.employee_id}::${cid}`;
      plans[key].dropoutFromQuarter = Math.min(
        plans[key].dropoutFromQuarter ?? N_QUARTERS,
        depQuarter + 1
      );
    }
    orgEvents.push({
      event_id: nextId("ORG"), employee_id: e.employee_id, event_type: "exit",
      occurred_at: QUARTERS[depQuarter].start, from_value: "active", to_value: "departed",
      note: "Employee left the company.",
    });
  }

  // 10. background noise org events, unrelated to any archetype
  const usedIdx = new Set([
    showcase.mixedProfile, showcase.roleSwitcher, showcase.biasedRater,
    showcase.halo, showcase.unobserved, showcase.sparse,
    ...showcase.crossSectional, ...showcase.attrition,
  ]);
  const bgPool = employees.map((_, i) => i).filter((i) => !usedIdx.has(i));
  const bgSample = rng.sample(bgPool, 18);
  for (const idx of bgSample) {
    const e = employees[idx];
    const type = rng.choice(["team_change", "promotion", "leave"]);
    const q = rng.integers(1, 8);
    orgEvents.push({
      event_id: nextId("ORG"), employee_id: e.employee_id, event_type: type,
      occurred_at: QUARTERS[q].start, from_value: null, to_value: null,
      note: `Background ${type.replace("_", " ")} event.`,
    });
  }

  return { plans, orgEvents, managerLeniencyOverrides, haloManagers, managerByQuarterOverride, showcases };
}

// ---------------------------------------------------------------------------
// Evidence generation
// ---------------------------------------------------------------------------

function makeEvidenceEvent(rng, {
  employeeId, competencyId, occurredAt, sourceType, sourceRefId,
  raterId = null, observedLevel, rawValue = null, rawText = null,
  quoteStart = null, quoteEnd = null, sourceReliability, specificity = 0.6,
  difficultyContext = 1.0, independence = 1.0, extractionConfidence = 1.0,
  attribution = "individual",
}) {
  const recordedLagDays = rng.random() < 0.9 ? rng.integers(0, 10) : rng.integers(30, 90);
  return {
    event_id: nextId("EV"),
    employee_id: employeeId,
    competency_id: competencyId,
    occurred_at: occurredAt,
    recorded_at: addDays(occurredAt, recordedLagDays),
    source_type: sourceType,
    source_ref_id: sourceRefId,
    rater_id: raterId,
    observed_level: Math.round(rng.clip(observedLevel, 0, 5) * 100) / 100,
    raw_value: rawValue,
    raw_text: rawText,
    quote_start: quoteStart,
    quote_end: quoteEnd,
    source_reliability: sourceReliability,
    rater_credibility: null, // filled in by the Phase 3 calibration step
    specificity: Math.round(specificity * 100) / 100,
    difficulty_context: Math.round(difficultyContext * 100) / 100,
    independence,
    extraction_confidence: Math.round(extractionConfidence * 100) / 100,
    attribution,
    dedupe_key: `${sourceType}:${sourceRefId}:${competencyId}`,
    is_superseded: false,
  };
}

function generateForEmployee(rng, employee, plans, orgWiring, out) {
  const comps = competenciesForDepartment(employee.department);
  const { managerLeniencyOverrides, haloManagers, managerByQuarterOverride } = orgWiring;
  const managerSchedule = managerByQuarterOverride[employee.employee_id]
    || new Array(N_QUARTERS).fill(employee.manager_id);

  const kpiComps = new Set(KPI_MAPPED[employee.department] || []);

  // --- sparse pairs: exactly 2 evidence events total, skip normal loop ---
  const sparsePairs = comps.filter((c) => plans[`${employee.employee_id}::${c}`].sparseCap);
  for (const cid of sparsePairs) {
    const plan = plans[`${employee.employee_id}::${cid}`];
    const anchor = { q: 1 };
    const q1 = QUARTERS[1];
    const trueLevel1 = plan.theta[1];
    const selfId = nextId("SELF");
    const occurred1 = randomTimestampInQuarter(rng, q1);
    out.self_assessment.push({
      self_id: selfId, employee_id: employee.employee_id, cycle_idx: 1, occurred_at: occurred1,
      levels: [{ competency_id: cid, self_level: Math.round(rng.clip(trueLevel1 + rng.normal(0, 0.4), 1, 5)), self_confidence: rng.integers(2, 5) }],
    });
    out.evidence_events.push(makeEvidenceEvent(rng, {
      employeeId: employee.employee_id, competencyId: cid, occurredAt: occurred1,
      sourceType: "self_assessment", sourceRefId: selfId,
      observedLevel: Math.round(rng.clip(trueLevel1 + rng.normal(0, 0.4), 1, 5)),
      sourceReliability: 0.25, specificity: specificityFor(rng, "self_assessment"),
    }));

    const q6 = QUARTERS[6];
    const trueLevel6 = plan.theta[6];
    const peer = randomPeer(rng, employee, out._employeesByTeam);
    if (peer) {
      const { rawText, exploded } = buildSessionText(rng, "peer_feedback", [
        { competency_id: cid, anchor_text: out._anchorText(cid, trueLevel6), trend: "flat" },
      ]);
      const occurred6 = randomTimestampInQuarter(rng, q6);
      const fid = nextId("PF");
      const rating = Math.round(rng.clip(trueLevel6 + rng.normal(0, 0.4), 1, 5));
      out.peer_feedback.push({
        feedback_id: fid, employee_id: employee.employee_id, rater_id: peer.employee_id,
        relationship: "peer", cycle_idx: 6, occurred_at: occurred6, raw_text: rawText,
        ratings: [{ competency_id: cid, rating_1_5: rating }], anonymity_group_size: 3,
      });
      out.evidence_events.push(makeEvidenceEvent(rng, {
        employeeId: employee.employee_id, competencyId: cid, occurredAt: occurred6,
        sourceType: "peer_feedback", sourceRefId: fid, raterId: peer.employee_id,
        observedLevel: rating, rawText, quoteStart: exploded[0].quote_start, quoteEnd: exploded[0].quote_end,
        sourceReliability: 0.50, specificity: specificityFor(rng, "peer_feedback"),
      }));
    }
  }

  const normalComps = comps.filter((c) => !plans[`${employee.employee_id}::${c}`].sparseCap);

  for (let q = 0; q < N_QUARTERS; q++) {
    if (employee.status === "departed" && employee.departure_quarter != null && q > employee.departure_quarter) break;

    const available = normalComps.filter((c) => {
      const p = plans[`${employee.employee_id}::${c}`];
      return p.dropoutFromQuarter == null || q < p.dropoutFromQuarter;
    });
    if (available.length === 0) continue;

    const quarter = QUARTERS[q];
    const trueLevelOf = (c) => plans[`${employee.employee_id}::${c}`].theta[q];
    const conflictFlagOf = (c) => plans[`${employee.employee_id}::${c}`].conflictQuarter === q;

    // 1. Assessments — semi-annual
    if ([1, 3, 5, 7].includes(q)) {
      for (const cid of available) {
        if (rng.random() >= 0.85) continue;
        const trueLevel = trueLevelOf(cid);
        const pct = rng.clip(trueLevel / 5 + rng.normal(0, 0.08), 0, 1);
        const occurred = randomTimestampInQuarter(rng, quarter);
        const aid = nextId("ASM");
        out.assessments.push({
          assessment_id: aid, employee_id: employee.employee_id, competency_id: cid,
          instrument_id: `INST-${cid}`, instrument_version: q >= 5 ? "v2" : "v1",
          raw_score: Math.round(pct * 100), max_score: 100, taken_at: occurred,
          proctored: rng.random() < 0.7, duration_minutes: rng.integers(20, 90),
        });
        out.evidence_events.push(makeEvidenceEvent(rng, {
          employeeId: employee.employee_id, competencyId: cid, occurredAt: occurred,
          sourceType: "assessment", sourceRefId: aid, observedLevel: pct * 5,
          rawValue: { raw_score: Math.round(pct * 100), max_score: 100 },
          sourceReliability: 0.90, specificity: 1.0, extractionConfidence: 1.0,
        }));
      }
    }

    // 2. KPIs
    for (const cid of available) {
      if (!kpiComps.has(cid)) continue;
      if (rng.random() >= 0.8) continue;
      const trueLevel = trueLevelOf(cid);
      const observed = rng.clip(trueLevel + rng.normal(0, 0.3), 0, 5);
      const target = 100;
      const value = Math.round(target * (0.5 + (observed / 5) * 0.7) * 10) / 10;
      const kid = nextId("KPI");
      out.kpis.push({
        kpi_id: kid, employee_id: employee.employee_id, competency_id: cid,
        period_start: quarter.start, period_end: quarter.end, kpi_name: `${cid}_output_score`,
        value, target, unit: "index", higher_is_better: true,
      });
      out.evidence_events.push(makeEvidenceEvent(rng, {
        employeeId: employee.employee_id, competencyId: cid, occurredAt: quarter.end,
        sourceType: "kpi", sourceRefId: kid, observedLevel: observed,
        rawValue: { value, target }, sourceReliability: 0.60, specificity: 1.0,
      }));
    }

    // 3. Self-assessment session
    if (rng.random() < 0.55) {
      const occurred = randomTimestampInQuarter(rng, quarter);
      const sid = nextId("SELF");
      const levels = available.map((cid) => {
        const trueLevel = trueLevelOf(cid);
        const selfLevel = Math.round(rng.clip(trueLevel + rng.normal(0.15, 0.45), 1, 5));
        return { competency_id: cid, self_level: selfLevel, self_confidence: rng.integers(2, 6) };
      });
      out.self_assessment.push({ self_id: sid, employee_id: employee.employee_id, cycle_idx: q, occurred_at: occurred, levels });
      for (const lv of levels) {
        out.evidence_events.push(makeEvidenceEvent(rng, {
          employeeId: employee.employee_id, competencyId: lv.competency_id, occurredAt: occurred,
          sourceType: "self_assessment", sourceRefId: sid, observedLevel: lv.self_level,
          rawValue: { self_level: lv.self_level }, sourceReliability: 0.25,
          specificity: specificityFor(rng, "self_assessment"),
        }));
      }
    }

    // 4. Manager feedback session
    const manager = managerSchedule[q];
    if (manager && rng.random() < 0.75) {
      const subset = rng.sample(available, Math.min(3, available.length));
      const entries = subset.map((cid) => {
        const plan = plans[`${employee.employee_id}::${cid}`];
        const trueLevel = trueLevelOf(cid);
        const prevLevel = q > 0 ? plan.theta[q - 1] : trueLevel;
        const trend = trueLevel - prevLevel > 0.08 ? "up" : trueLevel - prevLevel < -0.08 ? "down" : "flat";
        return { competency_id: cid, anchor_text: out._anchorText(cid, trueLevel), trend, trueLevel };
      });
      const { rawText, exploded } = buildSessionText(rng, "manager_feedback", entries);
      const occurred = randomTimestampInQuarter(rng, quarter);
      const fid = nextId("MF");

      const isHalo = haloManagers.has(manager) && entries.length >= 2;
      const overallImpression = entries.reduce((s, e) => s + e.trueLevel, 0) / entries.length;
      const leniency = managerLeniencyOverrides[manager] || 0;

      const ratings = entries.map((entry, i) => {
        const conflict = conflictFlagOf(entry.competency_id);
        const base = isHalo ? overallImpression : entry.trueLevel;
        const noiseSd = conflict ? 0.9 : 0.3;
        const rating = Math.round(rng.clip(base + leniency + rng.normal(0, noiseSd), 1, 5));
        return { competency_id: entry.competency_id, rating_1_5: rating, quote_start: exploded[i].quote_start, quote_end: exploded[i].quote_end };
      });

      out.manager_feedback.push({
        feedback_id: fid, employee_id: employee.employee_id, rater_id: manager,
        cycle_idx: q, occurred_at: occurred, review_type: "cycle", raw_text: rawText, ratings,
      });
      for (const r of ratings) {
        out.evidence_events.push(makeEvidenceEvent(rng, {
          employeeId: employee.employee_id, competencyId: r.competency_id, occurredAt: occurred,
          sourceType: "manager_feedback", sourceRefId: fid, raterId: manager,
          observedLevel: r.rating_1_5, rawText, quoteStart: r.quote_start, quoteEnd: r.quote_end,
          sourceReliability: 0.65, specificity: specificityFor(rng, "manager_feedback"),
          independence: isHalo ? 0.5 : 1.0,
        }));
      }
    }

    // 5. Peer feedback sessions (0-2 per quarter)
    const nPeerSessions = rng.integers(0, 3);
    for (let s = 0; s < nPeerSessions; s++) {
      const peer = randomPeer(rng, employee, out._employeesByTeam);
      if (!peer) continue;
      const subset = rng.sample(available, Math.min(2, available.length));
      if (subset.length === 0) continue;
      const entries = subset.map((cid) => {
        const trueLevel = trueLevelOf(cid);
        const plan = plans[`${employee.employee_id}::${cid}`];
        const prevLevel = q > 0 ? plan.theta[q - 1] : trueLevel;
        const trend = trueLevel - prevLevel > 0.08 ? "up" : trueLevel - prevLevel < -0.08 ? "down" : "flat";
        return { competency_id: cid, anchor_text: out._anchorText(cid, trueLevel), trend, trueLevel };
      });
      const { rawText, exploded } = buildSessionText(rng, "peer_feedback", entries);
      const occurred = randomTimestampInQuarter(rng, quarter);
      const fid = nextId("PF");
      const ratings = entries.map((entry, i) => {
        const conflict = conflictFlagOf(entry.competency_id);
        const noiseSd = conflict ? 0.9 : 0.35;
        const rating = Math.round(rng.clip(entry.trueLevel + rng.normal(0, noiseSd), 1, 5));
        return { competency_id: entry.competency_id, rating_1_5: rating, quote_start: exploded[i].quote_start, quote_end: exploded[i].quote_end };
      });
      out.peer_feedback.push({
        feedback_id: fid, employee_id: employee.employee_id, rater_id: peer.employee_id,
        relationship: "peer", cycle_idx: q, occurred_at: occurred, raw_text: rawText,
        ratings, anonymity_group_size: rng.integers(3, 6),
      });
      for (const r of ratings) {
        out.evidence_events.push(makeEvidenceEvent(rng, {
          employeeId: employee.employee_id, competencyId: r.competency_id, occurredAt: occurred,
          sourceType: "peer_feedback", sourceRefId: fid, raterId: peer.employee_id,
          observedLevel: r.rating_1_5, rawText, quoteStart: r.quote_start, quoteEnd: r.quote_end,
          sourceReliability: 0.50, specificity: specificityFor(rng, "peer_feedback"),
        }));
      }
    }
  }

  // --- Training (independent of quarterly loop) ---
  const nTraining = rng.integers(0, 3);
  for (let t = 0; t < nTraining; t++) {
    const tags = rng.sample(normalComps, Math.min(rng.integers(1, 3), normalComps.length));
    if (tags.length === 0) continue;
    const q = rng.integers(0, 7);
    const quarter = QUARTERS[q];
    const started = randomTimestampInQuarter(rng, quarter);
    const completed = addDays(started, rng.integers(20, 60));
    const primaryTrue = plans[`${employee.employee_id}::${tags[0]}`].theta[q];
    const finalScore = rng.clip(50 + primaryTrue * 10 + rng.normal(0, 8), 0, 100);
    const eid = nextId("TR");
    out.training.push({
      enrollment_id: eid, employee_id: employee.employee_id, course_id: `CRS-${tags[0]}`,
      course_name: `${tags[0].replace(/_/g, " ")} fundamentals`, competency_tags: tags,
      started_at: started, completed_at: completed,
      completion_pct: rng.random() < 0.8 ? 100 : rng.integers(30, 90),
      final_score: Math.round(finalScore), passed: finalScore >= 60,
      hours_spent: rng.integers(4, 30), modality: rng.choice(["self_paced", "cohort", "workshop"]),
    });
    for (const cid of tags) {
      out.evidence_events.push(makeEvidenceEvent(rng, {
        employeeId: employee.employee_id, competencyId: cid, occurredAt: completed,
        sourceType: "training", sourceRefId: eid, observedLevel: (finalScore / 100) * 5,
        rawValue: { final_score: Math.round(finalScore) }, sourceReliability: 0.35, specificity: 0.5,
      }));
    }
  }

  // --- Projects ---
  const nProjects = rng.integers(2, 5);
  for (let p = 0; p < nProjects; p++) {
    const tags = rng.sample(normalComps, Math.min(rng.integers(1, 4), normalComps.length));
    if (tags.length === 0) continue;
    const q = rng.integers(0, 8);
    const quarter = QUARTERS[q];
    const started = randomTimestampInQuarter(rng, quarter);
    const ended = addDays(started, rng.integers(30, 70));
    const complexity = rng.integers(1, 6);
    const attribution = rng.weightedChoice(["individual", "shared", "team"], [0.4, 0.4, 0.2]);
    const avgTrue = tags.reduce((s, c) => s + plans[`${employee.employee_id}::${c}`].theta[q], 0) / tags.length;
    const outcomeQuality = rng.clip(avgTrue + rng.normal(0, 0.4), 1, 5);
    const pid = nextId("PRJ");
    out.projects.push({
      project_id: pid, employee_id: employee.employee_id, project_name: `Project ${pid}`,
      role_on_project: rng.choice(["owner", "contributor", "lead"]),
      competencies_exercised: tags, started_at: started, ended_at: ended,
      complexity_score: complexity, autonomy_level: rng.integers(1, 6),
      outcome_quality: Math.round(outcomeQuality * 100) / 100,
      on_time: rng.random() < 0.75, defect_count: rng.integers(0, 5),
      was_stretch: complexity >= 4, team_size: rng.integers(2, 9), attribution,
    });
    const difficultyContext = 0.7 + 0.3 * complexity;
    const attributionFactor = { individual: 1.0, shared: 0.6, team: 0.3 }[attribution];
    for (const cid of tags) {
      const trueLevel = plans[`${employee.employee_id}::${cid}`].theta[q];
      const observed = rng.clip(trueLevel + rng.normal(0, 0.35), 0, 5);
      out.evidence_events.push(makeEvidenceEvent(rng, {
        employeeId: employee.employee_id, competencyId: cid, occurredAt: ended,
        sourceType: "project", sourceRefId: pid, observedLevel: observed,
        rawValue: { outcome_quality: Math.round(outcomeQuality * 100) / 100, complexity }, sourceReliability: 0.75,
        specificity: rng.clip(rng.normal(0.65, 0.1), 0.3, 0.95),
        difficultyContext, attribution, independence: 1.0,
      }));
      // attribution factor is folded in by the Phase 3 weighting step, not baked in here
      out.evidence_events[out.evidence_events.length - 1].attribution_factor = attributionFactor;
    }
  }

  // --- Certifications (rare) ---
  if (rng.random() < 0.10) {
    const cid = rng.choice(normalComps);
    const q = rng.integers(1, 8);
    const issued = randomTimestampInQuarter(rng, QUARTERS[q]);
    const credId = nextId("CERT");
    out.certifications.push({
      credential_id: credId, employee_id: employee.employee_id, competency_tags: [cid],
      name: `${cid.replace(/_/g, " ")} Certification`, issued_at: issued,
      issuer_tier: rng.choice(["industry", "internal", "vendor"]),
    });
    out.evidence_events.push(makeEvidenceEvent(rng, {
      employeeId: employee.employee_id, competencyId: cid, occurredAt: issued,
      sourceType: "certification", sourceRefId: credId, observedLevel: rng.uniform(3.5, 4.5),
      sourceReliability: 0.85, specificity: 1.0,
    }));
  }
}

function randomPeer(rng, employee, employeesByTeam) {
  const teammates = (employeesByTeam[employee.team_id] || []).filter((e) => e.employee_id !== employee.employee_id);
  if (teammates.length === 0) return null;
  return rng.choice(teammates);
}

// ---------------------------------------------------------------------------
// Disputes (small demo set)
// ---------------------------------------------------------------------------

function generateDisputes(rng, out) {
  const managerEvents = out.evidence_events.filter((e) => e.source_type === "manager_feedback");
  // widen the sample so the seeded set includes a couple of genuinely open
  // (unresolved) disputes for the demo UI, not just resolved ones
  const sample = rng.sample(managerEvents, Math.min(6, managerEvents.length));
  for (const ev of sample) {
    const isResolved = rng.random() < 0.6; // one boolean drives all three fields — they must agree
    out.disputes.push({
      dispute_id: nextId("DSP"),
      evidence_event_id: ev.event_id,
      employee_id: ev.employee_id,
      raised_at: addDays(ev.occurred_at, rng.integers(3, 20)),
      reason: "Employee felt this rating did not reflect the full context of the work.",
      resolution: isResolved ? "upheld_with_context_added" : "open",
      resolved_by: isResolved ? "hr_admin" : null,
      resolved_at: isResolved ? addDays(ev.occurred_at, rng.integers(21, 35)) : null,
    });
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function generateAll() {
  const rng = new Rng(SEED);

  const competencies = buildCompetencies();
  const roles = buildRoles();
  const roleProfiles = buildRoleProfiles(roles);
  const actionCatalog = buildActionCatalog(rng);

  const anchorLookup = {};
  for (const c of competencies) anchorLookup[c.competency_id] = c.anchors;

  const employees = generateEmployees(rng, 500);
  const deptManagerPool = assignManagers(rng, employees);

  const employeesByTeam = {};
  for (const e of employees) (employeesByTeam[e.team_id] ??= []).push(e);

  const { plans, orgEvents, managerLeniencyOverrides, haloManagers, managerByQuarterOverride, showcases } =
    buildTrajectoryPlans(rng, employees, roleProfiles, deptManagerPool);

  const out = {
    employees, competencies, role_profiles: roleProfiles, org_events: orgEvents,
    action_catalog: actionCatalog,
    assessments: [], training: [], projects: [], manager_feedback: [], peer_feedback: [],
    self_assessment: [], kpis: [], certifications: [], evidence_events: [], disputes: [],
    _employeesByTeam: employeesByTeam,
    _anchorText: (cid, level) => {
      const bucket = Math.min(5, Math.max(1, Math.round(level)));
      return anchorLookup[cid][String(bucket)];
    },
  };

  for (const employee of employees) {
    generateForEmployee(rng, employee, plans, { managerLeniencyOverrides, haloManagers, managerByQuarterOverride }, out);
  }

  generateDisputes(rng, out);

  // ground truth for later eval (not a Mongo collection — written as a side JSON file)
  const groundTruth = Object.values(plans).map((p) => ({
    employee_id: p.employee_id, competency_id: p.competency_id, archetype: p.archetype,
    true_level_by_quarter: p.theta, true_velocity_by_quarter: p.betaList,
    expected_verdict: p.expected_verdict,
  }));

  // enrich showcases with names, resolved here (not by the client) so the
  // manifest is self-contained and doesn't need a join against /employees
  // just to render a card
  const employeesById = new Map(employees.map((e) => [e.employee_id, e]));
  const competencyNameById = new Map(competencies.map((c) => [c.competency_id, c.name]));
  const enrichedShowcases = showcases.map((s) => ({
    ...s,
    employee_name: employeesById.get(s.employee_id)?.name ?? s.employee_id,
    competency_name: competencyNameById.get(s.competency_id) ?? s.competency_id,
  }));

  delete out._employeesByTeam;
  delete out._anchorText;

  return { collections: out, groundTruth, showcases: enrichedShowcases };
}
