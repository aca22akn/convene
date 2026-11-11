import Link from "next/link";
import { Brand } from "@/components/Brand";
import { CreateEvent } from "@/components/CreateEvent";
import { IntroCard } from "@/components/IntroCard";
import { Eyebrow } from "@/components/ui";
import { aiAvailable, aiProviderName } from "@/lib/grok";
import { sampleIntro } from "@/lib/mocks";

const STEPS = [
  ["Scan", "Guests scan the QR code on your projector."],
  ["Write one line", "“Building X, need Y.” Contact details are optional."],
  ["Meet", "About 10 seconds later each phone shows up to 2 intros."],
];

export const instant = false;

export default function Home() {
  return (
    <main id="main" className="group/home mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-2 sm:px-6 lg:px-10">
      <header className="flex items-center justify-between">
        <Brand />
        <a href="https://github.com/aca22akn/convene" className="btn btn-ghost">Source (MIT)</a>
      </header>

      <div className="mt-3 grid gap-8 lg:mt-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-x-16 lg:gap-y-10">
        <div className="lg:col-start-1 lg:row-start-1">
          <Eyebrow>For live community events</Eyebrow>
          <h1 className="mt-3 text-[2.125rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.75rem]">
            Tell every guest who to meet, and why.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-fg-2 lg:text-xl">
            Guests scan a QR, write one line, and about 10 seconds later each phone shows up to 2 people to meet, with reasons that quote what both wrote.
          </p>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <CreateEvent aiAvailable={aiAvailable()} aiProviderName={aiProviderName()} />
          <p className="mt-4 px-1 text-fg-2 group-has-[[data-created]]/home:hidden">
            Just looking? Try the{" "}
            <Link href="/e/demo/stage" className="font-semibold text-thread underline underline-offset-4">sample event stage</Link>{" "}
            or{" "}
            <Link href="/e/demo" className="font-semibold text-thread underline underline-offset-4">join the sample event</Link>.
          </p>
        </div>

        <section aria-labelledby="sample-title" className="lg:col-start-1 lg:row-start-2 group-has-[[data-created]]/home:hidden">
          <h2 id="sample-title" className="sr-only">What each guest sees</h2>
          <IntroCard match={sampleIntro.match} myLine={sampleIntro.myLine} label="Example intro for a guest (fictional people)" showLinks={false} headingLevel={3} />
        </section>
      </div>

      <ol className="mt-12 grid gap-4 border-t group-has-[[data-created]]/home:hidden border-ink-700 pt-8 sm:grid-cols-3" aria-label="How it works">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span aria-hidden="true" className="font-serif text-4xl italic leading-none text-gold">{i + 1}</span>
            <div>
              <p className="text-lg font-bold">{title}</p>
              <p className="text-fg-2">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-1 text-fg-3">
        <p>Open source and self-hosted. Works alongside Luma and WhatsApp.</p>
        <Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold text-fg-2 underline underline-offset-4">Privacy and data use</Link>
      </footer>
    </main>
  );
}
