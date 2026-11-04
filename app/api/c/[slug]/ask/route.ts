import { z } from "zod";
import { admin } from "@/lib/db";
import { eventFilterForAuth, originMatches, resolveRequestAuth, storeAccessToken, LLM_TOKEN_TTL_SECONDS } from "@/lib/auth";
import { bad, json } from "@/lib/api";
import { grok, GROK_MODEL } from "@/lib/grok";
import { communityGaps, findSpeakers, searchMembers } from "@/lib/mcpTools";
import { envLimit, limit } from "@/lib/ratelimit";
import { aiCallAllowed } from "@/lib/ai-budget";
import { bodyErrorResponse, readLimitedJson } from "@/lib/request-body";

export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(2).max(500) }).strict();

const INSTRUCTIONS =
  "You help an organiser understand members in the authorised event or community scope. Use the convene MCP tools to look up real members; " +
  "only name people the tools return, quote what they wrote, and say how many events they've attended. Be brief (under 150 words). " +
  "Never invent people or contact details.";

/** "Ask your community": Grok answers using our own MCP server as a remote tool. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const raw = await readLimitedJson(req, 2 * 1024);
  if (!raw.ok) return bodyErrorResponse(raw);
  const parsed = Body.safeParse(raw.value);
  if (!parsed.success) return bad("invalid input");
  const { question } = parsed.data;
  const { slug } = await ctx.params;
  const auth = await resolveRequestAuth(req);
  if (auth?.via === "cookie" && !originMatches(req)) return bad("origin mismatch", 403);
  const { data: c } = await admin().from("communities").select("id,slug,name").eq("slug", slug).maybeSingle();
  if (!auth || !c) return bad("unauthorized", 401);

  const memberScope = eventFilterForAuth(auth);
  let aiEnabled = false;
  if (auth.scope.type === "community") {
    if (auth.scope.communityId !== c.id) return bad("unauthorized", 401);
    let eventsQuery = admin().from("events").select("id,ai_enabled").eq("community_id", c.id);
    if (memberScope.eventIds) eventsQuery = eventsQuery.in("id", memberScope.eventIds);
    const { data: events } = await eventsQuery;
    aiEnabled = (events ?? []).some((event) => event.ai_enabled === true);
  } else {
    const { data: event } = await admin().from("events").select("id,community_id,ai_enabled").eq("id", auth.scope.eventId).maybeSingle();
    if (!event || event.community_id !== c.id) return bad("unauthorized", 401);
    aiEnabled = event.ai_enabled === true;
  }

  const scopeId = auth.scope.type === "community" ? auth.scope.communityId : auth.scope.eventId;
  const minuteLimited = await limit(req, "ask-minute", { limit: envLimit("ASK_MINUTE_LIMIT", 5), windowSeconds: 60, extraKey: scopeId });
  if (minuteLimited) return minuteLimited;
  const hourLimited = await limit(req, "ask-hour", { limit: envLimit("ASK_HOUR_LIMIT", 20), windowSeconds: 3600, extraKey: scopeId });
  if (hourLimited) return hourLimited;

  const client = aiEnabled ? grok() : null;
  const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const remote = !/localhost|127\.0\.0\.1/.test(base);
  if (client && remote && await aiCallAllowed(scopeId)) {
    try {
      const llmToken = await storeAccessToken(auth.scope, "llm", LLM_TOKEN_TTL_SECONDS);
      const res = await client.responses.create({
        model: GROK_MODEL,
        instructions: INSTRUCTIONS,
        input: question,
        tools: [{ type: "mcp", server_url: `${base}/api/mcp`, server_label: "convene", authorization: llmToken, require_approval: "never" }],
      });
      if (res.output_text) return json({ answer: res.output_text, via: "grok+mcp" });
    } catch (e) {
      console.warn("[ask] remote MCP call failed, falling back:", (e as Error).message);
    }
  }

  // Fallback: call the same MCP tool functions directly, then let Grok (or a plain formatter) answer.
  const resultScope = aiEnabled ? { ...memberScope, aiEnabledOnly: true, excludeAiOptOut: true } : memberScope;
  const [people, speakers, gaps] = await Promise.all([
    searchMembers(c.id, question, resultScope),
    findSpeakers(c.id, question, resultScope),
    communityGaps(c.id, resultScope),
  ]);
  const context = { search_members: people.slice(0, 10), find_speakers: speakers.slice(0, 5), community_gaps: gaps };
  if (client && await aiCallAllowed(scopeId)) {
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
