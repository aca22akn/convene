import { Brand } from "@/components/Brand";
import { PrivacyNotice } from "@/components/ui";
import { privacyNotice, RETENTION_DAYS_DEFAULT } from "@/lib/privacy";

export const instant = false;

export default function PrivacyPage() {
  const configuredDays = Number(process.env.RETENTION_DAYS);
  const retentionDays = Number.isSafeInteger(configuredDays) && configuredDays > 0 ? configuredDays : RETENTION_DAYS_DEFAULT;
  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-6 lg:py-10">
      <Brand />
      <h1 className="mt-8 text-4xl font-extrabold leading-[1.1] tracking-tight">Privacy and data use</h1>
      <p className="mt-3 text-lg text-fg-2">The event organiser chooses whether external AI is enabled. Attendees can also opt out of AI processing.</p>
      <section className="card mt-8 p-5 sm:p-6" aria-labelledby="privacy-ai-on">
        <h2 id="privacy-ai-on" className="text-xl font-bold">When event AI is enabled</h2>
        <PrivacyNotice items={privacyNotice(true, retentionDays)} className="mt-4 text-fg-2" />
      </section>
      <section className="card mt-5 p-5 sm:p-6" aria-labelledby="privacy-ai-off">
        <h2 id="privacy-ai-off" className="text-xl font-bold">When event AI is disabled</h2>
        <PrivacyNotice items={privacyNotice(false, retentionDays)} className="mt-4 text-fg-2" />
      </section>
    </main>
  );
}
