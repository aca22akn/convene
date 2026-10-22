import { OrganiserClient } from "@/components/OrganiserClient";

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
  return <OrganiserClient slug={slug} token={token} mock={sp.mock === "1"} />;
}

// Per-request page (params/searchParams); allow blocking render.
export const instant = false;
