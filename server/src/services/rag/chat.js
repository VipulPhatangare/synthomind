/**
 * Chat orchestration: query understanding -> filtered $vectorSearch ->
 * grounded generation -> session memory (buffer of recent turns + a
 * compressed running summary once the window overflows).
 */
import mongoose from "mongoose";
import { understandQuery, generateAnswer, summarizeTurns } from "./gemini.js";
import { searchChunks } from "./retrieval.js";

const RECENT_TURNS_WINDOW = 8; // raw turns kept verbatim before folding into the summary
const RETRIEVAL_LIMIT = 8;

function db() { return mongoose.connection.db; }

export async function createSession(userEmail) {
  const doc = {
    session_id: `SESS-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    user_id: userEmail,
    created_at: new Date(),
    updated_at: new Date(),
    active_employee_id: null,
    active_employee_name: null,
    active_competency_id: null,
    running_summary: "",
    total_prompt_tokens: 0,
    total_output_tokens: 0,
    total_tokens: 0,
  };
  await db().collection("chat_sessions").insertOne(doc);
  return doc;
}

function sumUsage(...usages) {
  const parts = usages.filter(Boolean);
  return {
    promptTokens: parts.reduce((s, u) => s + (u.promptTokens || 0), 0),
    outputTokens: parts.reduce((s, u) => s + (u.outputTokens || 0), 0),
    totalTokens: parts.reduce((s, u) => s + (u.totalTokens || 0), 0),
  };
}

async function resolveEmployee(nameOrId) {
  if (!nameOrId) return null;
  const byId = await db().collection("employees").findOne({ employee_id: nameOrId });
  if (byId) return byId;
  return db().collection("employees").findOne({ name: { $regex: nameOrId, $options: "i" } });
}

async function getRecentTurns(sessionId) {
  const msgs = await db().collection("chat_messages")
    .find({ session_id: sessionId })
    .sort({ created_at: -1 })
    .limit(RECENT_TURNS_WINDOW)
    .toArray();
  return msgs.reverse().map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Chart data is read straight from the verdicts collection, never from the
 * LLM — the chatbot's numbers must match the dashboard's numbers exactly.
 * Prefers a single competency's trajectory when one is in focus (explicit
 * mention or carried over from session context); otherwise, for a resolved
 * employee, falls back to a levels-vs-target comparison across all their
 * competencies (e.g. "give me a summary").
 */
async function buildChart({ employee, focusCompetencyId, competencyNameById }) {
  if (!employee) return null;

  const empVerdicts = await db().collection("verdicts").find({ employee_id: employee.employee_id }).toArray();
  if (empVerdicts.length === 0) return null;

  const focusVerdict = focusCompetencyId ? empVerdicts.find((v) => v.competency_id === focusCompetencyId) : null;
  if (focusVerdict && focusVerdict.level_history?.length) {
    return {
      type: "trajectory",
      competency_id: focusVerdict.competency_id,
      competency_name: competencyNameById.get(focusVerdict.competency_id) || focusVerdict.competency_id,
      history: focusVerdict.level_history,
      role_target_level: focusVerdict.role_target_level,
      verdict: focusVerdict.verdict,
    };
  }

  return {
    type: "comparison",
    employee_name: employee.name,
    competencies: empVerdicts.map((v) => ({
      competency_id: v.competency_id,
      name: competencyNameById.get(v.competency_id) || v.competency_id,
      level: v.level_mu,
      role_target_level: v.role_target_level,
      verdict: v.verdict,
      confidence: v.confidence,
    })),
  };
}

async function maybeCompressHistory(session) {
  const totalMessages = await db().collection("chat_messages").countDocuments({ session_id: session.session_id });
  if (totalMessages <= RECENT_TURNS_WINDOW * 2) return; // not overflowing yet

  const olderMessages = await db().collection("chat_messages")
    .find({ session_id: session.session_id })
    .sort({ created_at: 1 })
    .limit(totalMessages - RECENT_TURNS_WINDOW)
    .toArray();
  if (olderMessages.length === 0) return;

  const { summary, usage } = await summarizeTurns({
    priorSummary: session.running_summary,
    turns: olderMessages.map((m) => ({ role: m.role, content: m.content })),
  });
  await db().collection("chat_sessions").updateOne(
    { session_id: session.session_id },
    {
      $set: { running_summary: summary },
      $inc: {
        total_prompt_tokens: usage?.promptTokens || 0,
        total_output_tokens: usage?.outputTokens || 0,
        total_tokens: usage?.totalTokens || 0,
      },
    }
  );
}

export async function handleMessage(sessionId, message) {
  const session = await db().collection("chat_sessions").findOne({ session_id: sessionId });
  if (!session) throw new Error("Session not found");

  const [competencies, recentTurns] = await Promise.all([
    db().collection("competencies").find({}, { projection: { competency_id: 1, name: 1 } }).toArray(),
    getRecentTurns(sessionId),
  ]);
  const competencyNameById = new Map(competencies.map((c) => [c.competency_id, c.name]));

  const understanding = await understandQuery({
    message,
    runningSummary: session.running_summary,
    activeEmployeeName: session.active_employee_name,
    activeCompetencyId: session.active_competency_id,
    recentTurns,
    competencyList: competencies.map((c) => c.competency_id),
  });

  let employee = null;
  if (understanding.employee_name_mentioned) {
    employee = await resolveEmployee(understanding.employee_name_mentioned);
  } else if (session.active_employee_id) {
    employee = await db().collection("employees").findOne({ employee_id: session.active_employee_id });
  }

  const filters = {};
  if (employee) filters.employee_id = employee.employee_id;
  else if (understanding.department) filters.department = understanding.department;
  if (understanding.competency_id) filters.competency_id = understanding.competency_id;

  const chunks = await searchChunks(understanding.rewritten_query, filters, RETRIEVAL_LIMIT);

  const [{ answer, followUps, usage: answerUsage }, chart] = await Promise.all([
    generateAnswer({ message, runningSummary: session.running_summary, recentTurns, chunks }),
    buildChart({
      employee,
      focusCompetencyId: understanding.competency_id || session.active_competency_id,
      competencyNameById,
    }),
  ]);

  // Combined token cost of this turn's two Gemini calls (query understanding + generation).
  const turnUsage = sumUsage(understanding.usage, answerUsage);

  const now = new Date();
  await db().collection("chat_messages").insertMany([
    { message_id: `MSG-${now.getTime()}-u`, session_id: sessionId, role: "user", content: message, created_at: now },
    {
      message_id: `MSG-${now.getTime()}-a`, session_id: sessionId, role: "assistant", content: answer,
      created_at: new Date(now.getTime() + 1), retrieved_chunk_ids: chunks.map((c) => c.chunk_id),
      follow_up_questions: followUps, chart, token_usage: turnUsage,
    },
  ]);

  const updatedSession = await db().collection("chat_sessions").findOneAndUpdate(
    { session_id: sessionId },
    {
      $set: {
        updated_at: new Date(),
        ...(employee ? { active_employee_id: employee.employee_id, active_employee_name: employee.name } : {}),
        ...(understanding.competency_id ? { active_competency_id: understanding.competency_id } : {}),
      },
      $inc: {
        total_prompt_tokens: turnUsage.promptTokens,
        total_output_tokens: turnUsage.outputTokens,
        total_tokens: turnUsage.totalTokens,
      },
    },
    { returnDocument: "after" }
  );

  await maybeCompressHistory(session);

  return {
    answer,
    follow_up_questions: followUps,
    chart,
    sources: chunks.map((c) => ({
      chunk_id: c.chunk_id, chunk_type: c.chunk_type, employee_id: c.employee_id,
      competency_id: c.competency_id, occurred_at: c.occurred_at, score: c.score,
    })),
    resolved_employee: employee ? { employee_id: employee.employee_id, name: employee.name } : null,
    usage: turnUsage,
    session_usage: {
      promptTokens: updatedSession.total_prompt_tokens,
      outputTokens: updatedSession.total_output_tokens,
      totalTokens: updatedSession.total_tokens,
    },
  };
}
