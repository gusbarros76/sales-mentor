import path from "path";
import dotenv from "dotenv";

// Load env from repo root (../../.. from src/), falling back to CWD.
const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath });
dotenv.config();

const DEFAULT_PORT = 8080;
const DEFAULT_COOLDOWN_MS = 90_000;

export const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || DEFAULT_PORT),
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.INSIGHTS_JWT_SECRET || "",
  openAiApiKey: process.env.OPENAI_API_KEY,
  cooldownMs: Number(process.env.INSIGHTS_COOLDOWN_MS || DEFAULT_COOLDOWN_MS),
};

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

if (!config.jwtSecret) {
  throw new Error("INSIGHTS_JWT_SECRET is required");
}
