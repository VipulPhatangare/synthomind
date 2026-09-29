/**
 * Phase 1b: verifies (and, if run against a fresh cluster, creates) every
 * collection, every regular index, the Atlas Vector Search index on
 * rag_chunks, and the seeded admin login. Idempotent — safe to re-run.
 *
 *   npm run init-db
 */
import bcrypt from "bcryptjs";
import { connectDb } from "../src/db/connection.js";
import {
  COLLECTIONS,
  INDEXES,
  VECTOR_INDEX_NAME,
  VECTOR_INDEX_COLLECTION,
  VECTOR_INDEX_DEFINITION,
} from "../src/db/schema.js";
import { env } from "../src/config/env.js";
import mongoose from "mongoose";

async function createCollections(db) {
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  const created = [];
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      created.push(name);
    }
  }
  console.log(`[collections] created: ${created.length}  already existed: ${COLLECTIONS.length - created.length}`);
  if (created.length) console.log("  new:", created.join(", "));
}

async function createRegularIndexes(db) {
  let total = 0;
  for (const [collName, specs] of Object.entries(INDEXES)) {
    const coll = db.collection(collName);
    for (const [keys, options] of specs) {
      await coll.createIndex(keys, options);
      total += 1;
    }
  }
  console.log(`[indexes] ensured ${total} regular indexes across ${Object.keys(INDEXES).length} collections`);
}

async function createVectorSearchIndex(db) {
  const coll = db.collection(VECTOR_INDEX_COLLECTION);
  let existingNames = new Set();
  try {
    const idxs = await coll.listSearchIndexes().toArray();
    existingNames = new Set(idxs.map((i) => i.name));
  } catch (e) {
    console.log(`[vector index] SKIPPED — this cluster tier does not support Atlas Search: ${e.message}`);
    return;
  }

  if (existingNames.has(VECTOR_INDEX_NAME)) {
    const idxs = await coll.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
    const status = idxs[0];
    console.log(`[vector index] '${VECTOR_INDEX_NAME}' already exists — status: ${status.status}, queryable: ${status.queryable}`);
    return;
  }

  await coll.createSearchIndex({
    name: VECTOR_INDEX_NAME,
    type: "vectorSearch",
    definition: VECTOR_INDEX_DEFINITION,
  });
  console.log(`[vector index] submitted '${VECTOR_INDEX_NAME}' — waiting for it to build...`);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const idxs = await coll.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
    if (idxs.length && idxs[0].queryable) {
      console.log(`[vector index] '${VECTOR_INDEX_NAME}' is READY and queryable`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`[vector index] still building after 120s — check Atlas UI (Search tab)`);
}

async function seedAdminUser(db) {
  const users = db.collection("users");
  const found = await users.findOne({ email: env.ADMIN_EMAIL });
  if (found) {
    console.log(`[admin user] ${env.ADMIN_EMAIL} already exists — skipped`);
    return;
  }
  const password_hash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  await users.insertOne({ email: env.ADMIN_EMAIL, password_hash, role: "admin" });
  console.log(`[admin user] seeded ${env.ADMIN_EMAIL}`);
}

async function main() {
  await connectDb();
  const db = mongoose.connection.db;

  await createCollections(db);
  await createRegularIndexes(db);
  await createVectorSearchIndex(db);
  await seedAdminUser(db);

  console.log("\n--- Summary ---");
  for (const name of COLLECTIONS) {
    const count = await db.collection(name).estimatedDocumentCount();
    console.log(`  ${name.padEnd(24)} ${count} docs`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
