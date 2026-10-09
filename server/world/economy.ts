// Coins beyond the basics, owned rooms, gifts and coin packs. Milestone 6 fills this in.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store } from "./store.ts";

export function createEconomy(_deps: { store: Store; sessions: Map<string, unknown>; credit: (...a: never[]) => unknown; send: (...a: never[]) => unknown; ownedRoomState: (id: string) => unknown }) {
  return {
    onHello(_s: unknown, _isNew: boolean, _ref?: string) {},
    onMessage(_s: unknown, _m: { t: string }) {},
    async http(_req: IncomingMessage, _res: ServerResponse, _url: URL) {
      return false;
    },
  };
}
