import { afterEach, describe, expect, it, vi } from "vitest";

type Schema = {
  type?: string;
  properties?: Readonly<Record<string, Schema>>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: Schema;
};

function assertStrictObjects(schema: Schema): void {
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required ?? []].sort()).toEqual(Object.keys(properties).sort());
    for (const property of Object.values(properties)) assertStrictObjects(property);
  }
  if (schema.type === "array" && schema.items) assertStrictObjects(schema.items);
}

describe("AI provider configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to xAI and retains legacy XAI environment-variable fallbacks", async () => {
    vi.stubEnv("AI_PROVIDER_NAME", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_MODEL", "");
    vi.stubEnv("AI_RERANK_MODEL", "");
    vi.stubEnv("XAI_API_KEY", "legacy-key");
    vi.stubEnv("XAI_BASE_URL", "https://legacy.example/v1");
    vi.stubEnv("XAI_MODEL", "legacy-model");
    vi.stubEnv("XAI_RERANK_MODEL", "legacy-rerank");
    const { aiConfig } = await import("@/lib/grok");

    expect(aiConfig()).toEqual({
      providerName: "xAI",
      apiKey: "legacy-key",
      baseURL: "https://legacy.example/v1",
      model: "legacy-model",
      rerankModel: "legacy-rerank",
    });
  });

  it("prefers provider-neutral variables", async () => {
    vi.stubEnv("AI_PROVIDER_NAME", "OpenAI");
    vi.stubEnv("AI_API_KEY", "provider-key");
    vi.stubEnv("AI_BASE_URL", "https://api.openai.com/v1");
    vi.stubEnv("AI_MODEL", "provider-model");
    vi.stubEnv("AI_RERANK_MODEL", "provider-rerank");
    vi.stubEnv("XAI_API_KEY", "legacy-key");
    const { aiConfig } = await import("@/lib/grok");

    expect(aiConfig()).toEqual({
      providerName: "OpenAI",
      apiKey: "provider-key",
      baseURL: "https://api.openai.com/v1",
      model: "provider-model",
      rerankModel: "provider-rerank",
    });
  });

  it("uses fully strict schemas for extraction and reranking", async () => {
    const { EXTRACTION_SCHEMA } = await import("@/lib/extract");
    const { RERANK_SCHEMA } = await import("@/lib/rerank");

    assertStrictObjects(EXTRACTION_SCHEMA);
    assertStrictObjects(RERANK_SCHEMA);
  });
});
