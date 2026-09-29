/**
 * Dumps every collection to a CSV file under ../data/ — proves the
 * "download it as CSV" requirement end to end. Nested fields (arrays/
 * objects, e.g. manager_feedback.ratings) are JSON-stringified into the
 * cell since CSV has no native nested structure.
 *
 *   npm run export-csv
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { format } from "fast-csv";
import { connectDb } from "../src/db/connection.js";
import { COLLECTIONS } from "../src/db/schema.js";

const OUT_DIR = path.resolve("..", "data");

function flattenValue(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

async function exportCollection(db, name) {
  const docs = await db.collection(name).find({}).toArray();
  if (docs.length === 0) {
    console.log(`  ${name.padEnd(24)} 0 docs — skipped`);
    return 0;
  }
  // union of all keys across docs (schema varies slightly, e.g. optional fields)
  const keys = new Set();
  for (const d of docs) for (const k of Object.keys(d)) if (k !== "_id") keys.add(k);
  const columns = Array.from(keys);

  const rows = docs.map((d) => {
    const row = {};
    for (const k of columns) row[k] = flattenValue(d[k]);
    return row;
  });

  const outPath = path.join(OUT_DIR, `${name}.csv`);
  await new Promise((resolve, reject) => {
    const stream = format({ headers: columns });
    const fileStream = fs.createWriteStream(outPath);
    stream.pipe(fileStream).on("finish", resolve).on("error", reject);
    stream.on("error", reject);
    for (const row of rows) stream.write(row);
    stream.end();
  });
  console.log(`  ${name.padEnd(24)} ${docs.length} docs -> ${outPath}`);
  return docs.length;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await connectDb();
  const db = mongoose.connection.db;

  console.log(`Exporting all collections to ${OUT_DIR}\n`);
  let total = 0;
  for (const name of COLLECTIONS) {
    total += await exportCollection(db, name);
  }
  console.log(`\nDone — ${total} total documents exported across ${COLLECTIONS.length} CSV files.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
