import Link from "next/link";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className={`font-semibold tracking-tight ${small ? "text-lg" : "text-2xl"}`}>
      <span className="text-emerald-400">●</span> Convene
    </Link>
  );
}
