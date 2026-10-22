import { admin } from "@/lib/db";
import { bad, getEvent, json, PUBLIC_MEMBER_COLS } from "@/lib/api";
import type { Intro, Member, MeView } from "@/lib/types";


export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return bad("missing or invalid id");
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const db = admin();
  const { data: me } = await db.from("members").select("id,name,line").eq("id", id).eq("event_id", ev.id).maybeSingle();
  if (!me) return bad("member not found", 404);
  const { data: intros } = await db
    .from("intros")
    .select("*")
    .eq("event_id", ev.id)
    .or(`a_id.eq.${id},b_id.eq.${id}`)
    .order("score", { ascending: false });
  const list = (intros ?? []) as Intro[];
  const otherIds = list.map((i) => (i.a_id === id ? i.b_id : i.a_id));
  const others = otherIds.length
    ? (((await db.from("members").select(PUBLIC_MEMBER_COLS).in("id", otherIds)).data ?? []) as unknown as Member[])
    : [];
  const byId = new Map(others.map((m) => [m.id, m]));
  const view: MeView = {
    member: me as MeView["member"],
    matches: list.flatMap((i) => {
      const o = byId.get(i.a_id === id ? i.b_id : i.a_id);
      return o ? [{ member: { id: o.id, name: o.name, line: o.line, x_handle: o.x_handle ?? null }, reasons: i.reasons }] : [];
    }),
  };
  return json(view);
}
