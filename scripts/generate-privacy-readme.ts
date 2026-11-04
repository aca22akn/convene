import { readFileSync, writeFileSync } from "node:fs";
import { renderPrivacyReadmeSection } from "../lib/privacy";

const path = "README.md";
const start = "<!-- PRIVACY:START -->";
const end = "<!-- PRIVACY:END -->";
const readme = readFileSync(path, "utf8");
if (!readme.includes(start) || !readme.includes(end)) throw new Error("README privacy markers are missing");
writeFileSync(path, readme.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${renderPrivacyReadmeSection()}\n${end}`));
