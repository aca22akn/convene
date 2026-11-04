// Pure builders for organiser downloads.
import type { Intro, Member } from "./types";

const vEsc = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

function foldVCardLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > 75) {
      output.push(current);
      current = " ";
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  output.push(current);
  return output;
}

/** vCard 3.0 for members who ticked "share my contact". Everyone else is skipped. */
export function buildVcf(members: Pick<Member, "name" | "line" | "contact" | "contact_consent" | "x_handle">[], eventName: string): string {
  const cards: string[] = [];
  for (const m of members) {
    if (!m.contact_consent || !m.contact?.trim()) continue;
    const c = m.contact.trim();
    const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vEsc(m.name)}`, `N:${vEsc(m.name)};;;;`];
    if (c.includes("@")) lines.push(`EMAIL;TYPE=INTERNET:${vEsc(c)}`);
    else lines.push(`TEL;TYPE=CELL:${c.replace(/[^\d+]/g, "")}`);
    const handle = m.x_handle?.replace(/^@/, "");
    if (handle && /^[A-Za-z0-9_]{1,15}$/.test(handle)) lines.push(`URL:${vEsc(`https://x.com/${encodeURIComponent(handle)}`)}`);
    lines.push(`NOTE:${vEsc(`${m.line} (met at ${eventName})`)}`, "END:VCARD");
    cards.push(lines.flatMap(foldVCardLine).join("\r\n"));
  }
  return cards.join("\r\n") + (cards.length ? "\r\n" : "");
}

function csvString(value: string): string {
  return /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : Array.isArray(v)
    ? v.map((item) => typeof item === "string" ? csvString(item) : item == null ? "" : String(item)).join(";")
    : typeof v === "string" ? csvString(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** members.csv — contact is only included for consenting members. */
export function buildMembersCsv(members: Member[]): string {
  return toCsv(
    ["name", "line", "x_handle", "speak_on", "contact", "offers", "seeks", "topics", "speak_topics", "joined_at"],
    members.map((m) => [
      m.name, m.line, m.x_handle, m.speak_on, m.contact_consent ? m.contact : "",
      m.offers, m.seeks, m.topics, m.speak_topics, m.created_at,
    ]),
  );
}

export function buildIntrosCsv(intros: Intro[], members: Pick<Member, "id" | "name">[]): string {
  const name = new Map(members.map((m) => [m.id, m.name]));
  return toCsv(
    ["person_a", "person_b", "score", "reason_1", "reason_2", "created_at"],
    intros.map((i) => [
      name.get(i.a_id) ?? i.a_id, name.get(i.b_id) ?? i.b_id, i.score,
      i.reasons[0]?.text ?? "", i.reasons[1]?.text ?? "", i.created_at,
    ]),
  );
}
