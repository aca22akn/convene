import { MeClient } from "@/components/MeClient";

export default async function MePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id : null;
  return <MeClient slug={slug} id={id} mock={sp.mock === "1"} />;
}

// Per-request page (params/searchParams); allow blocking render.
export const instant = false;
