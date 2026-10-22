import { afterEach, describe, expect, it } from "vitest";
import { keywordExtract } from "@/lib/keywords";
import { extract } from "@/lib/extract";
import { personKey } from "@/lib/people";
import { TAGS } from "@/lib/types";

describe("keywordExtract", () => {
  it("splits offers and seeks around 'need'", () => {
    const e = keywordExtract(
      "Building a carbon-accounting API for SMEs, need a Python backend engineer who knows Postgres at scale",
      "Climate tech data pipelines",
    );
    expect(e.seeks).toContain("backend");
    expect(e.seeks).toContain("databases");
    expect(e.offers).toContain("climate");
    expect(e.speak_topics).toContain("climate");
    expect(e.speak_topics).toContain("data");
  });

  it("maps NHS / clinical safety / angel to vocabulary tags", () => {
    expect(keywordExtract("Building an AI triage assistant for NHS GP surgeries, need a clinical safety officer").seeks).toContain(
      "clinical-safety",
    );
    expect(keywordExtract("Building an AI triage assistant for NHS GP surgeries, need a clinical safety officer").offers).toContain(
      "healthtech",
    );
    expect(keywordExtract("Building a robotics startup for warehouse picking, need a hardware-savvy angel investor").seeks).toEqual(
      expect.arrayContaining(["hardware", "angel-investing"]),
    );
  });

  it("only emits tags from the fixed vocabulary", () => {
    const e = keywordExtract("Building an open-source Postgres sharding tool, need real-world users to stress-test it");
    for (const t of [...e.offers, ...e.seeks, ...e.topics]) expect(TAGS).toContain(t);
    expect(e.offers).toEqual(expect.arrayContaining(["open-source", "databases"]));
  });
});

describe("extract", () => {
  const saved = process.env.XAI_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = saved;
  });

  it("falls back to keywords with no API key", async () => {
    delete process.env.XAI_API_KEY;
    const e = await extract("Building a podcast on London startup stories, need founders with honest failure stories");
    expect(e.source).toBe("keywords");
    expect(e.offers).toContain("podcasting");
  });
});

describe("personKey", () => {
  it("normalises X handles and contacts", () => {
    expect(personKey({ x_handle: "@Priya_R" })).toBe("x:priya_r");
    expect(personKey({ x_handle: "https://x.com/Priya_R" })).toBe("x:priya_r");
    expect(personKey({ contact: " Priya@Example.com " })).toBe("c:priya@example.com");
    expect(personKey({ contact: "07700 900123" })).toBe(personKey({ contact: "+44 7700 900123" }));
    expect(personKey({})).toBeNull();
  });
});
