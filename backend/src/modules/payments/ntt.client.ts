import { Ntt } from "@paypilot/ntt";

let client: Ntt | undefined;

export function getNttClient(): Ntt {
  client ??= new Ntt();
  return client;
}

export function resetNttClientForTests(): void {
  client = undefined;
}
