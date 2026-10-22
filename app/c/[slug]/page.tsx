import { DirectoryClient } from "@/components/DirectoryClient";

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  return <DirectoryClient slug={slug} mock={sp.mock === "1"} />;
}

// Per-request page (params/searchParams); allow blocking render.
export const instant = false;
