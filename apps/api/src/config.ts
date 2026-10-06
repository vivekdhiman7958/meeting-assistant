const secret = process.env.JWT_SECRET;

// Fail loudly at startup instead of running with a weak or missing secret.
if (!secret || secret.length < 32) {
  throw new Error("Set JWT_SECRET (32+ characters) in apps/api/.env");
}

export const JWT_SECRET = secret;

// Any OpenAI-compatible provider works: change these three env vars to swap.
export const LLM = {
  baseUrl: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
  apiKey: process.env.LLM_API_KEY ?? "",
  model: process.env.LLM_MODEL ?? "llama-3.3-70b-versatile",
};