// Read-only MCP server over the community's member memory. Bearer token = community or event admin token.
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { bearer, communityForToken } from "@/lib/api";
import { communityGaps, findSpeakers, searchMembers, suggestIntros } from "@/lib/mcpTools";

export const maxDuration = 60;

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

async function handle(req: Request): Promise<Response> {
  const community = await communityForToken(bearer(req));
  if (!community) {
    return Response.json(
      { error: "unauthorized: send Authorization: Bearer <admin token>" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="convene"' } },
    );
  }
  const cid = community.id;
  const handler = createMcpHandler(
    (server) => {
      server.registerTool(
        "search_members",
        {
          title: "Search members",
          description: `Search everyone who has attended ${community.name} events by free text or skill (e.g. "postgres", "climate investor"). Returns what they wrote, their offers/seeks tags and how many events they have been to.`,
          inputSchema: z.object({ query: z.string().min(1) }),
          annotations: { readOnlyHint: true },
        },
        async ({ query }) => text(await searchMembers(cid, query)),
      );
      server.registerTool(
        "find_speakers",
        {
          title: "Find speakers",
          description: `Find members of ${community.name} who said they are happy to speak on a topic.`,
          inputSchema: z.object({ topic: z.string().min(1) }),
          annotations: { readOnlyHint: true },
        },
        async ({ topic }) => text(await findSpeakers(cid, topic)),
      );
      server.registerTool(
        "suggest_intros",
        {
          title: "Suggest intros",
          description: "For a member_id, list intros already made at events and further people across the community they should meet.",
          inputSchema: z.object({ member_id: z.string().uuid() }),
          annotations: { readOnlyHint: true },
        },
        async ({ member_id }) => text(await suggestIntros(cid, member_id)),
      );
      server.registerTool(
        "community_gaps",
        {
          title: "Community gaps",
          description: "Needs members asked for that few or no members offer (good targets for speakers, sponsors or outreach).",
          inputSchema: z.object({}),
          annotations: { readOnlyHint: true },
        },
        async () => text(await communityGaps(cid)),
      );
    },
    { serverInfo: { name: "convene", version: "0.1.0" } },
  );
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
