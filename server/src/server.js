import mongoose from "mongoose";
import { app } from "./app.js";
import { connectDb } from "./db/connection.js";
import { env } from "./config/env.js";

async function main() {
  const t0 = Date.now();
  await connectDb();

  // Pre-warm the connection pool with a couple of concurrent trivial
  // queries before accepting traffic — otherwise the FIRST real request
  // (often the user's first page load) eats the ~8-10s Atlas connection
  // setup cost that a cold pool only pays once. Everything after this is
  // typically ~1-2s per request.
  const db = mongoose.connection.db;
  await Promise.all([
    db.collection("employees").findOne({}),
    db.collection("verdicts").findOne({}),
  ]);
  console.log(`[db] pool warmed in ${Date.now() - t0}ms`);

  app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
