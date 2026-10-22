import { describe, expect, it } from "vitest";
import { groundReasons, isGrounded } from "@/lib/ground";

const a = { line: "Building a carbon-accounting API for SMEs, need a Python backend engineer who knows Postgres at scale" };
const b = { line: "Building an open-source Postgres sharding tool, need real-world users to stress-test it" };

describe("grounding", () => {
  it("accepts an exact substring of either line", () => {
    expect(isGrounded("Postgres at scale", a, b)).toBe(true);
    expect(isGrounded("need real-world users", a, b)).toBe(true);
  });
  it("rejects paraphrases, case changes, and tiny quotes", () => {
    expect(isGrounded("Postgres at large scale", a, b)).toBe(false);
    expect(isGrounded("postgres at scale", a, b)).toBe(false);
    expect(isGrounded("API", a, b)).toBe(false);
    expect(isGrounded("", a, b)).toBe(false);
    expect(isGrounded(null, a, b)).toBe(false);
  });
  it("keeps only grounded reasons, max 2", () => {
    const out = groundReasons(
      [
        { text: "She needs Postgres skills", quote: "knows Postgres at scale" },
        { text: "Made up", quote: "loves Kubernetes" },
        { text: "He needs users", quote: "need real-world users to stress-test it" },
        { text: "Third grounded", quote: "carbon-accounting API" },
      ],
      a,
      b,
    );
    expect(out.map((r) => r.text)).toEqual(["She needs Postgres skills", "He needs users"]);
    expect(out.every((r) => r.grounded)).toBe(true);
  });
});
