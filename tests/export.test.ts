import { describe, expect, it } from "vitest";
import { buildIntrosCsv, buildMembersCsv, buildVcf } from "@/lib/export";
import type { Member } from "@/lib/types";

const m = (over: Partial<Member>): Member => ({
  id: over.name ?? "x", event_id: "e", name: "X", line: "Building things, need help", x_handle: null, speak_on: null,
  contact: null, contact_consent: false, offers: [], seeks: [], topics: [], speak_topics: [], is_sample: false,
  created_at: "2026-10-22T19:00:00Z", ...over,
});

describe("contacts.vcf", () => {
  const members = [
    m({ name: "Yes Email", contact: "yes@example.com", contact_consent: true, x_handle: "yes" }),
    m({ name: "Yes Phone", contact: "+44 7700 900123", contact_consent: true }),
    m({ name: "No Consent", contact: "no@example.com", contact_consent: false }),
    m({ name: "Consent No Contact", contact: null, contact_consent: true }),
  ];
  const vcf = buildVcf(members, "Demo Night");

  it("includes only members who consented and gave a contact", () => {
    expect(vcf.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(vcf).toContain("FN:Yes Email");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET:yes@example.com");
    expect(vcf).toContain("TEL;TYPE=CELL:+447700900123");
    expect(vcf).not.toContain("no@example.com");
    expect(vcf).not.toContain("Consent No Contact");
    expect(vcf).toContain("met at Demo Night");
  });

  it("members.csv hides contact for non-consenting members and escapes commas", () => {
    const csv = buildMembersCsv(members);
    expect(csv).not.toContain("no@example.com");
    expect(csv).toContain('"Building things, need help"');
  });

  it("intros.csv uses names and reasons", () => {
    const csv = buildIntrosCsv(
      [{ event_id: "e", a_id: "Yes Email", b_id: "Yes Phone", score: 0.9, reasons: [{ text: "Both like Postgres", quote: null, grounded: false }] }],
      members,
    );
    expect(csv).toContain("Yes Email,Yes Phone,0.900,Both like Postgres");
  });
});
