/**
 * Phase 2 entrypoint: generates the 500-employee synthetic dataset and
 * seeds it into the collections created in Phase 1. Clears previously
 * generated data first (idempotent re-run), leaves `users` untouched.
 *
 *   npm run generate-data
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";
import { generateAll } from "../data_gen/generate.js";

const GENERATED_COLLECTIONS = [
  "employees", "competencies", "role_profiles", "org_events", "action_catalog",
  "assessments", "training", "projects", "manager_feedback", "peer_feedback",
  "self_assessment", "kpis", "certifications", "evidence_events", "disputes",
];

async function bulkInsert(db, name, docs) {
  if (docs.length === 0) return 0;
  const CHUNK = 2000;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    const res = await db.collection(name).insertMany(chunk, { ordered: false });
    inserted += res.insertedCount;
  }
  return inserted;
}

async function main() {
  console.log("Generating synthetic dataset (seed=42)...");
  const t0 = Date.now();
  const { collections, groundTruth, showcases } = generateAll();
  console.log(`Generated in-memory in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  for (const [name, docs] of Object.entries(collections)) {
    console.log(`  ${name.padEnd(20)} ${docs.length} docs`);
  }

  await connectDb();
  const db = mongoose.connection.db;

  console.log("\nClearing previously generated data...");
  for (const name of GENERATED_COLLECTIONS) {
    await db.collection(name).deleteMany({});
  }

  console.log("Inserting into MongoDB...");
  for (const name of GENERATED_COLLECTIONS) {
    const docs = collections[name] || [];
    const n = await bulkInsert(db, name, docs);
    console.log(`  ${name.padEnd(20)} inserted ${n}`);
  }

  const outPath = path.resolve("data_gen", "ground_truth.json");
  fs.writeFileSync(outPath, JSON.stringify(groundTruth, null, 2));
  console.log(`\nGround truth written to ${outPath} (${groundTruth.length} employee×competency pairs)`);

  // Showcase manifest — generated here, never hardcoded in the client. These
  // employees/competencies are picked by ARRAY INDEX inside generate.js, so
  // any re-run with a different employee count/order would silently repoint
  // a hardcoded ID. Served via /api/meta/showcase.
  const showcasePath = path.resolve("data_gen", "showcase.json");
  fs.writeFileSync(showcasePath, JSON.stringify(showcases, null, 2));
  console.log(`Showcase manifest written to ${showcasePath} (${showcases.length} entries)`);

  console.log("\n--- Final counts ---");
  for (const name of GENERATED_COLLECTIONS) {
    const count = await db.collection(name).estimatedDocumentCount();
    console.log(`  ${name.padEnd(20)} ${count}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
