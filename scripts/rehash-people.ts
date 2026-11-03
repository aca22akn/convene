import { SupabaseClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { admin } from "../lib/db";
import { hashPersonKey, personKeyPepper } from "../lib/people";

export type RehashPerson = {
  id: string;
  community_id: string;
  key: string;
};

export interface PeopleRehashStore {
  listPeople(afterId: string | null, limit: number): Promise<RehashPerson[]>;
  findPersonByCommunityAndKey(communityId: string, key: string): Promise<RehashPerson | null>;
  updatePersonKey(id: string, key: string): Promise<void>;
  reassignMemberPeople(fromPersonId: string, toPersonId: string): Promise<void>;
  deletePerson(id: string): Promise<void>;
}

export class PeopleRehashError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "PeopleRehashError";
  }
}

export type RehashOptions = {
  pepper: string;
  dryRun: boolean;
  pageSize?: number;
};

export type RehashSummary = {
  scanned: number;
  rehashed: number;
  merged: number;
  skipped: number;
};

const DEFAULT_PAGE_SIZE = 500;

/** Rehashes legacy identifiers with keyset pagination so deletes cannot skip later rows. */
export async function rehashPeople(store: PeopleRehashStore, options: RehashOptions): Promise<RehashSummary> {
  const { pepper, dryRun } = options;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!pepper.trim()) throw new Error("PERSON_KEY_PEPPER must not be empty");
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("pageSize must be a positive integer");

  const summary: RehashSummary = { scanned: 0, rehashed: 0, merged: 0, skipped: 0 };
  let afterId: string | null = null;

  while (true) {
    const rows = await store.listPeople(afterId, pageSize);
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1].id;

    for (const person of rows) {
      summary.scanned += 1;
      if (person.key.startsWith("h1:")) {
        summary.skipped += 1;
        continue;
      }

      const hashedKey = hashPersonKey(person.key, pepper);
      const existing = await store.findPersonByCommunityAndKey(person.community_id, hashedKey);
      if (existing && existing.id !== person.id) {
        if (!dryRun) await mergePerson(store, person.id, existing.id);
        summary.merged += 1;
        continue;
      }

      if (dryRun) {
        summary.rehashed += 1;
        continue;
      }

      try {
        await store.updatePersonKey(person.id, hashedKey);
        summary.rehashed += 1;
      } catch (error) {
        if (!(error instanceof PeopleRehashError) || error.code !== "23505") throw error;
        const collision = await store.findPersonByCommunityAndKey(person.community_id, hashedKey);
        if (!collision || collision.id === person.id) throw error;
        await mergePerson(store, person.id, collision.id);
        summary.merged += 1;
      }
    }
  }

  return summary;
}

async function mergePerson(store: PeopleRehashStore, fromPersonId: string, toPersonId: string): Promise<void> {
  await store.reassignMemberPeople(fromPersonId, toPersonId);
  await store.deletePerson(fromPersonId);
}

class SupabasePeopleRehashStore implements PeopleRehashStore {
  constructor(private readonly db: SupabaseClient) {}

  async listPeople(afterId: string | null, limit: number): Promise<RehashPerson[]> {
    let query = this.db.from("people").select("id,community_id,key").order("id").limit(limit);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new PeopleRehashError(error.message, error.code);
    return (data ?? []) as unknown as RehashPerson[];
  }

  async findPersonByCommunityAndKey(communityId: string, key: string): Promise<RehashPerson | null> {
    const { data, error } = await this.db
      .from("people")
      .select("id,community_id,key")
      .eq("community_id", communityId)
      .eq("key", key)
      .maybeSingle();
    if (error) throw new PeopleRehashError(error.message, error.code);
    return (data as unknown as RehashPerson | null) ?? null;
  }

  async updatePersonKey(id: string, key: string): Promise<void> {
    const { error } = await this.db.from("people").update({ key }).eq("id", id);
    if (error) throw new PeopleRehashError(error.message, error.code);
  }

  async reassignMemberPeople(fromPersonId: string, toPersonId: string): Promise<void> {
    const { error } = await this.db.from("members").update({ person_id: toPersonId }).eq("person_id", fromPersonId);
    if (error) throw new PeopleRehashError(error.message, error.code);
  }

  async deletePerson(id: string): Promise<void> {
    const { error } = await this.db.from("people").delete().eq("id", id);
    if (error) throw new PeopleRehashError(error.message, error.code);
  }
}

async function main(): Promise<void> {
  const unexpectedArgs = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
  if (unexpectedArgs.length > 0) throw new Error(`Unknown argument: ${unexpectedArgs[0]}`);

  const dryRun = process.argv.includes("--dry-run");
  const pepper = personKeyPepper({ requireConfigured: true });
  const summary = await rehashPeople(new SupabasePeopleRehashStore(admin()), {
    pepper,
    dryRun,
  });
  console.log(`${dryRun ? "Dry run" : "Rehash complete"}: ${JSON.stringify(summary)}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : null;
const scriptPath = path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (invokedPath === scriptPath) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown rehash failure";
    console.error(`People key rehash failed: ${message}`);
    process.exitCode = 1;
  });
}
