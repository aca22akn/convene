import { describe, expect, it } from "vitest";
import { insertMembers } from "@/lib/intake";
import { createCommunity, createEvent, createMember, service } from "./helpers";

describe("Luma import source identity", () => {
  it("keeps member count stable on re-import, updates changed lines, and preserves intros", async () => {
    const community = await createCommunity();
    const event = await createEvent(community.id);
    try {
      const guest = {
        name: "Luma Guest", line: "Building a climate data platform", source_guest_id: "luma:integration-guest-1",
        contact_consent: false, directory_consent: false, ai_opt_out: false,
      };
      const first = await insertMembers(event, [guest], 1, { aiEnabled: false });
      expect(first.imported).toHaveLength(1);
      const importedId = first.imported[0]!;
      const other = await createMember(event.id);
      const [a_id, b_id] = [importedId, other.id].sort();
      const { error: introError } = await service.from("intros").insert({
        event_id: event.id, a_id, b_id, score: 0.75, reasons: [{ text: "Fixture reason", quote: null, grounded: false }],
      });
      if (introError) throw introError;

      const unchanged = await insertMembers(event, [guest], 1, { aiEnabled: false });
      const { count: afterRepeat, error: repeatCountError } = await service.from("members")
        .select("id", { count: "exact", head: true }).eq("event_id", event.id);
      if (repeatCountError) throw repeatCountError;
      expect(unchanged.imported).toEqual([]);
      expect(unchanged.results[0]).toMatchObject({ ok: true, changed: false, extraction: "skipped" });
      expect(afterRepeat).toBe(2);

      const updated = await insertMembers(event, [{ ...guest, line: "Building a climate data platform for care teams" }], 1, { aiEnabled: false });
      expect(updated.imported).toEqual([importedId]);
      const { data: saved, error: savedError } = await service.from("members").select("id,line,source_guest_id").eq("id", importedId).single();
      if (savedError) throw savedError;
      expect(saved).toMatchObject({ id: importedId, line: "Building a climate data platform for care teams", source_guest_id: guest.source_guest_id });
      const { data: intros, error: introsError } = await service.from("intros").select("a_id,b_id,score,reasons").eq("event_id", event.id);
      if (introsError) throw introsError;
      expect(intros).toEqual([{ a_id, b_id, score: 0.75, reasons: [{ text: "Fixture reason", quote: null, grounded: false }] }]);
    } finally {
      await service.from("communities").delete().eq("id", community.id);
    }
  });
});
