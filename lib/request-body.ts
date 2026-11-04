export type BodyReadError = { ok: false; status: 400 | 413; error: "invalid_input" | "payload_too_large" };
export type BodyReadResult<T> = { ok: true; value: T } | BodyReadError;

export async function readLimitedText(req: Request, maxBytes: number): Promise<BodyReadResult<string>> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) return { ok: false, status: 400, error: "invalid_input" };
    if (length > maxBytes) return { ok: false, status: 413, error: "payload_too_large" };
  }
  if (!req.body) return { ok: true, value: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, status: 400, error: "invalid_input" };
  }
}

export async function readLimitedJson(req: Request, maxBytes: number): Promise<BodyReadResult<unknown>> {
  const text = await readLimitedText(req, maxBytes);
  if (!text.ok) return text;
  try { return { ok: true, value: JSON.parse(text.value) as unknown }; }
  catch { return { ok: false, status: 400, error: "invalid_input" }; }
}

export function bodyErrorResponse(result: BodyReadError): Response {
  return Response.json({ error: result.error }, { status: result.status });
}
