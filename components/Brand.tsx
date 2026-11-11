import Link from "next/link";

/** Two people, one thread between them: the whole product in a mark. */
export function BrandMark({ className = "h-5 w-7", onPaper = false }: { className?: string; onPaper?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 20" className={className} fill="none">
      <path d="M8 10h12" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="6" cy="10" r="5" fill={onPaper ? "var(--paper-ink)" : "var(--paper)"} />
      <circle cx="22" cy="10" r="5" fill="var(--gold)" />
    </svg>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className={`inline-flex min-h-11 items-center gap-2.5 font-bold tracking-tight text-fg ${small ? "text-lg" : "text-xl"}`}>
      <BrandMark />
      Convene
    </Link>
  );
}
