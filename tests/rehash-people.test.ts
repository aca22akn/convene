import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personKey } from "@/lib/people";
import { rehashPeople, type PeopleRehashStore, type RehashPerson } from "@/scripts/rehash-people";

type MemberRef = { id: string; person_id: string };

class MemoryPeopleStore implements PeopleRehashStore {
  people: RehashPerson[];
  members: MemberRef[];

  constructor(people: RehashPerson[], members: MemberRef[]) {
    this.people = structuredClone(people);
    this.members = structuredClone(members);
  }

  async listPeople(afterId: string | null, limit: number): Promise<RehashPerson[]> {
    return this.people
      .filter((person) => afterId === null || person.id > afterId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((person) => ({ ...person }));
  }

  async findPersonByCommunityAndKey(communityId: string, key: string): Promise<RehashPerson | null> {
    const person = this.people.find((candidate) => candidate.community_id === communityId && candidate.key === key);
    return person ? { ...person } : null;
  }

  async updatePersonKey(id: string, key: string): Promise<void> {
    const person = this.people.find((candidate) => candidate.id === id);
    if (!person) throw new Error(`missing person ${id}`);
    if (this.people.some((candidate) => candidate.id !== id && candidate.community_id === person.community_id && candidate.key === key)) {
      throw new Error("unique constraint violation");
    }
    person.key = key;
  }

  async reassignMemberPeople(fromPersonId: string, toPersonId: string): Promise<void> {
    for (const member of this.members) {
      if (member.person_id === fromPersonId) member.person_id = toPersonId;
    }
  }

  async deletePerson(id: string): Promise<void> {
    this.people = this.people.filter((person) => person.id !== id);
  }
}

describe("rehash-people", () => {
  const pepper = "test-only-person-key-pepper";

  beforeEach(() => vi.stubEnv("PERSON_KEY_PEPPER", pepper));
  afterEach(() => vi.unstubAllEnvs());

  function fixture() {
    const hashedAlice = personKey({ x_handle: "@alice" });
    if (!hashedAlice) throw new Error("expected a person key");
    return new MemoryPeopleStore(
      [
        { id: "person-1", community_id: "community-1", key: "x:alice" },
        { id: "person-2", community_id: "community-1", key: hashedAlice },
        { id: "person-3", community_id: "community-2", key: "c:alice@example.com" },
        { id: "person-4", community_id: "community-2", key: "h1:already-migrated" },
      ],
      [
        { id: "member-1", person_id: "person-1" },
        { id: "member-2", person_id: "person-2" },
        { id: "member-3", person_id: "person-3" },
      ],
    );
  }

  it("supports a no-write dry run and safely reports an existing hash collision", async () => {
    const store = fixture();
    const beforePeople = structuredClone(store.people);
    const beforeMembers = structuredClone(store.members);

    const report = await rehashPeople(store, { pepper, dryRun: true, pageSize: 2 });

    expect(report).toEqual({ scanned: 4, rehashed: 1, merged: 1, skipped: 2 });
    expect(store.people).toEqual(beforePeople);
    expect(store.members).toEqual(beforeMembers);
  });

  it("moves member references on a hash collision and is safe to rerun", async () => {
    const store = fixture();

    const first = await rehashPeople(store, { pepper, dryRun: false, pageSize: 2 });

    expect(first).toEqual({ scanned: 4, rehashed: 1, merged: 1, skipped: 2 });
    expect(store.people.find((person) => person.id === "person-1")).toBeUndefined();
    expect(store.members.find((member) => member.id === "member-1")?.person_id).toBe("person-2");
    expect(store.people.find((person) => person.id === "person-3")?.key).toBe(personKey({ contact: "alice@example.com" }));

    const second = await rehashPeople(store, { pepper, dryRun: false, pageSize: 2 });
    expect(second).toEqual({ scanned: 3, rehashed: 0, merged: 0, skipped: 3 });
  });
});
