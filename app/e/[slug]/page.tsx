import { JoinForm } from "@/components/JoinForm";

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <JoinForm slug={slug} />;
}

// Per-request page (params/searchParams); allow blocking render.
export const instant = false;
