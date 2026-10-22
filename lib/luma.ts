// Luma guest CSV import. Header rules from data/research.md.
import Papa from "papaparse";
import type { JoinInput } from "./types";

export const LUMA_STANDARD = new Set([
  "api_id", "guest_id", "name", "first_name", "last_name", "email", "phone_number", "created_at",
  "approval_status", "checked_in_at", "custom_source", "qr_code_url", "amount", "amount_tax",
  "amount_discount", "currency", "coupon_code", "eth_address", "solana_address",
  "survey_response_rating", "survey_response_feedback", "ticket_type_id", "ticket_name", "utm_source",
]);

export type LumaGuest = JoinInput & { guest_id: string | null };

/** A column is free text if its non-empty values are mostly multi-word and not just yes/no or numbers. */
function isFreeText(values: string[]): boolean {
  const vals = values.map((v) => v.trim()).filter(Boolean);
  if (!vals.length) return false;
  const texty = vals.filter((v) => v.split(/\s+/).length >= 3 && !/^(yes|no|true|false|\d+([.,]\d+)?)$/i.test(v));
  return texty.length / vals.length >= 0.5;
}

export function parseLumaCsv(csv: string): { guests: LumaGuest[]; lineColumn: string | null; speakColumn: string | null } {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const custom = headers.filter((h) => !LUMA_STANDARD.has(h.trim().toLowerCase()));
  const speakColumn = custom.find((h) => /speak/i.test(h)) ?? null;
  const lineColumn =
    custom.find((h) => h !== speakColumn && isFreeText(parsed.data.map((r) => r[h] ?? ""))) ?? null;

  const guests: LumaGuest[] = [];
  for (const r of parsed.data) {
    const name = (r.name?.trim() || [r.first_name, r.last_name].filter(Boolean).join(" ").trim());
    const line = lineColumn ? (r[lineColumn] ?? "").trim() : "";
    if (!name || line.length < 3) continue;
    const contact = r.email?.trim() || r.phone_number?.trim() || null;
    guests.push({
      guest_id: r.api_id || r.guest_id || null,
      name: name.slice(0, 80),
      line: line.slice(0, 280),
      speak_on: speakColumn ? r[speakColumn]?.trim().slice(0, 160) || null : null,
      x_handle: null,
      contact,
      contact_consent: false, // Luma registration is not consent to share contact with other members
    });
  }
  return { guests, lineColumn, speakColumn };
}
