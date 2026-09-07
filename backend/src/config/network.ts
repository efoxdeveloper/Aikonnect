import { setDefaultResultOrder } from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

export const META_CONNECT_TIMEOUT_MS = 60_000;

/** Prefer IPv4 when a host publishes IPv6 that is not routable from the server. */
export function configureNetworkResolution(): void {
  setDefaultResultOrder("ipv4first");
  // Node's built-in fetch (Undici) has a separate 10-second connect timeout.
  // Meta can take longer to establish TLS from some Windows hosting networks;
  // the request-level timeout alone cannot extend this socket timeout.
  setGlobalDispatcher(new Agent({
    connect: { timeout: META_CONNECT_TIMEOUT_MS },
    headersTimeout: META_CONNECT_TIMEOUT_MS,
    bodyTimeout: META_CONNECT_TIMEOUT_MS,
  }));
}
