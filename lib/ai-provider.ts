export function aiProviderName(): string {
  return process.env.AI_PROVIDER_NAME?.trim() || "xAI";
}
