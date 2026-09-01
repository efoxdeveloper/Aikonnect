import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
import { afterEach } from "vitest";

afterEach(cleanup);

class ResizeObserverMock {
  constructor(private readonly callback: (...entries: unknown[]) => void) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 1000, height: 760 } }], this);
  }
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

class DOMMatrixReadOnlyMock {
  readonly m22: number;

  constructor(transform?: string) {
    const values = transform?.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(",").map(Number);
    this.m22 = values?.[3] || 1;
  }
}

Object.defineProperty(globalThis, "DOMMatrixReadOnly", { configurable: true, writable: true, value: DOMMatrixReadOnlyMock });

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const matches = query.includes("max-width: 767px")
        ? window.innerWidth <= 767
        : query.includes("max-width: 1199px")
          ? window.innerWidth <= 1199
          : false;
      return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
    },
  });
}
