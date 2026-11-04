import { JoinForm } from "@/components/JoinForm";
import { getEvent } from "@/lib/api";
import { RETENTION_DAYS_DEFAULT } from "@/lib/privacy";

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEvent(slug);
  const configuredDays = Number(process.env.RETENTION_DAYS);
  const retentionDays = Number.isSafeInteger(configuredDays) && configuredDays > 0 ? configuredDays : RETENTION_DAYS_DEFAULT;
  return <JoinForm slug={slug} aiEnabled={event?.ai_enabled === true} retentionDays={retentionDays} />;
}

// Per-request page (params/searchParams); allow blocking render.
export const instant = false;
