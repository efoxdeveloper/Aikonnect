import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

describe("global interaction accessibility", () => {
  it("keeps hover enhancements pointer-aware and preserves reduced-motion support", () => {
    expect(stylesheet).toContain("@media (hover: hover) and (pointer: fine)");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain("transition-duration: .01ms !important");
    expect(stylesheet).toContain("button:focus-visible");
  });

  it("uses zinc-100 for the authenticated content background", () => {
    expect(stylesheet).toMatch(/--page-background:\s*#f4f4f5;/);
  });
});
