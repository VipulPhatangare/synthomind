import OpenAI from "openai";
import { env } from "../../config/env.js";

let client = null;
function getClient() {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set in server/.env — required for embeddings (text-embedding-3-small). " +
      "Add it and retry."
    );
  }
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

const BATCH_SIZE = 200;

/** texts: string[] -> Promise<number[][]>, same order, 1536-dim each. */
export async function embedTexts(texts, { onProgress } = {}) {
  const openai = getClient();
  const results = new Array(texts.length);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const resp = await openai.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: batch,
    });
    for (let j = 0; j < resp.data.length; j++) {
      results[i + j] = resp.data[j].embedding;
    }
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, texts.length), texts.length);
  }
  return results;
}
