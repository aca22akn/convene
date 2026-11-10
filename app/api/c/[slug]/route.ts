import { connection } from "next/server";
import { admin } from "@/lib/db";
import { bad, json } from "@/lib/api";
import { parseDirectoryCursor } from "@/lib/directoryCursor";


/** Public community directory: one row per person with how many events they've attended. No contact details. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const db = admin();
  const { data: c, error: communityError } = await db.from("communities").select("id,name").eq("slug", slug).maybeSingle();
  if (communityError) return bad("failed to load community", 500);
  if (!c) return bad("community not found", 404);

  const params = new URL(req.url).searchParams;
  const limitParam = params.get("limit");
  const limit = limitParam === null ? 50 : Number(limitParam);
  const after = parseDirectoryCursor(params.get("cursor"));
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (params.has("cursor") && after === null)) {
    return bad("invalid pagination", 400);
  }
  const { data, error } = await db.rpc("community_people", {
    p_community: c.id,
    p_event_ids: null,
    p_limit: limit,
    p_after: after,
  });
  if (error) return bad("failed to load directory members", 500);
  const result = data as {
    total: number;
    people: { name: string; x_handle: string | null; line: string; speak_on: string | null; events_count: number }[];
    next_cursor: string | null;
  } | null;

  return json({
    community: { name: c.name },
    people: (result?.people ?? []).map((person) => ({
      name: person.name,
      x_handle: person.x_handle,
      latest_line: person.line,
      speak_on: person.speak_on,
      events_count: person.events_count,
    })),
    total: result?.total ?? 0,
    next_cursor: result?.next_cursor ?? null,
  });
}
