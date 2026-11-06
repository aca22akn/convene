import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { privacyNotice, renderDataProviderSection, renderPrivacyReadmeSection } from "@/lib/privacy";

describe("shared privacy notice", () => {
  it("mentions xAI only for events with AI enabled", () => {
    expect(privacyNotice(true).join(" ")).toContain("xAI");
    expect(privacyNotice(false).join(" ")).not.toContain("xAI");
  });

  it("uses a non-default configured provider in notices and generated documentation", () => {
    const provider = "OpenAI";
    expect(privacyNotice(true, 365, provider).join(" ")).toContain(provider);
    expect(renderPrivacyReadmeSection(365, provider)).toContain(provider);
    expect(renderDataProviderSection(provider)).toContain(`Sent to ${provider}`);
  });

  it("covers collected data, visibility, consent, deletion, and retention for both states", () => {
    const enabled = privacyNotice(true).join(" ");
    const disabled = privacyNotice(false).join(" ");
    for (const text of [enabled, disabled]) {
      expect(text).toContain("name and your line");
      expect(text).toContain("first name");
      expect(text).toContain("contact");
      expect(text).toContain("directory");
      expect(text).toContain("organiser can delete");
      expect(text).toContain("365 days");
    }
  });

  it("snapshots both event-specific notice states", () => {
    expect(privacyNotice(false)).toMatchInlineSnapshot(`
      [
        "We collect your name, your one-line profile, optional X handle and speaker topic, and contact details only when you provide them.",
        "Your name and your line appear to people you are matched with. The room screen shows your first name and a quote from your line.",
        "Contact details are shared with the organiser only if you consent.",
        "The public directory shows your profile only if you opt in.",
        "The organiser can delete event data at any time.",
        "External AI processing is off for this event (\`ai_enabled\` is off); matching uses basic keyword extraction and tag-only matching.",
        "Event data is retained for 365 days, then deleted automatically.",
      ]
    `);
    expect(privacyNotice(true)).toMatchInlineSnapshot(`
      [
        "We collect your name, your one-line profile, optional X handle and speaker topic, and contact details only when you provide them.",
        "Your name and your line appear to people you are matched with. The room screen shows your first name and a quote from your line.",
        "Contact details are shared with the organiser only if you consent.",
        "The public directory shows your profile only if you opt in.",
        "The organiser can delete event data at any time.",
        "When event AI is enabled (\`ai_enabled\`), your name, line, X handle, and speaker topic may be processed by xAI for matching and Ask unless you set \`ai_opt_out\`. If you opt out, only basic keyword matching is used and your text is excluded from AI prompts.",
        "Event data is retained for 365 days, then deleted automatically.",
      ]
    `);
  });

  it("keeps the generated README privacy copy in sync and rejects the old claim", () => {
    const readme = readFileSync("README.md", "utf8");
    const start = "<!-- PRIVACY:START -->";
    const end = "<!-- PRIVACY:END -->";
    const section = readme.split(start)[1]?.split(end)[0]?.trim();
    expect(section).toBe(renderPrivacyReadmeSection());
    const dataStart = "<!-- AI-PROVIDER:START -->";
    const dataEnd = "<!-- AI-PROVIDER:END -->";
    const dataDocs = readFileSync("docs/DATA.md", "utf8");
    expect(dataDocs.split(dataStart)[1]?.split(dataEnd)[0]?.trim()).toBe(renderDataProviderSection());
    const oldClaim = ["Nothing", "is sent to anyone"].join(" ");
    const root = process.cwd();
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return files(target);
      return /\.(md|ts|tsx|js|mjs|json)$/.test(entry.name) ? [target] : [];
    });
    const productFiles = ["README.md", ...["app", "components", "data", "docs", "lib", "scripts", "tests"].flatMap((dir) => files(path.join(root, dir)))];
    const trackedText = productFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(trackedText).not.toContain(oldClaim);
  });
});
