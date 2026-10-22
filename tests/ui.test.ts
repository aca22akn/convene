import { describe, expect, it } from "vitest";
import { splitQuote, headlineQuote, tagRows, firstName } from "@/lib/ui";

describe("splitQuote", () => {
  it("highlights an exact substring", () => {
    expect(splitQuote("Building X, need Y", "need Y")).toEqual([
      { text: "Building X, ", quoted: false },
      { text: "need Y", quoted: true },
    ]);
  });
  it("leaves text alone when the quote is missing or not a substring", () => {
    expect(splitQuote("abc", null)).toEqual([{ text: "abc", quoted: false }]);
    expect(splitQuote("abc", "zzz")).toEqual([{ text: "abc", quoted: false }]);
  });
});

describe("headlineQuote", () => {
  it("prefers the first grounded quote", () => {
    expect(
      headlineQuote([
        { text: "t1", quote: null, grounded: false },
        { text: "t2", quote: "need Y", grounded: true },
      ]),
    ).toBe("“need Y”");
  });
  it("falls back to reason text", () => {
    expect(headlineQuote([{ text: "both into climate", quote: null, grounded: false }])).toBe("both into climate");
    expect(headlineQuote([])).toBe("");
  });
});

describe("tagRows", () => {
  it("merges and sorts by demand", () => {
    const rows = tagRows({ backend: 3, design: 1 }, { design: 4, vc: 2 });
    expect(rows.map((r) => r.tag)).toEqual(["backend", "design", "vc"]);
    expect(rows[1]).toEqual({ tag: "design", needs: 1, offers: 4 });
  });
});

describe("firstName", () => {
  it("takes the first word", () => expect(firstName("  Dr Amara Mensah")).toBe("Dr"));
});
