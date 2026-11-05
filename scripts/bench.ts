import os from "node:os";
import { performance } from "node:perf_hooks";
import { planIntros } from "../lib/recompute";
import { TAGS, type Member, type Tag } from "../lib/types";

type Counts = { propertyReads: number };

function syntheticMember(index: number, counts: Counts): Member {
  const offers: Tag[] = [TAGS[index % TAGS.length]];
  const seeks: Tag[] = [TAGS[(index + 1) % TAGS.length]];
  const topics: Tag[] = index % 4 === 0 ? [TAGS[(index + 7) % TAGS.length]] : [];
  const read = () => { counts.propertyReads++; };
  return {
    id: `bench-${String(index).padStart(4, "0")}`,
    event_id: "bench-event",
    name: `Synthetic ${index}`,
    line: `Synthetic member ${index} offers ${offers[0]} and seeks ${seeks[0]}`,
    get offers() { read(); return offers; },
    get seeks() { read(); return seeks; },
    get topics() { read(); return topics; },
    speak_topics: [],
    contact_consent: false,
    is_sample: false,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function main() {
  const cpu = os.cpus()[0]?.model ?? "unknown CPU";
  process.stdout.write(`Machine: ${os.platform()} ${os.release()} (${process.arch}), ${cpu}\n`);
  process.stdout.write("Synthetic benchmark; plan times are indicative. Database commit timing is CI-only because this run does not connect to a database.\n");
  process.stdout.write("members\tplan median (ms)\tdb commit (ms)\tpair evaluations\n");

  for (const size of [50, 100, 200, 500]) {
    const counts: Counts = { propertyReads: 0 };
    const members = Array.from({ length: size }, (_, index) => syntheticMember(index, counts));
    const timings: number[] = [];
    let plannedCount = 0;

    // Warm the runtime, then report the median of nine full pure planning passes.
    for (let run = 0; run < 10; run++) {
      counts.propertyReads = 0;
      const start = performance.now();
      const planned = planIntros(members, []);
      const elapsed = performance.now() - start;
      plannedCount = planned.length;
      if (run > 0) timings.push(elapsed);
      const pairEvaluations = Math.max(0, (counts.propertyReads - 6 * size - 6 * plannedCount) / 6);
      if (run === 9) {
        process.stdout.write(`${size}\t${median(timings).toFixed(2)}\tCI-only\t${pairEvaluations.toFixed(0)}\n`);
      }
    }
  }
}

main();
