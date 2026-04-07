import OpenAI from "openai";

export const FAST_MODEL = "google/gemini-2.0-flash-001";
export const AGENT_MODEL = "anthropic/claude-3.5-haiku";

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.warn("[openrouter] OPENROUTER_API_KEY is not set — AI features will fail at runtime.");
}

export const openrouter = new OpenAI({
  apiKey: apiKey ?? "missing",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://replyai.app",
    "X-Title": "ReplyAI",
  },
});
