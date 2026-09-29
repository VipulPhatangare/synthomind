import mongoose from "mongoose";
import { embedTexts } from "./embeddings.js";

/**
 * Semantic search over rag_chunks. Local MongoDB Community doesn't have the
 * $vectorSearch aggregation stage (Atlas-only) — this does the equivalent
 * in two steps: a normal Mongo query for the metadata pre-filter (using the
 * regular indexes already on rag_chunks), then a brute-force cosine
 * similarity ranking in Node over the (typically small, filtered) candidate
 * set. At this dataset's scale (~15-18K chunks, 1536-dim), an unfiltered
 * scan is still well under a second — no approximate-NN infrastructure
 * needed. If this ever needs to scale past ~100K+ vectors, that's the
 * point to revisit $vectorSearch (Atlas or a local Atlas Deployment).
 *
 * filters: { employee_id?, competency_id?, department?, chunk_type? }
 */

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

export async function searchChunks(queryText, filters = {}, limit = 10) {
  const [queryVector] = await embedTexts([queryText]);
  const db = mongoose.connection.db;

  const filterClause = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null) filterClause[k] = v;
  }

  const candidates = await db.collection("rag_chunks").find(filterClause).toArray();

  const scored = candidates.map((c) => ({
    chunk_id: c.chunk_id, chunk_type: c.chunk_type, source_id: c.source_id,
    employee_id: c.employee_id, competency_id: c.competency_id,
    department: c.department, occurred_at: c.occurred_at, text: c.text,
    score: cosineSimilarity(queryVector, c.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
