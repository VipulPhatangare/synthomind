import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { createSession, handleMessage } from "../services/rag/chat.js";

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.post("/sessions", async (req, res, next) => {
  try {
    const session = await createSession(req.user.email);
    res.status(201).json(session);
  } catch (err) { next(err); }
});

chatRouter.get("/sessions", async (req, res) => {
  const db = mongoose.connection.db;
  const sessions = await db.collection("chat_sessions")
    .find({ user_id: req.user.email })
    .sort({ updated_at: -1 })
    .toArray();

  // Sessions don't store a title — resolve each one's first user message as
  // a preview so the history list reads as "what did I ask" rather than a
  // bare timestamp. One aggregation across this user's sessions, not N+1.
  const sessionIds = sessions.map((s) => s.session_id);
  const firstMessages = sessionIds.length
    ? await db.collection("chat_messages").aggregate([
        { $match: { session_id: { $in: sessionIds }, role: "user" } },
        { $sort: { created_at: 1 } },
        { $group: { _id: "$session_id", content: { $first: "$content" } } },
      ]).toArray()
    : [];
  const previewBySession = new Map(firstMessages.map((m) => [m._id, m.content]));

  const enriched = sessions.map((s) => ({
    ...s,
    preview: previewBySession.get(s.session_id) || null,
  }));

  res.json({ sessions: enriched });
});

/**
 * Bulk delete — every chat session (and their messages) belonging to the
 * current user only. Scoped by user_id at the query level, same as every
 * other chat route, so this can never touch another user's history.
 * Registered before /sessions/:sessionId's DELETE only for readability
 * (grouped with GET /sessions above it); Express wouldn't actually confuse
 * the two routes either way — "/sessions" and "/sessions/:sessionId" are a
 * different number of path segments.
 */
chatRouter.delete("/sessions", async (req, res) => {
  const db = mongoose.connection.db;
  const sessions = await db.collection("chat_sessions")
    .find({ user_id: req.user.email }, { projection: { session_id: 1 } })
    .toArray();
  const sessionIds = sessions.map((s) => s.session_id);

  if (sessionIds.length > 0) {
    await Promise.all([
      db.collection("chat_messages").deleteMany({ session_id: { $in: sessionIds } }),
      db.collection("chat_sessions").deleteMany({ session_id: { $in: sessionIds } }),
    ]);
  }
  res.json({ deleted: sessionIds.length });
});

chatRouter.get("/sessions/:sessionId", async (req, res) => {
  const db = mongoose.connection.db;
  const session = await db.collection("chat_sessions").findOne({ session_id: req.params.sessionId });
  if (!session || session.user_id !== req.user.email) return res.status(404).json({ error: "Session not found" });
  const messages = await db.collection("chat_messages")
    .find({ session_id: req.params.sessionId })
    .sort({ created_at: 1 })
    .toArray();

  // Assistant messages persist only retrieved_chunk_ids, not the full
  // source objects the live turn response returns (those are built
  // on-the-fly from a fresh vector search) — resolve them back against
  // rag_chunks so a reloaded history message renders identically to one
  // that just arrived. `score` is the one field that can't be
  // reconstructed (it's specific to that turn's query, not a chunk
  // property) but the UI never displays it, so nothing is actually lost.
  const allChunkIds = [...new Set(messages.flatMap((m) => m.retrieved_chunk_ids || []))];
  const chunks = allChunkIds.length
    ? await db.collection("rag_chunks").find(
        { chunk_id: { $in: allChunkIds } },
        { projection: { chunk_id: 1, chunk_type: 1, employee_id: 1, competency_id: 1, occurred_at: 1 } }
      ).toArray()
    : [];
  const chunkById = new Map(chunks.map((c) => [c.chunk_id, c]));

  const enrichedMessages = messages.map((m) => ({
    ...m,
    sources: (m.retrieved_chunk_ids || [])
      .map((id) => chunkById.get(id))
      .filter(Boolean)
      .map((c) => ({ chunk_id: c.chunk_id, chunk_type: c.chunk_type, employee_id: c.employee_id, competency_id: c.competency_id, occurred_at: c.occurred_at })),
  }));

  res.json({ session, messages: enrichedMessages });
});

chatRouter.delete("/sessions/:sessionId", async (req, res) => {
  const db = mongoose.connection.db;
  const session = await db.collection("chat_sessions").findOne({ session_id: req.params.sessionId });
  if (!session || session.user_id !== req.user.email) return res.status(404).json({ error: "Session not found" });

  await Promise.all([
    db.collection("chat_messages").deleteMany({ session_id: req.params.sessionId }),
    db.collection("chat_sessions").deleteOne({ session_id: req.params.sessionId }),
  ]);
  res.status(204).end();
});

chatRouter.post("/sessions/:sessionId/messages", async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const session = await db.collection("chat_sessions").findOne({ session_id: req.params.sessionId });
    if (!session || session.user_id !== req.user.email) return res.status(404).json({ error: "Session not found" });

    const { message } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });

    const result = await handleMessage(req.params.sessionId, message.trim());
    res.json(result);
  } catch (err) { next(err); }
});
