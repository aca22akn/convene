import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { aiCallAllowed, create, grok } = vi.hoisted(() => ({
  aiCallAllowed: vi.fn(async () => true), create: vi.fn(), grok: vi.fn(() => ({ chat: { completions: { create } } })),
}));
vi.mock("@/lib/ai-budget", () => ({ aiCallAllowed }));
vi.mock("@/lib/grok", () => ({ grok, GROK_MODEL: "test-model" }));

import { extract } from "@/lib/extract";
import { rerank } from "@/lib/rerank";
import { JoinInput, TAGS, type Member } from "@/lib/types";

const adversarial = JSON.parse(readFileSync("tests/fixtures/adversarial_members.json", "utf8")) as {
  members: { id: string; name: string; line: string }[];
};
const evalFixture = JSON.parse(readFileSync("data/adversarial_members.json", "utf8")) as typeof adversarial;
const member = (id: string, name: string, line: string): Member => ({
  id, event_id: "event-1", name, line, contact_consent: false, offers: [], seeks: [], topics: [], speak_topics: [],
  is_sample: false, created_at: "2026-11-04T12:00:00.000Z",
});

describe("prompt injection controls", () => {
  beforeEach(() => {
    create.mockReset();
    grok.mockClear();
    aiCallAllowed.mockReset().mockResolvedValue(true);
  });

  it("passes attacker text as untrusted JSON fields and rejects overlong input before a model call", async () => {
    expect(evalFixture).toEqual(adversarial);
    expect(adversarial.members.map((item) => item.id)).toEqual(expect.arrayContaining([
      "instruction", "tool_json", "fake_system", "too_long", "homoglyph", "cross_quote", "third_party",
    ]));
    create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ offers: ["data"], seeks: [], topics: ["data"], speak_topics: [] }) } }] });
    const row = adversarial.members.find((item) => item.id === "instruction")!;
    const result = await extract(row.line);
    const args = create.mock.calls[0]![0];
    expect(args.messages[0].content).toMatch(/untrusted attendee data/i);
    expect(JSON.parse(args.messages[1].content)).toEqual({ attendee_data: { line: row.line, speak_on: "" } });
    expect([...result.offers, ...result.seeks, ...result.topics, ...result.speak_topics].every((tag) => TAGS.includes(tag))).toBe(true);

    const tooLong = adversarial.members.find((item) => item.id === "too_long")!;
    expect(tooLong.line).toHaveLength(5000);
    expect(JoinInput.safeParse({ name: tooLong.name, line: tooLong.line }).success).toBe(false);
    expect(create).toHaveBeenCalledOnce();
  });

  it("serializes rerank profiles as untrusted JSON, clamps scores, and drops third-person quotes", async () => {
    const subjectData = adversarial.members.find((item) => item.id === "instruction")!;
    const candidateData = adversarial.members.find((item) => item.id === "tool_json")!;
    const unrelatedData = adversarial.members.find((item) => item.id === "third_party")!;
    create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ scores: [
      { candidate: "c1", score: 99.7, reasons: [{ text: "They build tools", quote: "secure data tools" }] },
      { candidate: "c2", score: -3.2, reasons: [{ text: "They build software", quote: "secure software" }] },
      { candidate: "c3", score: 10, reasons: [{ text: "A third person said this", quote: "ONLY THIRD PERSON HAS THIS PHRASE" }] },
    ] }) } }] });
    const result = await rerank(
      member("subject", subjectData.name, subjectData.line),
      [member("candidate-1", candidateData.name, candidateData.line), member("candidate-2", "Healthcare builder", "I build secure software"), member("candidate-3", "Candidate three", "Building privacy reviews")],
    );
    const args = create.mock.calls[0]![0];
    expect(args.messages[0]).toMatchObject({ role: "system" });
    expect(args.messages[0].content).toMatch(/untrusted attendee text/i);
    const payload = JSON.parse(args.messages[1].content);
    expect(payload.new_person.line).toBe(subjectData.line);
    expect(payload.candidates[0].line).toBe(candidateData.line);
    expect(unrelatedData.line).toContain("ONLY THIRD PERSON HAS THIS PHRASE");
    expect(payload.candidates.some((candidate: { line: string }) => candidate.line === unrelatedData.line)).toBe(false);
    expect(result?.get("candidate-1")?.score).toBe(10);
    expect(Number.isInteger(result?.get("candidate-1")?.score)).toBe(true);
    expect(result?.get("candidate-2")?.score).toBe(0);
    expect(result?.get("candidate-3")).toEqual({ score: 0, reasons: [] });
  });
});
