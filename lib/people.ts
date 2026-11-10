// Community memory: the same person across events is keyed by normalised X handle, else contact.
import { createHmac } from "node:crypto";
import { admin } from "./db";

const DEVELOPMENT_PEPPER = "convene-local-person-key-pepper-not-for-production";

if (process.env.NODE_ENV === "production" && !process.env.PERSON_KEY_PEPPER?.trim()) {
  throw new Error("Missing required PERSON_KEY_PEPPER");
}

export function personKeyPepper(options: { requireConfigured?: boolean } = {}): string {
  const pepper = process.env.PERSON_KEY_PEPPER?.trim();
  if (pepper) return pepper;
  if (options.requireConfigured || process.env.NODE_ENV === "production") {
    throw new Error("Missing required PERSON_KEY_PEPPER");
  }
  return DEVELOPMENT_PEPPER;
}

export function hashPersonKey(normalizedKey: string, pepper = personKeyPepper()): string {
  return `h1:${createHmac("sha256", pepper).update(normalizedKey, "utf8").digest("hex")}`;
}

export function personKey(p: { x_handle?: string | null; contact?: string | null }): string | null {
  const x = p.x_handle?.trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").toLowerCase();
  if (x) return hashPersonKey("x:" + x);
  const c = p.contact?.trim().toLowerCase();
  if (!c) return null;
  if (c.includes("@")) return hashPersonKey("c:" + c);
  const digits = c.replace(/\D/g, "");
  if (digits.length >= 7) return hashPersonKey("c:" + digits.replace(/^0/, "44")); // UK 07… and +44 7… collapse together
  return null;
}

export async function upsertPerson(communityId: string, key: string, name: string): Promise<string> {
  const db = admin();
  const { data, error } = await db
    .from("people")
    .upsert({ community_id: communityId, key, name }, { onConflict: "community_id,key" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
