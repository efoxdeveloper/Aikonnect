import { describe, expect, it } from "vitest";
import { parseWalletEventFrame } from "./wallet-events";

describe("wallet SSE event parsing", () => {
  it("recognizes wallet updates across CRLF and ignores ready events and comments", () => {
    expect(parseWalletEventFrame("event: wallet.updated\r\ndata: {}\r\n\r\n")).toBe("wallet.updated");
    expect(parseWalletEventFrame("event: wallet.ready\ndata: {}\n\n")).toBeNull();
    expect(parseWalletEventFrame(": keep-alive\n\n")).toBeNull();
  });
});
