import { describe, expect, it } from "vitest";
import { JoinInput } from "@/lib/types";

describe("JoinInput directory consent", () => {
  const base = { name: "Priya Raman", line: "Building a useful tool and looking for design feedback" };

  it("defaults public directory consent to false", () => {
    const result = JoinInput.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.directory_consent).toBe(false);
  });

  it("keeps directory consent separate from contact consent", () => {
    const result = JoinInput.safeParse({ ...base, directory_consent: true, contact_consent: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.directory_consent).toBe(true);
      expect(result.data.contact_consent).toBe(false);
    }
  });
});
