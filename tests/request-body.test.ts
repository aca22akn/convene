import { describe, expect, it } from "vitest";
import { readLimitedJson, readLimitedText } from "@/lib/request-body";

const chunkedRequest = (chunks: string[]) => new Request("http://localhost/api/test", {
  method: "POST",
  body: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  }),
  duplex: "half",
} as RequestInit & { duplex: "half" });

describe("bounded request body readers", () => {
  it("rejects a declared body larger than the limit before reading it", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-length": "5" },
      body: "12345",
    });

    await expect(readLimitedText(req, 4)).resolves.toEqual({ ok: false, status: 413, error: "payload_too_large" });
  });

  it("enforces the bound on a chunked body without Content-Length", async () => {
    await expect(readLimitedText(chunkedRequest(["123", "456"]), 5)).resolves.toEqual({
      ok: false,
      status: 413,
      error: "payload_too_large",
    });
  });

  it("parses bounded JSON when Content-Length is absent", async () => {
    await expect(readLimitedJson(chunkedRequest(['{"name":', '"Ada"}']), 32)).resolves.toEqual({
      ok: true,
      value: { name: "Ada" },
    });
  });

  it("rejects malformed JSON and invalid UTF-8", async () => {
    await expect(readLimitedJson(chunkedRequest(["{"]), 32)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_input",
    });
    const invalidUtf8 = new Request("http://localhost/api/test", {
      method: "POST",
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readLimitedText(invalidUtf8, 32)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "invalid_input",
    });
  });
});
