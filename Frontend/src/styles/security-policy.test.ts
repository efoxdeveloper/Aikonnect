import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webConfig = readFileSync(resolve(process.cwd(), "public/web.config"), "utf8");

describe("frontend content security policy", () => {
  it("allows the Twemoji host used by international phone flags", () => {
    expect(webConfig).toMatch(/img-src[^;]*https:\/\/cdnjs\.cloudflare\.com/);
  });

  it("allows the scoped hosts used by Google sign-in assets", () => {
    expect(webConfig).toMatch(/script-src[^;]*https:\/\/accounts\.google\.com/);
    expect(webConfig).toMatch(/connect-src[^;]*https:\/\/accounts\.google\.com[^;]*https:\/\/oauth2\.googleapis\.com/);
    expect(webConfig).toMatch(/frame-src[^;]*https:\/\/accounts\.google\.com/);
    expect(webConfig).toMatch(/img-src[^;]*https:\/\/\*\.gstatic\.com[^;]*https:\/\/\*\.googleusercontent\.com/);
  });
});
