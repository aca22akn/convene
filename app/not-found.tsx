import Link from "next/link";
import { Brand } from "@/components/Brand";

export const instant = false;

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-10 lg:py-16">
      <Brand />
      <section className="my-auto py-20" aria-labelledby="not-found-title">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">404</p>
        <h1 id="not-found-title" className="mt-3 text-4xl font-bold leading-tight sm:text-6xl">
          We couldn’t find that page.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/70">
          The link may be out of date, or the page may have moved.
        </p>
        <Link href="/" className="mt-8 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black">
          Return to Convene
        </Link>
      </section>
    </main>
  );
}
