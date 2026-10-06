import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const tailwindConfig = readFileSync(resolve(process.cwd(), "tailwind.config.js"), "utf8");

describe("global interaction accessibility", () => {
  it("keeps hover enhancements pointer-aware and preserves reduced-motion support", () => {
    expect(stylesheet).toContain("@media (hover: hover) and (pointer: fine)");
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain("transition-duration: .01ms !important");
    expect(stylesheet).toContain("button:focus-visible");
  });

  it("uses a darker neutral gray for the connected sidebar and navbar", () => {
    expect(stylesheet).toMatch(/--sidebar-rail-background:\s*#e8eae8;/);
    expect(stylesheet).toMatch(/--page-background:\s*#ffffff;/);
  });

  it("uses WATI's green palette for the application brand and emerald utilities", () => {
    expect(stylesheet).toMatch(/--brand:\s*#23a455;/);
    expect(stylesheet).toMatch(/--green-500:\s*#23a455;/);
    expect(stylesheet).toMatch(/--brand-soft:\s*#ebf7f0;/);
    expect(tailwindConfig).toContain('500: "#23a455"');
    expect(tailwindConfig).toContain('900: "#105029"');
  });
});
