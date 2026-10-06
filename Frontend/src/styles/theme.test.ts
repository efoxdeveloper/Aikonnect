import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appTheme } from "@/theme";

const stylesheet = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const tailwindConfig = readFileSync(resolve(process.cwd(), "tailwind.config.js"), "utf8");

describe("app MUI theme", () => {
  it("uses the shared Inter font stack instead of MUI's default font", () => {
    expect(appTheme.typography.fontFamily).toBe("var(--font-sans)");
  });

  it("uses Inter for regular and code text without a Roboto reference", () => {
    expect(stylesheet).toContain('--font-sans: "Inter", sans-serif;');
    expect(stylesheet).toContain("code, pre, kbd, samp { font-family: var(--font-sans); }");
    expect(tailwindConfig).toContain('mono: ["Inter", "sans-serif"]');
    expect(`${stylesheet}\n${tailwindConfig}`).not.toMatch(/roboto/i);
  });
});
