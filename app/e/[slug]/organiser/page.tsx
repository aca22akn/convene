import { OrganiserClient } from "@/components/OrganiserClient";
import { LegacyTokenExchange } from "@/components/LegacyTokenExchange";
import { aiProviderName } from "@/lib/grok";

export default async function OrganiserPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (token) return <LegacyTokenExchange returnTo={`/e/${encodeURIComponent(slug)}/organiser`} />;
  return <OrganiserClient slug={slug} mock={sp.mock === "1"} aiProviderName={aiProviderName()} />;
}

// Per-request page (params/searchParams); allow blocking render.
export const instant = false;
