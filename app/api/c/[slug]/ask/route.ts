import { z } from "zod";
import { admin } from "@/lib/db";
import { bad, communityForToken, json } from "@/lib/api";
import { grok, GROK_MODEL } from "@/lib/grok";
import { communityGaps, findSpeakers, searchMembers } from "@/lib/mcpTools";

export const maxDuration = 60;

const Body = z.object({ token: z.string().min(1), question: z.string().trim().min(2).max(500) });

const INSTRUCTIONS =
  "You help a London community organiser understand their members. Use the convene MCP tools to look up real members; " +
  "only name people the tools return, quote what they wrote, and say how many events they've attended. Be brief (under 150 words). " +
  "Never invent people or contact details.";

/** "Ask your community": Grok answers using our own MCP server as a remote tool. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("invalid input");
  const { token, question } = parsed.data;
  const community = await communityForToken(token);
  const { data: c } = await admin().from("communities").select("id,slug").eq("slug", slug).maybeSingle();
  if (!community || !c || community.id !== c.id) return bad("unauthorized", 401);

  const client = grok();
  const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const remote = !/localhost|127\.0\.0\.1/.test(base);
  if (client && remote) {
    try {
      const res = await client.responses.create({
        model: GROK_MODEL,
        instructions: INSTRUCTIONS,
        input: question,
        tools: [{ type: "mcp", server_url: `${base}/api/mcp`, server_label: "convene", authorization: token, require_approval: "never" }],
      });
      if (res.output_text) return json({ answer: res.output_text, via: "grok+mcp" });
    } catch (e) {
      console.warn("[ask] remote MCP call failed, falling back:", (e as Error).message);
    }
  }

  // Fallback: call the same MCP tool functions directly, then let Grok (or a plain formatter) answer.
  const [people, speakers, gaps] = await Promise.all([
    searchMembers(c.id, question),
    findSpeakers(c.id, question),
    communityGaps(c.id),
  ]);
  const context = { search_members: people.slice(0, 10), find_speakers: speakers.slice(0, 5), community_gaps: gaps };
  if (client) {
    try {
      const res = await client.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: INSTRUCTIONS + " Tool results are given as JSON." },
          { role: "user", content: `Question: ${question}\n\nTool results:\n${JSON.stringify(context)}` },
        ],
      });
      const answer = res.choices[0]?.message?.content;
      if (answer) return json({ answer, via: "grok+tools" });
    } catch (e) {
      console.warn("[ask] grok fallback failed:", (e as Error).message);
    }
  }
  const lines = [
    people.length ? "Matching members:" : "No members matched that question.",
    ...people.slice(0, 5).map((p) => `• ${p.name} — "${p.line}" (seen at ${p.seen_at_events} event${p.seen_at_events === 1 ? "" : "s"})`),
    ...(speakers.length ? ["Possible speakers:", ...speakers.slice(0, 3).map((s) => `• ${s.name} — ${s.speak_on}`)] : []),
  ];
  return json({ answer: lines.join("\n"), via: "tools" });
}
