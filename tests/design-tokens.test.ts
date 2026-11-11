import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
const tokens = Object.fromEntries([...root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));

function channel(hex: string, i: number) {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Alpha-composite `top` over `bottom` (the highlighter is a translucent gold over the surface). */
function mix(top: string, alpha: number, bottom: string) {
  const out = [0, 1, 2].map((i) => Math.round(channel255(top, i) * alpha + channel255(bottom, i) * (1 - alpha)));
  return `#${out.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
const channel255 = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

describe("design tokens meet WCAG AA", () => {
  it("defines every token the system documents", () => {
    for (const name of ["ink-950", "ink-900", "ink-800", "edge", "fg", "fg-2", "fg-3", "paper", "paper-ink", "paper-2", "gold", "on-gold", "thread", "danger", "danger-solid", "ok"]) {
      expect(tokens[name], name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  const textPairs: Array<[string, string, number]> = [
    ["fg", "ink-950", 4.5], ["fg", "ink-900", 4.5], ["fg", "ink-800", 4.5],
    ["fg-2", "ink-950", 4.5], ["fg-2", "ink-900", 4.5], ["fg-2", "ink-800", 4.5],
    ["fg-3", "ink-950", 4.5], ["fg-3", "ink-900", 4.5], ["fg-3", "ink-800", 4.5],
    ["gold", "ink-950", 4.5], ["gold", "ink-800", 4.5], ["thread", "ink-900", 4.5], ["thread", "ink-800", 4.5],
    ["danger", "ink-900", 4.5], ["danger", "ink-800", 4.5], ["ok", "ink-900", 4.5],
    ["on-gold", "gold", 4.5], ["on-gold", "gold-hover", 4.5],
    ["paper-ink", "paper", 4.5], ["paper-2", "paper", 4.5],
  ];
  for (const [fg, bg, min] of textPairs) {
    it(`${fg} on ${bg} is at least ${min}:1`, () => {
      expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
    });
  }

  it("white text on the destructive button is at least 4.5:1", () => {
    expect(ratio("#ffffff", tokens["danger-solid"])).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders are at least 3:1 against their surfaces (non-text contrast)", () => {
    for (const surface of ["ink-950", "ink-900", "ink-800"]) expect(ratio(tokens.edge, tokens[surface]), surface).toBeGreaterThanOrEqual(3);
  });

  it("quoted text stays readable on the highlighter on both surfaces", () => {
    for (const surface of ["ink-900", "ink-800"]) {
      expect(ratio(tokens.fg, mix(tokens.gold, 0.34, tokens[surface])), surface).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(tokens["paper-ink"], mix(tokens.gold, 0.6, tokens.paper))).toBeGreaterThanOrEqual(4.5);
  });
});
