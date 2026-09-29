/**
 * Gemini Flash Lite wrapper — three jobs: (1) query understanding (extract
 * filters + rewrite the question), (2) grounded answer generation, (3)
 * cheap running-summary compression for long chat sessions.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { env } from "../../config/env.js";

function extractUsage(resp) {
  const u = resp.usageMetadata;
  if (!u) return null;
  return {
    promptTokens: u.promptTokenCount ?? 0,
    outputTokens: u.candidatesTokenCount ?? 0,
    totalTokens: u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0),
  };
}

let client = null;
function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set in server/.env — required for the chatbot (Gemini Flash Lite). Add it and retry."
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

const QUERY_UNDERSTANDING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    employee_name_mentioned: { type: Type.STRING, nullable: true, description: "Employee name or ID as literally mentioned, if any" },
    competency_id: { type: Type.STRING, nullable: true, description: "Best-matching competency_id from the provided list, if the question is about a specific competency" },
    department: { type: Type.STRING, nullable: true, description: "Department name, if the question is scoped to one" },
    rewritten_query: { type: Type.STRING, description: "The question rewritten as a clean, self-contained search query, resolving pronouns/follow-ups using the conversation context" },
    intent: { type: Type.STRING, enum: ["specific_evidence", "verdict_summary", "org_wide", "recommendation", "other"] },
  },
  required: ["rewritten_query", "intent"],
};

export async function understandQuery({ message, runningSummary, activeEmployeeName, activeCompetencyId, recentTurns, competencyList }) {
  const ai = getClient();
  const context = [
    runningSummary ? `Conversation summary so far: ${runningSummary}` : "",
    activeEmployeeName ? `Currently discussing employee: ${activeEmployeeName}` : "",
    activeCompetencyId ? `Currently discussing competency: ${activeCompetencyId}` : "",
    recentTurns?.length ? `Recent turns:\n${recentTurns.map((t) => `${t.role}: ${t.content}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const prompt = `You are a query-understanding step for an HR talent-intelligence chatbot.
Valid competency_ids: ${competencyList.join(", ")}

${context}

New user message: "${message}"

Extract structured filters and rewrite the question as a self-contained search query.`;

  const resp = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: QUERY_UNDERSTANDING_SCHEMA },
  });

  return { ...JSON.parse(resp.text), usage: extractUsage(resp) };
}

const GENERATION_SYSTEM_PROMPT = `You are TalentIQ's assistant, answering questions about employee skill trajectories using ONLY the evidence provided below.

Rules:
- Answer strictly from the provided evidence chunks and verdict summaries. Never invent facts, dates, or numbers not present in them.
- Every factual claim must cite its source inline, like: (manager feedback, 2025-06-30) or (verdict summary).
- If the provided evidence is thin, empty, or doesn't actually answer the question, say so plainly: "There isn't enough evidence to answer that confidently." Do not guess. This mirrors the platform's own insufficiency-aware design — the chatbot should never be more confident than the underlying data supports.
- Never open with that disclaimer and then give a full breakdown anyway — that reads as contradicting yourself. If you do have per-competency verdicts to report, lead directly with them. Only use the disclaimer when there is genuinely nothing substantive to say. Verdicts in this data model are always per-competency, never a single "overall" score — if asked for an overall verdict, say that in one short clause, then give the per-competency picture; don't frame the absence of an "overall" number as an evidence shortfall.
- Be concise. Prefer short paragraphs or a short list over long prose.
- Also propose exactly 3 short follow-up questions (a few words each) the user could naturally ask next. Ground them in the same employee/competency context — not generic filler — and never repeat the question just asked.`;

const ANSWER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING, description: "The grounded answer, following all rules above." },
    follow_up_questions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Exactly 3 short, specific follow-up questions grounded in the same context.",
    },
  },
  required: ["answer", "follow_up_questions"],
};

export async function generateAnswer({ message, runningSummary, recentTurns, chunks }) {
  const ai = getClient();
  const evidenceBlock = chunks.length
    ? chunks.map((c, i) => `[${i + 1}] (${c.chunk_type}, ${c.employee_id}/${c.competency_id}, ${new Date(c.occurred_at).toISOString().slice(0, 10)}): ${c.text}`).join("\n\n")
    : "(no matching evidence retrieved)";

  const context = [
    runningSummary ? `Conversation summary so far: ${runningSummary}` : "",
    recentTurns?.length ? `Recent turns:\n${recentTurns.map((t) => `${t.role}: ${t.content}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const prompt = `${GENERATION_SYSTEM_PROMPT}

${context}

Retrieved evidence:
${evidenceBlock}

User question: "${message}"`;

  const resp = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: ANSWER_SCHEMA },
  });
  const parsed = JSON.parse(resp.text);
  return { answer: parsed.answer, followUps: (parsed.follow_up_questions || []).slice(0, 3), usage: extractUsage(resp) };
}

export async function summarizeTurns({ priorSummary, turns }) {
  const ai = getClient();
  const prompt = `Compress this chat history into a short running summary (2-4 sentences) an assistant can use as context later. Preserve which employees/competencies were discussed and any conclusions given.

Prior summary: ${priorSummary || "(none)"}

Turns to fold in:
${turns.map((t) => `${t.role}: ${t.content}`).join("\n")}`;

  const resp = await ai.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: prompt,
  });
  return { summary: resp.text.trim(), usage: extractUsage(resp) };
}
