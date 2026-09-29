/**
 * Static reference data: departments, competencies (with L1-L5 behavioral
 * anchors), roles, role_profiles, and the development-action catalog.
 * JS port of the original Python reference_data.py.
 */

export const DEPARTMENTS = [
  "Engineering", "Sales", "Marketing", "Product",
  "Design", "Finance", "HR", "Support",
];

export const LEVELS = ["Associate", "Mid", "Senior", "Lead"];

export const SHARED_COMPETENCIES = {
  communication: {
    name: "Communication",
    anchors: {
      1: "Struggles to explain work to non-technical stakeholders.",
      2: "Communicates status clearly to immediate team; needs help framing for stakeholders.",
      3: "Independently manages stakeholder expectations; translates tradeoffs into plain terms.",
      4: "Proactively aligns multiple stakeholders before conflicts arise; trusted to represent the team externally.",
      5: "Shapes stakeholder strategy org-wide; sought out for the most sensitive conversations.",
    },
  },
  execution: {
    name: "Execution & Delivery",
    anchors: {
      1: "Frequently misses estimates; needs close tracking.",
      2: "Delivers scoped work reliably; estimates are usually close.",
      3: "Delivers ambiguous, loosely-scoped work; manages own scope tradeoffs.",
      4: "Delivers complex cross-team initiatives predictably; unblocks others proactively.",
      5: "Delivery track record is the benchmark used for org-wide planning.",
    },
  },
  collaboration: {
    name: "Collaboration",
    anchors: {
      1: "Works well only within immediate task boundaries; rarely coordinates with others.",
      2: "Coordinates reliably with immediate teammates on shared work.",
      3: "Proactively coordinates across functions; resolves cross-team friction without escalation.",
      4: "Builds structures (rituals, docs, shared tools) that make collaboration easier for the whole team.",
      5: "Sets collaboration norms adopted org-wide; sought out to unblock cross-org friction.",
    },
  },
  problem_solving: {
    name: "Problem Solving",
    anchors: {
      1: "Solves problems only with heavy guidance; struggles with ambiguity.",
      2: "Solves well-defined problems independently.",
      3: "Diagnoses root causes in ambiguous, multi-system problems.",
      4: "Solves problems others have given up on; approach becomes the team playbook.",
      5: "Sought out org-wide for the hardest unsolved problems.",
    },
  },
};

export const DEPARTMENT_COMPETENCIES = {
  Engineering: {
    system_design: {
      name: "System Design",
      anchors: {
        1: "Implements a design handed to them; rarely raises non-functional concerns.",
        2: "Designs a single service or module; accounts for load and failure in the common path.",
        3: "Designs multi-service flows; makes explicit tradeoffs between consistency, latency, and cost.",
        4: "Designs across team boundaries; anticipates second-order failure modes; peers adopt their patterns.",
        5: "Sets architectural direction referenced org-wide; designs become the reference standard.",
      },
    },
    code_quality: {
      name: "Code Quality",
      anchors: {
        1: "Code works but needs significant rework in review; limited test coverage.",
        2: "Code is clean and mostly self-explanatory; covers the common paths with tests.",
        3: "Code anticipates edge cases; reviews from others require few structural changes.",
        4: "Sets the quality bar for the team; review comments focus on architecture, not correctness.",
        5: "Code and review practices are studied and copied by other teams.",
      },
    },
  },
  Sales: {
    negotiation: {
      name: "Negotiation",
      anchors: {
        1: "Follows a script; struggles when the buyer pushes back.",
        2: "Handles standard objections; closes straightforward deals.",
        3: "Structures win-win terms on multi-stakeholder deals.",
        4: "Navigates complex, high-stakes negotiations others have stalled on.",
        5: "Negotiation approach is taught to the rest of the org.",
      },
    },
    pipeline_mgmt: {
      name: "Pipeline Management",
      anchors: {
        1: "Pipeline data is inconsistent; forecasts are frequently wrong.",
        2: "Maintains an accurate pipeline for their own book of business.",
        3: "Forecasts reliably even with an uneven deal mix.",
        4: "Pipeline discipline is used as the team's forecasting reference.",
        5: "Builds the forecasting methodology other teams adopt.",
      },
    },
  },
  Marketing: {
    campaign_strategy: {
      name: "Campaign Strategy",
      anchors: {
        1: "Executes campaigns designed by others with little independent judgment.",
        2: "Plans and runs a single-channel campaign end to end.",
        3: "Designs multi-channel campaigns tied to clear business outcomes.",
        4: "Campaign strategy shapes quarterly go-to-market planning.",
        5: "Sets brand/campaign strategy referenced across the org.",
      },
    },
    content_quality: {
      name: "Content Quality",
      anchors: {
        1: "Content needs heavy rework before it can ship.",
        2: "Produces clean, on-brief content independently.",
        3: "Content consistently drives measurable engagement above baseline.",
        4: "Sets the quality bar and voice other writers are trained against.",
        5: "Content is cited externally as best-in-class for the category.",
      },
    },
  },
  Product: {
    roadmap_prioritization: {
      name: "Roadmap Prioritization",
      anchors: {
        1: "Prioritizes by whoever asked most recently.",
        2: "Prioritizes a single product area using basic impact/effort reasoning.",
        3: "Prioritizes across competing stakeholder demands with clear tradeoff logic.",
        4: "Roadmap decisions anticipate second-order effects across products.",
        5: "Prioritization framework is adopted company-wide.",
      },
    },
    stakeholder_alignment: {
      name: "Stakeholder Alignment",
      anchors: {
        1: "Stakeholders are frequently surprised by decisions.",
        2: "Keeps immediate stakeholders informed and aligned.",
        3: "Pre-aligns competing stakeholders before decisions are finalized.",
        4: "Resolves org-level stakeholder conflict others could not.",
        5: "Trusted to align stakeholders on the company's most contentious bets.",
      },
    },
  },
  Design: {
    visual_craft: {
      name: "Visual Craft",
      anchors: {
        1: "Output needs significant rework to meet the bar.",
        2: "Produces clean, on-brand visual work independently.",
        3: "Visual craft elevates the perceived quality of the whole product.",
        4: "Sets the visual standard other designers are trained against.",
        5: "Work is recognized externally as category-defining.",
      },
    },
    ux_research: {
      name: "UX Research",
      anchors: {
        1: "Runs research sessions only with heavy guidance.",
        2: "Independently runs standard usability studies.",
        3: "Research findings directly change product decisions.",
        4: "Builds research methods/practices the whole team adopts.",
        5: "Research program is referenced as a model outside the company.",
      },
    },
  },
  Finance: {
    financial_modeling: {
      name: "Financial Modeling",
      anchors: {
        1: "Models contain frequent errors; needs heavy review.",
        2: "Builds standard models independently and accurately.",
        3: "Builds models that hold up under stakeholder scrutiny and scenario stress-testing.",
        4: "Models used directly in board-level or executive decisions.",
        5: "Modeling approach is the standard referenced across the finance org.",
      },
    },
    compliance_rigor: {
      name: "Compliance Rigor",
      anchors: {
        1: "Misses compliance steps without close oversight.",
        2: "Reliably follows compliance procedures on standard cases.",
        3: "Identifies and closes compliance gaps proactively.",
        4: "Designs controls that prevent whole classes of compliance failure.",
        5: "Sets compliance policy referenced org-wide.",
      },
    },
  },
  HR: {
    talent_assessment: {
      name: "Talent Assessment",
      anchors: {
        1: "Assessments are inconsistent and hard to justify.",
        2: "Produces fair, defensible assessments on standard cases.",
        3: "Assessments hold up under challenge; calibrates well against peers.",
        4: "Assessment approach is used to calibrate other assessors.",
        5: "Sets the org's talent assessment methodology.",
      },
    },
    policy_navigation: {
      name: "Policy Navigation",
      anchors: {
        1: "Struggles to apply policy correctly to non-standard cases.",
        2: "Applies standard policy correctly and consistently.",
        3: "Navigates ambiguous policy situations with sound judgment.",
        4: "Shapes policy interpretation others rely on.",
        5: "Trusted to set policy precedent for the org.",
      },
    },
  },
  Support: {
    customer_resolution: {
      name: "Customer Resolution",
      anchors: {
        1: "Needs escalation for anything beyond the basic script.",
        2: "Resolves standard tickets independently and correctly.",
        3: "Resolves complex, high-friction cases others have escalated.",
        4: "Resolution approach becomes the team's playbook for hard cases.",
        5: "Sought out org-wide for the highest-stakes customer situations.",
      },
    },
    troubleshooting: {
      name: "Troubleshooting",
      anchors: {
        1: "Diagnoses only well-documented, common issues.",
        2: "Independently diagnoses standard technical issues.",
        3: "Diagnoses novel, multi-system issues without a runbook.",
        4: "Builds the runbooks/tools the rest of the team diagnoses with.",
        5: "The org's final escalation point for unsolved technical issues.",
      },
    },
  },
};

export function buildCompetencies() {
  const docs = [];
  for (const [cid, spec] of Object.entries(SHARED_COMPETENCIES)) {
    docs.push({
      competency_id: cid, name: spec.name, scope: "shared", department: null,
      anchors: spec.anchors, decay_half_life_months: 18,
      is_compensatory: true, population_median_velocity: 0.05,
    });
  }
  for (const [dept, comps] of Object.entries(DEPARTMENT_COMPETENCIES)) {
    for (const [cid, spec] of Object.entries(comps)) {
      docs.push({
        competency_id: cid, name: spec.name, scope: "department", department: dept,
        anchors: spec.anchors, decay_half_life_months: 18,
        is_compensatory: true, population_median_velocity: 0.05,
      });
    }
  }
  return docs;
}

export function competenciesForDepartment(dept) {
  return [...Object.keys(SHARED_COMPETENCIES), ...Object.keys(DEPARTMENT_COMPETENCIES[dept])];
}

export function buildRoles() {
  const roles = [];
  for (const dept of DEPARTMENTS) {
    LEVELS.forEach((level, levelIdx) => {
      roles.push({
        role_id: `${dept.slice(0, 3).toUpperCase()}-${level.toUpperCase()}`,
        role_title: `${level} ${dept}`,
        department: dept,
        level_idx: levelIdx,
      });
    });
  }
  return roles;
}

export function buildRoleProfiles(roles) {
  const docs = [];
  for (const role of roles) {
    const compIds = competenciesForDepartment(role.department);
    const baseTarget = 1.6 + role.level_idx * 0.9;
    for (const cid of compIds) {
      const isDeptSpecific = !(cid in SHARED_COMPETENCIES);
      docs.push({
        role_id: role.role_id,
        competency_id: cid,
        target_level: Math.round(Math.min(baseTarget, 5.0) * 100) / 100,
        criticality: isDeptSpecific ? 0.75 : 0.5,
        min_acceptable_level: Math.round(Math.max(baseTarget - 1.2, 1.0) * 100) / 100,
        is_growth_edge: isDeptSpecific,
      });
    }
  }
  return docs;
}

export const ACTION_TYPES = ["course", "mentor", "project", "stretch_assignment", "coaching", "community"];

export function buildActionCatalog(rng) {
  const allCompIds = [
    ...Object.keys(SHARED_COMPETENCIES),
    ...Object.values(DEPARTMENT_COMPETENCIES).flatMap((c) => Object.keys(c)),
  ];
  const docs = [];
  let idx = 0;
  for (const cid of allCompIds) {
    for (let i = 0; i < 3; i++) {
      idx += 1;
      const atype = rng.choice(ACTION_TYPES);
      docs.push({
        action_id: `ACT-${String(idx).padStart(4, "0")}`,
        action_type: atype,
        name: `${atype.replace(/_/g, " ")}: ${cid.replace(/_/g, " ")} #${i + 1}`,
        competency_tags: [cid],
        target_level_range: [2, 4],
        duration_hours: rng.integers(2, 40),
        modality: rng.choice(["self_paced", "cohort", "1:1", "on_the_job"]),
        prerequisite_level: rng.integers(1, 3),
        cost: rng.integers(0, 500),
        availability: "open",
        historical_uplift_median: Math.round(rng.uniform(0.2, 0.8) * 100) / 100,
        historical_time_to_effect_days: rng.integers(45, 180),
        historical_n: rng.integers(8, 60),
      });
    }
  }
  return docs;
}
