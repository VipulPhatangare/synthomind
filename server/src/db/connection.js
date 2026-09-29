import mongoose from "mongoose";
import { env } from "../config/env.js";

let connected = false;

export async function connectDb() {
  if (connected) return mongoose.connection;
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
  });
  connected = true;
  const target = env.MONGODB_URI.startsWith("mongodb://localhost") || env.MONGODB_URI.includes("127.0.0.1")
    ? "local MongoDB" : "MongoDB Atlas";
  console.log(`[db] connected to ${target} — database "${env.MONGODB_DB_NAME}"`);
  return mongoose.connection;
}

export function getDb() {
  return mongoose.connection.db;
}
