import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/index.css"),
  "utf8",
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".tsx")
        ? [path]
        : [];
  });
}

describe("global typography", () => {
  it("uses Inter with consistent rendering defaults", () => {
    expect(stylesheet).toContain("family=Inter:wght@400;500;600;700");
    expect(stylesheet).toContain('--font-sans: "Inter"');
    expect(stylesheet).toContain("font-family: var(--font-sans)");
    expect(stylesheet).toContain("-moz-osx-font-smoothing: grayscale");
    expect(stylesheet).toContain("font-kerning: normal");
    expect(stylesheet).not.toContain("Rubik");
  });

  it("uses the global single-line paragraph style", () => {
    const paragraphStyles = stylesheet.match(/p\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(paragraphStyles).toMatch(/font-size:\s*14px;/);
    expect(paragraphStyles).toMatch(/font-weight:\s*400;/);
    expect(paragraphStyles).toMatch(/text-overflow:\s*ellipsis;/);
    expect(paragraphStyles).toMatch(/white-space:\s*nowrap;/);
    expect(paragraphStyles).not.toMatch(/\bcolor\s*:/);
    expect(stylesheet).toMatch(/\[role="alert"\]\s*\{\s*color:\s*var\(--danger\);\s*\}/);
  });

  it("uses the Contact Hub title typography for global h3 headings", () => {
    const headingStyles = stylesheet.match(/h3\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(headingStyles).toMatch(/font-family:\s*var\(--font-sans\);/);
    expect(headingStyles).toMatch(/font-size:\s*15px;/);
    expect(headingStyles).toMatch(/font-weight:\s*500;/);
    expect(headingStyles).toMatch(/line-height:\s*1\.25;/);
  });

  it("does not override global paragraph typography with Tailwind utilities", () => {
    const forbidden = /(?:text-(?!(?:left|center|right|justify|start|end)(?:\s|["'`}]))|font-|leading-|tracking-|whitespace-|overflow-|line-clamp-|(?:min-|max-)?w-|mb-|select-|\btruncate\b|\bitalic\b|\bnot-italic\b)/;
    const violations = sourceFiles(resolve(process.cwd(), "src"))
      .flatMap((file) => {
        const openings = readFileSync(file, "utf8").match(/<p\b[\s\S]*?>/g) ?? [];
        return openings.filter((opening) => forbidden.test(opening)).map((opening) => `${file}: ${opening}`);
      });
    expect(violations).toEqual([]);
  });

  it("uses paragraph typography for Contact Hub table data", () => {
    expect(stylesheet).toMatch(/\.contact-data-table tbody td\s*\{[\s\S]*?font-size:\s*14px;/);
    expect(stylesheet).toMatch(/\.contact-data-table tbody td\s*\{[\s\S]*?font-weight:\s*400;/);
    expect(stylesheet).toMatch(/\.contact-data-table tbody td\s*\{[\s\S]*?color:\s*rgb\(34, 34, 34\);/);
    expect(stylesheet).toMatch(/\.contact-data-table tbody td\s*\{[\s\S]*?white-space:\s*nowrap;/);
  });

  it("uses paragraph typography throughout Contact Hub filters", () => {
    expect(stylesheet).toMatch(/\.contact-filter-toolbar button,[\s\S]*?font-size:\s*14px;/);
    expect(stylesheet).toMatch(/\.contact-filter-toolbar button,[\s\S]*?font-weight:\s*400;/);
    expect(stylesheet).toMatch(/\.contact-filter-toolbar button,[\s\S]*?color:\s*rgb\(34, 34, 34\);/);
    expect(stylesheet).toMatch(/\.contact-filter-toolbar \.contact-filter-primary-action\s*\{[\s\S]*?color:\s*#ffffff;/);
  });

  it("keeps Inter sidebar labels vertically clear while truncating long text", () => {
    const sidebarMenuItem = readFileSync(resolve(process.cwd(), "src/components/layout/SidebarMenuItem.tsx"), "utf8");
    expect(sidebarMenuItem).toContain("truncate leading-5");
    expect(sidebarMenuItem).not.toContain("truncate leading-none");
  });
});
