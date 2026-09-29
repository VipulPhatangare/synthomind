/**
 * Phase 5 entrypoint: builds the RAG chunk index — free-text evidence
 * (manager/peer feedback) + one verdict-summary chunk per pair — embeds
 * everything with OpenAI text-embedding-3-small, and upserts into
 * rag_chunks against the Atlas Vector Search index created in Phase 1.
 * Clears rag_chunks first (idempotent).
 *
 *   npm run build-rag-index
 */
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";
import { env } from "../src/config/env.js";
import { buildEvidenceChunks, buildSummaryChunks } from "../src/services/rag/chunker.js";
import { embedTexts } from "../src/services/rag/embeddings.js";
import { searchChunks } from "../src/services/rag/retrieval.js";

async function main() {
  if (!env.OPENAI_API_KEY) {
    console.error("BLOCKED: OPENAI_API_KEY is not set in server/.env — required for embeddings.");
    console.error("Add it and re-run: npm run build-rag-index");
    process.exit(1);
  }

  await connectDb();
  const db = mongoose.connection.db;

  console.log("Loading data...");
  const [employees, competencies, verdicts, evidenceEvents] = await Promise.all([
    db.collection("employees").find({}).toArray(),
    db.collection("competencies").find({}).toArray(),
    db.collection("verdicts").find({}).toArray(),
    db.collection("evidence_events").find({ source_type: { $in: ["manager_feedback", "peer_feedback"] } }).toArray(),
  ]);
  console.log(`  employees: ${employees.length}, competencies: ${competencies.length}, verdicts: ${verdicts.length}, text evidence_events: ${evidenceEvents.length}`);

  const employeesById = new Map(employees.map((e) => [e.employee_id, e]));
  const competenciesById = new Map(competencies.map((c) => [c.competency_id, c]));
  for (const e of evidenceEvents) e._department = employeesById.get(e.employee_id)?.department;

  const evidenceChunks = buildEvidenceChunks(evidenceEvents);
  const summaryChunks = buildSummaryChunks(verdicts, employeesById, competenciesById);
  const allChunks = [...evidenceChunks, ...summaryChunks];
  console.log(`  built ${evidenceChunks.length} evidence chunks + ${summaryChunks.length} summary chunks = ${allChunks.length} total`);

  console.log("\nClearing previous rag_chunks...");
  await db.collection("rag_chunks").deleteMany({});

  console.log(`Embedding ${allChunks.length} chunks (batches of 200)...`);
  const t0 = Date.now();
  const embeddings = await embedTexts(allChunks.map((c) => c.text), {
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });
  console.log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const docs = allChunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

  console.log("\nInserting into rag_chunks...");
  for (let i = 0; i < docs.length; i += 1000) {
    await db.collection("rag_chunks").insertMany(docs.slice(i, i + 1000), { ordered: false });
  }
  const count = await db.collection("rag_chunks").estimatedDocumentCount();
  console.log(`  rag_chunks now has ${count} documents`);

  console.log("\n--- Verifying semantic search over the rebuilt index ---");
  const results = await searchChunks("declining performance in system design", { competency_id: "system_design" }, 5);
  for (const r of results) {
    console.log(`  [${r.score.toFixed(3)}] ${r.chunk_type} ${r.employee_id}/${r.competency_id}: ${r.text.slice(0, 90)}...`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
