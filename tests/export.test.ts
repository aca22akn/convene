import { describe, expect, it } from "vitest";
import { buildIntrosCsv, buildMembersCsv, buildVcf, toCsv } from "@/lib/export";
import { JoinInput } from "@/lib/types";
import ICAL from "ical.js";
import Papa from "papaparse";
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
    expect(csv).toContain("Yes Email,Yes Phone,0.9,Both like Postgres");
  });

  it("escapes formula-leading CSV strings while preserving numeric cells", () => {
    const strings = [
      '=HYPERLINK("http://x","y")', "+cmd|' /C calc'!A0", "@SUM(1+1)", "\t=1+1", "-2+3",
    ];
    const csv = buildMembersCsv(strings.map((name) => m({ name })));
    const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true });
    expect(parsed.errors).toEqual([]);
    for (const row of parsed.data.slice(1)) {
      for (const cell of row) expect(cell.trimStart()).not.toMatch(/^[=+\-@\t\r]/);
    }
    const arrayCell = Papa.parse<string[]>(toCsv(["tags"], [[strings]]), { delimiter: ",", skipEmptyLines: true });
    expect(arrayCell.errors).toEqual([]);
    expect(arrayCell.data[1]?.[0]?.split(";").every((cell) => !cell.trimStart().match(/^[=+\-@\t\r]/))).toBe(true);
    const numeric = Papa.parse<string[]>(toCsv(["value"], [[-2]]), { delimiter: ",", skipEmptyLines: true });
    expect(numeric.errors).toEqual([]);
    expect(numeric.data[1]?.[0]).toBe("-2");
  });

  it("rejects invalid handles and keeps CRLF payloads inside exactly one parsed card", () => {
    const base = { name: "A", line: "Building a safe export", contact: "a@example.com", contact_consent: true };
    expect(JoinInput.safeParse({ ...base, x_handle: "valid_name" }).success).toBe(true);
    expect(JoinInput.safeParse({ ...base, x_handle: "safe\r\nBEGIN:VCARD" }).success).toBe(false);

    const payload = m({
      name: "Name\r\nX-INJECTED:yes",
      line: "Building tools\r\nBEGIN:VCARD\r\nFN:Injected",
      x_handle: "good\r\nURL:https://attacker.example",
      contact: "victim@example.com\r\nBEGIN:VCARD",
      contact_consent: true,
    });
    const vcf = buildVcf([payload], "Meetup\r\nEND:VCARD\r\nBEGIN:VCARD");
    const cardCount = vcf.split("\r\n").filter((line) => line === "BEGIN:VCARD").length;
    const card = ICAL.parse(vcf);
    expect(cardCount).toBe(1);
    expect(card[0]).toBe("vcard");
    const propertyNames = (card[1] as unknown[][]).map((property) => property[0]);
    expect(propertyNames).toEqual(["version", "fn", "n", "email", "note"]);
    expect(JSON.stringify(card)).toContain("\\nX-INJECTED:yes");
    for (const line of vcf.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });
});
