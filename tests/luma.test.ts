import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLumaCsv } from "@/lib/luma";

const csv = readFileSync(path.join(__dirname, "..", "data", "sample_luma_export.csv"), "utf8");

describe("parseLumaCsv", () => {
  const { guests, lineColumn, speakColumn } = parseLumaCsv(csv);

  it("detects the free-text question column as the line and the speak column", () => {
    expect(lineColumn).toBe("What are you building, and what do you need?");
    expect(speakColumn).toBe("Happy to speak on (optional)");
  });

  it("maps rows to members without consenting their contact", () => {
    expect(guests.length).toBeGreaterThan(5);
    const priya = guests.find((g) => g.name === "Priya Raman")!;
    expect(priya.line).toMatch(/^Building a carbon-accounting API/);
    expect(priya.speak_on).toBe("Climate tech data pipelines");
    expect(priya.guest_id).toBe("gst-sample001");
    expect(priya.contact).toBe("priya.raman@example.com");
    expect(priya.contact_consent).toBe(false);
  });

  it("accepts guest_id and first/last name columns", () => {
    const alt = 'guest_id,first_name,last_name,email,approval_status,Favourite colour,Tell us what you are working on\n' +
      'g1,Ada,Lovelace,ada@example.com,approved,blue,"Building an analytics engine, need a backend engineer"\n';
    const r = parseLumaCsv(alt);
    expect(r.lineColumn).toBe("Tell us what you are working on");
    expect(r.guests[0]).toMatchObject({ name: "Ada Lovelace", guest_id: "g1" });
  });
});
