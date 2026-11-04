// Read-only MCP server over the community's member memory. Bearer token = community or event admin token.
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { admin } from "@/lib/db";
import { eventFilterForAuth, resolveRequestAuth } from "@/lib/auth";
import { communityGaps, findSpeakers, searchMembers, suggestIntros } from "@/lib/mcpTools";
import { envLimit, limit } from "@/lib/ratelimit";

export const maxDuration = 60;

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

async function handle(req: Request): Promise<Response> {
  const auth = await resolveRequestAuth(req, { allowLlm: true });
  if (!auth || auth.via !== "bearer") {
    return Response.json(
      { error: "unauthorized: send an Authorization bearer token" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="convene"' } },
    );
  }

  let communityId: string | null = null;
  let scopeLabel = "event";
  const scope = eventFilterForAuth(auth);
  if (auth.scope.type === "community") {
    const { data: community, error } = await admin()
      .from("communities")
      .select("id,name")
      .eq("id", auth.scope.communityId)
      .maybeSingle();
    if (error) throw error;
    if (!community) return Response.json({ error: "unauthorized" }, { status: 401 });
    communityId = community.id;
    scopeLabel = community.name;
  } else {
    const { data: event, error } = await admin()
      .from("events")
      .select("id,name,community_id")
      .eq("id", auth.scope.eventId)
      .maybeSingle();
    if (error) throw error;
    if (!event) return Response.json({ error: "unauthorized" }, { status: 401 });
    communityId = event.community_id;
    scopeLabel = event.name;
  }
  const scopeId = auth.scope.type === "community" ? auth.scope.communityId : auth.scope.eventId;
  const minuteLimited = await limit(req, "ask-minute", { limit: envLimit("ASK_MINUTE_LIMIT", 5), windowSeconds: 60, extraKey: scopeId });
  if (minuteLimited) return minuteLimited;
  const hourLimited = await limit(req, "ask-hour", { limit: envLimit("ASK_HOUR_LIMIT", 20), windowSeconds: 3600, extraKey: scopeId });
  if (hourLimited) return hourLimited;
  const handler = createMcpHandler(
    (server) => {
      server.registerTool(
        "search_members",
        {
          title: "Search members",
          description: `Search people in ${scopeLabel} by free text or skill (e.g. "postgres", "climate investor"). Returns what they wrote, their offers/seeks tags and how many events they have been to.`,
          inputSchema: z.object({ query: z.string().min(1) }).strict(),
          annotations: { readOnlyHint: true },
        },
        async ({ query }) => text(await searchMembers(communityId, query, scope)),
      );
      server.registerTool(
        "find_speakers",
        {
          title: "Find speakers",
          description: `Find people in ${scopeLabel} who said they are happy to speak on a topic.`,
          inputSchema: z.object({ topic: z.string().min(1) }).strict(),
          annotations: { readOnlyHint: true },
        },
        async ({ topic }) => text(await findSpeakers(communityId, topic, scope)),
      );
      server.registerTool(
        "suggest_intros",
        {
          title: "Suggest intros",
          description: "For a member_id, list intros already made at events and further people across the community they should meet.",
          inputSchema: z.object({ member_id: z.string().uuid() }).strict(),
          annotations: { readOnlyHint: true },
        },
        async ({ member_id }) => text(await suggestIntros(communityId, member_id, scope)),
      );
      server.registerTool(
        "community_gaps",
        {
          title: "Community gaps",
          description: "Needs members asked for that few or no members offer (good targets for speakers, sponsors or outreach).",
          inputSchema: z.object({}).strict(),
          annotations: { readOnlyHint: true },
        },
        async () => text(await communityGaps(communityId, scope)),
      );
    },
    { serverInfo: { name: "convene", version: "0.1.0" } },
  );
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
