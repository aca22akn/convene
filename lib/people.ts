// Community memory: the same person across events is keyed by normalised X handle, else contact.
import { admin } from "./db";

export function personKey(p: { x_handle?: string | null; contact?: string | null }): string | null {
  const x = p.x_handle?.trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").toLowerCase();
  if (x) return "x:" + x;
  const c = p.contact?.trim().toLowerCase();
  if (!c) return null;
  if (c.includes("@")) return "c:" + c;
  const digits = c.replace(/\D/g, "");
  if (digits.length >= 7) return "c:" + digits.replace(/^0/, "44"); // UK 07… and +44 7… collapse together
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
