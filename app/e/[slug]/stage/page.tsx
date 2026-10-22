import { StageClient } from "@/components/StageClient";

export default async function StagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  return <StageClient slug={slug} mock={sp.mock === "1"} />;
}

// Per-request page (params/searchParams); allow blocking render.
export const instant = false;
