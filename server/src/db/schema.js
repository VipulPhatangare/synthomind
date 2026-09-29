/**
 * Collection registry + index definitions — single source of truth for what
 * exists in MongoDB. JS port of the original Python schema (Phase 1);
 * describes the same 21 collections already created in Atlas.
 */

export const COLLECTIONS = [
  // auth
  "users",
  // reference / org data
  "employees",
  "competencies",
  "role_profiles",
  "org_events",
  "action_catalog",
  // raw evidence sources
  "assessments",
  "training",
  "projects",
  "manager_feedback",
  "peer_feedback",
  "self_assessment",
  "kpis",
  "certifications",
  // canonical, append-only
  "evidence_events",
  // computed outputs
  "verdicts",
  "recommendations_issued",
  "recommendation_outcomes",
  "employee_profiles",
  "disputes",
  // RAG + chat
  "rag_chunks",
  "chat_sessions",
  "chat_messages",
];

// { collection: [ [keysObj, options], ... ] }
export const INDEXES = {
  users: [[{ email: 1 }, { unique: true, name: "uniq_email" }]],
  employees: [
    [{ employee_id: 1 }, { unique: true, name: "uniq_employee_id" }],
    [{ department: 1 }, { name: "by_department" }],
    [{ role_id: 1 }, { name: "by_role" }],
    [{ manager_id: 1 }, { name: "by_manager" }],
    [{ status: 1 }, { name: "by_status" }],
  ],
  competencies: [[{ competency_id: 1 }, { unique: true, name: "uniq_competency_id" }]],
  role_profiles: [
    [{ role_id: 1, competency_id: 1 }, { unique: true, name: "uniq_role_competency" }],
  ],
  org_events: [
    [{ employee_id: 1, occurred_at: -1 }, { name: "by_employee_time" }],
    [{ event_type: 1 }, { name: "by_event_type" }],
  ],
  action_catalog: [
    [{ action_id: 1 }, { unique: true, name: "uniq_action_id" }],
    [{ competency_tags: 1 }, { name: "by_competency_tags" }],
  ],
  assessments: [
    [{ employee_id: 1, competency_id: 1, taken_at: -1 }, { name: "by_employee_competency_time" }],
  ],
  training: [
    [{ employee_id: 1, started_at: -1 }, { name: "by_employee_time" }],
    [{ competency_tags: 1 }, { name: "by_competency_tags" }],
  ],
  projects: [
    [{ employee_id: 1, started_at: -1 }, { name: "by_employee_time" }],
    [{ competencies_exercised: 1 }, { name: "by_competencies_exercised" }],
  ],
  manager_feedback: [
    [{ employee_id: 1, occurred_at: -1 }, { name: "by_employee_time" }],
    [{ rater_id: 1 }, { name: "by_rater" }],
  ],
  peer_feedback: [
    [{ employee_id: 1, occurred_at: -1 }, { name: "by_employee_time" }],
    [{ rater_id: 1 }, { name: "by_rater" }],
  ],
  self_assessment: [
    [{ employee_id: 1, occurred_at: -1 }, { name: "by_employee_time" }],
  ],
  kpis: [
    [{ employee_id: 1, competency_id: 1, period_start: -1 }, { name: "by_employee_competency_period" }],
  ],
  certifications: [
    [{ employee_id: 1 }, { name: "by_employee" }],
    [{ competency_tags: 1 }, { name: "by_competency_tags" }],
  ],
  evidence_events: [
    [{ employee_id: 1, competency_id: 1, occurred_at: 1 }, { name: "by_employee_competency_time" }],
    [{ source_type: 1 }, { name: "by_source_type" }],
    [{ rater_id: 1 }, { name: "by_rater" }],
    [{ dedupe_key: 1 }, { name: "by_dedupe_key" }],
    [{ raw_text: "text" }, { name: "text_search", default_language: "english" }],
  ],
  verdicts: [
    [{ employee_id: 1, competency_id: 1 }, { unique: true, name: "uniq_employee_competency" }],
    [{ verdict: 1 }, { name: "by_verdict" }],
    [{ updated_at: -1 }, { name: "by_updated_at" }],
  ],
  recommendations_issued: [
    [{ employee_id: 1, competency_id: 1, issued_at: -1 }, { name: "by_employee_competency_time" }],
    [{ action_id: 1 }, { name: "by_action" }],
  ],
  recommendation_outcomes: [
    [{ rec_id: 1 }, { unique: true, name: "uniq_rec_id" }],
    [{ status: 1, check_in_at: 1 }, { name: "by_status_checkin" }],
    [{ action_id: 1 }, { name: "by_action" }],
  ],
  employee_profiles: [
    [{ employee_id: 1 }, { unique: true, name: "uniq_employee_id" }],
    [{ profile_shape: 1 }, { name: "by_profile_shape" }],
  ],
  disputes: [
    [{ evidence_event_id: 1 }, { name: "by_evidence_event" }],
    [{ employee_id: 1, raised_at: -1 }, { name: "by_employee_time" }],
    [{ resolution: 1 }, { name: "by_resolution" }],
  ],
  rag_chunks: [
    [{ employee_id: 1, competency_id: 1 }, { name: "by_employee_competency" }],
    [{ source_id: 1 }, { name: "by_source_id" }],
    [{ chunk_type: 1 }, { name: "by_chunk_type" }],
  ],
  chat_sessions: [[{ user_id: 1, updated_at: -1 }, { name: "by_user_time" }]],
  chat_messages: [[{ session_id: 1, created_at: 1 }, { name: "by_session_time" }]],
};

export const VECTOR_INDEX_NAME = "rag_vector_index";
export const VECTOR_INDEX_COLLECTION = "rag_chunks";
export const EMBEDDING_DIMENSIONS = 1536;

export const VECTOR_INDEX_DEFINITION = {
  fields: [
    { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
    { type: "filter", path: "employee_id" },
    { type: "filter", path: "competency_id" },
    { type: "filter", path: "department" },
    { type: "filter", path: "occurred_at" },
    { type: "filter", path: "chunk_type" },
  ],
};
