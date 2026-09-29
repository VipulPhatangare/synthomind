/**
 * Lightweight JSON backup — mongodump isn't installed, so this dumps named
 * collections to server/backups/<timestamp>/<collection>.json via the
 * driver directly. Not for production restore (loses BSON types like
 * ObjectId/Date fidelity on round-trip), just a safety net before a
 * destructive step (run-analytics clearing verdicts, generate-data
 * clearing everything) during this session.
 *
 *   node scripts/backupCollections.js verdicts recommendations_issued
 *   node scripts/backupCollections.js --all
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";

const ALL = [
  "employees", "competencies", "role_profiles", "action_catalog",
  "evidence_events", "assessments", "self_assessment", "manager_feedback",
  "peer_feedback", "kpis", "projects", "training", "certifications",
  "org_events", "disputes", "verdicts", "recommendations_issued",
  "rag_chunks", "users",
];

async function main() {
  const args = process.argv.slice(2);
  const names = args.includes("--all") ? ALL : args;
  if (names.length === 0) {
    console.error("Usage: node scripts/backupCollections.js <coll> [coll...] | --all");
    process.exit(1);
  }

  await connectDb();
  const db = mongoose.connection.db;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve("backups", stamp);
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(docs));
    console.log(`  ${name.padEnd(28)} ${docs.length} docs -> ${path.join(outDir, name + ".json")}`);
  }

  console.log(`\nBackup complete: ${outDir}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
