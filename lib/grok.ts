import OpenAI from "openai";
import { aiProviderName } from "./ai-provider";

const configured = (...values: Array<string | undefined>) => values.find((value) => value?.trim())?.trim();

export type AiConfig = {
  providerName: string;
  apiKey: string | undefined;
  baseURL: string;
  model: string;
  rerankModel: string;
};

/** Reads the configured OpenAI-compatible provider, retaining XAI_* compatibility. */
export function aiConfig(): AiConfig {
  return {
    providerName: aiProviderName(),
    apiKey: configured(process.env.AI_API_KEY, process.env.XAI_API_KEY),
    baseURL: configured(process.env.AI_BASE_URL, process.env.XAI_BASE_URL) ?? "https://api.x.ai/v1",
    model: configured(process.env.AI_MODEL, process.env.XAI_MODEL) ?? "grok-4.7",
    rerankModel: configured(process.env.AI_RERANK_MODEL, process.env.XAI_RERANK_MODEL) ?? "grok-4.20-0309-non-reasoning",
  };
}

export { aiProviderName } from "./ai-provider";
export const aiAvailable = () => Boolean(aiConfig().apiKey);

/** OpenAI-compatible AI client, or null when no provider key is configured. */
export function aiClient(): OpenAI | null {
  const { apiKey, baseURL } = aiConfig();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 15_000,
    maxRetries: 1,
  });
}

export const aiModel = () => aiConfig().model;
export const aiRerankModel = () => aiConfig().rerankModel;
