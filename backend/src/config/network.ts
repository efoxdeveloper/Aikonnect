import { setDefaultResultOrder } from "node:dns";

/** Prefer IPv4 when a host publishes IPv6 that is not routable from the server. */
export function configureNetworkResolution(): void {
  setDefaultResultOrder("ipv4first");
}
