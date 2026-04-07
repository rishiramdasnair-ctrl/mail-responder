import OpenAI from "openai";

export const FAST_MODEL = "google/gemini-2.0-flash-001";
export const AGENT_MODEL = "anthropic/claude-3.5-haiku";

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error(
    "[openrouter] FATAL: OPENROUTER_API_KEY environment variable is not set. " +
    "All AI features (email suggestions, agent, smart actions) require this key. " +
    "Set it in the Secrets panel and restart the server."
  );
  process.exit(1);
}

export const openrouter = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://replyai.app",
    "X-Title": "ReplyAI",
  },
});
