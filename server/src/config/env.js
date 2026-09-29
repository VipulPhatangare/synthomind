import "dotenv/config";

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const env = {
  MONGODB_URI: required("MONGODB_URI"),
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "talentiq",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",

  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRE_DAYS: Number(process.env.JWT_EXPIRE_DAYS || 7),

  ADMIN_EMAIL: required("ADMIN_EMAIL"),
  ADMIN_PASSWORD: required("ADMIN_PASSWORD"),

  PORT: Number(process.env.PORT || 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173",

  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIMENSIONS: 1536,
  GEMINI_MODEL: "gemini-flash-lite-latest",
};
