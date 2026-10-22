import { Brand } from "@/components/Brand";
import { CreateEvent } from "@/components/CreateEvent";

const STEPS = [
  ["Scan", "The organiser puts a QR on the screen. People scan it on arrival."],
  ["Write one line", "“Building X, need Y”, plus optional X handle, talk topic and contact."],
  ["Meet", "In about 10 seconds each phone shows up to 2 people to meet, with reasons that quote what both wrote."],
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 lg:py-16">
      <Brand />
      <h1 className="mt-10 text-4xl font-bold leading-tight sm:text-6xl">The 30-second member intake for live community events.</h1>
      <p className="mt-5 max-w-2xl text-lg text-white/70">
        Find out who your members are, introduce them to each other, and find speakers among them. Open source, self-hosted, works on top of Luma and
        WhatsApp.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href="/e/demo/stage" className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black">Open the live demo</a>
        <a href="/e/demo" className="rounded-xl border border-white/15 px-5 py-3 font-semibold">Join the demo event</a>
        <a href="https://github.com/aca22akn/convene" className="rounded-xl border border-white/15 px-5 py-3 font-semibold text-white/70">Source (MIT)</a>
      </div>

      <ol className="mt-14 grid gap-4 sm:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-emerald-400">{i + 1}</p>
            <p className="mt-1 text-xl font-semibold">{t}</p>
            <p className="mt-2 text-white/65">{d}</p>
          </li>
        ))}
      </ol>

      <CreateEvent />
    </main>
  );
}
