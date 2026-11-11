import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Eyebrow } from "@/components/ui";

export const instant = false;

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-6 lg:py-10">
      <Brand />
      <section className="my-auto py-16" aria-labelledby="not-found-title">
        <Eyebrow>404</Eyebrow>
        <h1 id="not-found-title" className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
          We couldn’t find that page.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-fg-2">
          The link may be out of date, or the page may have moved. If an event sent you here, ask the organiser for a fresh link.
        </p>
        <Link href="/" className="btn btn-primary btn-lg mt-8">
          Return to Convene
        </Link>
      </section>
    </main>
  );
}
