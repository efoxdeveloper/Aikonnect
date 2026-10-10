import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadApiFile } from "@/lib/api";
import { clearInboxMediaCache, loadInboxMedia } from "@/pages/inbox-media-cache";

vi.mock("@/lib/api", () => ({ downloadApiFile: vi.fn() }));

describe("inbox media cache", () => {
  afterEach(() => {
    clearInboxMediaCache();
    vi.clearAllMocks();
  });

  it("shares an in-flight download and reuses the result for the same session", async () => {
    let finishDownload: ((blob: Blob) => void) | undefined;
    vi.mocked(downloadApiFile).mockImplementation(() => new Promise((resolve) => { finishDownload = resolve; }));
    const path = "/workspaces/workspace-1/messages/message-1/media";

    const first = loadInboxMedia(path, "session-one");
    const second = loadInboxMedia(path, "session-one");
    expect(downloadApiFile).toHaveBeenCalledTimes(1);

    const blob = new Blob(["image data"], { type: "image/jpeg" });
    finishDownload?.(blob);
    await expect(first).resolves.toBe(blob);
    await expect(second).resolves.toBe(blob);
    await expect(loadInboxMedia(path, "session-one")).resolves.toBe(blob);
    expect(downloadApiFile).toHaveBeenCalledTimes(1);
  });

  it("does not reuse cached media across authenticated sessions", async () => {
    vi.mocked(downloadApiFile).mockResolvedValue(new Blob(["image data"]));
    const path = "/workspaces/workspace-1/messages/message-1/media";

    await loadInboxMedia(path, "session-one");
    await loadInboxMedia(path, "session-two");

    expect(downloadApiFile).toHaveBeenCalledTimes(2);
  });
});
