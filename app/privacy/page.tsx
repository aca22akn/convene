import { privacyNotice, RETENTION_DAYS_DEFAULT } from "@/lib/privacy";

function NoticeList({ aiEnabled, retentionDays }: { aiEnabled: boolean; retentionDays: number }) {
  return <ul className="mt-4 list-disc space-y-3 pl-6">{privacyNotice(aiEnabled, retentionDays).map((line) => <li key={line}>{line}</li>)}</ul>;
}

export const instant = false;

export default function PrivacyPage() {
  const configuredDays = Number(process.env.RETENTION_DAYS);
  const retentionDays = Number.isSafeInteger(configuredDays) && configuredDays > 0 ? configuredDays : RETENTION_DAYS_DEFAULT;
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-bold">Privacy and data use</h1>
      <p className="mt-3 text-white/70">The event organiser chooses whether external AI is enabled. Attendees can also opt out of AI processing.</p>
      <section className="mt-8 rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-semibold">When event AI is enabled</h2>
        <NoticeList aiEnabled retentionDays={retentionDays} />
      </section>
      <section className="mt-5 rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-semibold">When event AI is disabled</h2>
        <NoticeList aiEnabled={false} retentionDays={retentionDays} />
      </section>
    </main>
  );
}
