import OpenAI from "openai";

/** Grok client via the OpenAI SDK, or null when no key is configured (app then uses fallbacks). */
export function grok(): OpenAI | null {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    timeout: 15_000,
    maxRetries: 1,
  });
}

export const GROK_MODEL = process.env.XAI_MODEL || "grok-4.7";
