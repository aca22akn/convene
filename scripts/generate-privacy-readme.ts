import { readFileSync, writeFileSync } from "node:fs";
import { renderDataProviderSection, renderPrivacyReadmeSection } from "../lib/privacy";

function replaceGeneratedSection(path: string, start: string, end: string, contents: string) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(start) || !source.includes(end)) throw new Error(`${path} generated-section markers are missing`);
  writeFileSync(path, source.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${contents}\n${end}`));
}

replaceGeneratedSection("README.md", "<!-- PRIVACY:START -->", "<!-- PRIVACY:END -->", renderPrivacyReadmeSection());
replaceGeneratedSection("docs/DATA.md", "<!-- AI-PROVIDER:START -->", "<!-- AI-PROVIDER:END -->", renderDataProviderSection());
