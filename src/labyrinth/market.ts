// The open market: players sell afterlife objects to each other for ◈.
//   sell   – pick an object from your inventory + a price → it leaves your bag
//            and goes on a stall (retained `world/sale/<id>`)
//   buy    – pay the price → the object goes into your bag; a `world/sold/<id>`
//            message tells the seller, whose game pays them (even if they were
//            offline: they're paid the next time they come in)
//   cancel – the seller takes it back (the listing is cleared)
// Listings last 7 days; an unsold object comes back to its seller.
// ◈ lives on each player's device until we have our own server, so a
// determined cheater could fake money: fine for now, fixed by the server.
import type { Presence } from "./net";
import { cleanNick } from "./nick";
import { playerId } from "./champions";
import { ITEMS, addItem, readBag, type ItemId } from "./inventory";
import { addBlood, readBlood } from "./wishes";

export type Listing = { id: string; item: ItemId; price: number; seller: string; sellerId: string; t: number; soldTo?: string; soldToId?: string };

const LIFE = 7 * 86_400_000;
const PAID_KEY = "seeface-market-paid";
const BAG_KEY = "seeface-inventory";

function takeFromBag(id: ItemId) {
  const b = readBag();
  if (!b[id]) return false;
  b[id] = b[id]! - 1;
  if (!b[id]) delete b[id];
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify(b));
  } catch {
    return false;
  }
  return true;
}

export function createMarket(presence: Presence, myNick: () => string, events: { sold: (l: Listing) => void; changed: () => void }) {
  const me = playerId();
  const listings = new Map<string, Listing>();
  let paid = new Set<string>();
  try {
    paid = new Set(JSON.parse(localStorage.getItem(PAID_KEY) ?? "[]"));
  } catch {
    // ignore
  }
  const savePaid = () => {
    try {
      localStorage.setItem(PAID_KEY, JSON.stringify([...paid].slice(-500)));
    } catch {
      // ignore
    }
  };

  // my listings: get paid for sales, take back what expired
  function settle() {
    for (const l of listings.values()) {
      if (l.sellerId !== me || paid.has(l.id)) continue;
      if (l.soldToId) {
        paid.add(l.id);
        savePaid();
        addBlood(l.price);
        events.sold(l);
      } else if (Date.now() - l.t > LIFE) {
        paid.add(l.id);
        savePaid();
        addItem(l.item);
        presence.publishWorld(`sale/${l.id}`, { gone: 1 });
      }
    }
  }

  presence.onWorld((path, d) => {
    const [kind, id] = path.split("/");
    if (!id || !/^[\w-]{4,40}$/.test(id)) return;
    if (kind === "sale") {
      if (d.gone) {
        listings.delete(id);
        events.changed();
        return;
      }
      const item = d.item as ItemId;
      const price = typeof d.price === "number" ? Math.round(d.price) : NaN;
      const seller = cleanNick(d.seller);
      if (!(item in ITEMS) || !(price >= 1 && price <= 999) || !seller || typeof d.sellerId !== "string" || typeof d.t !== "number") return;
      const prev = listings.get(id);
      listings.set(id, { id, item, price, seller, sellerId: d.sellerId.slice(0, 24), t: d.t, soldTo: prev?.soldTo, soldToId: prev?.soldToId });
    }
    if (kind === "sold" && typeof d.buyerId === "string") {
      const l = listings.get(id);
      const buyer = cleanNick(d.buyer) ?? "someone";
      if (l && !l.soldToId) Object.assign(l, { soldTo: buyer, soldToId: d.buyerId.slice(0, 24) });
      else if (!l) setTimeout(() => {
        const later = listings.get(id);
        if (later && !later.soldToId) Object.assign(later, { soldTo: buyer, soldToId: (d.buyerId as string).slice(0, 24) });
        settle();
        events.changed();
      }, 3000);
    }
    settle();
    events.changed();
  });

  return {
    /** everything for sale right now, newest first */
    open: () => [...listings.values()].filter((l) => !l.soldToId && Date.now() - l.t < LIFE).sort((a, b) => b.t - a.t),
    mine: () => [...listings.values()].filter((l) => l.sellerId === me && !paid.has(l.id)).sort((a, b) => b.t - a.t),
    isMine: (l: Listing) => l.sellerId === me,
    sell(item: ItemId, price: number) {
      const p = Math.round(price);
      if (!(p >= 1 && p <= 999) || !takeFromBag(item)) return false;
      const id = `${me}-${Date.now().toString(36)}`;
      const l: Listing = { id, item, price: p, seller: myNick(), sellerId: me, t: Date.now() };
      presence.publishWorld(`sale/${id}`, l);
      listings.set(id, l);
      events.changed();
      return true;
    },
    buy(l: Listing): "ok" | "poor" | "gone" | "own" {
      if (l.sellerId === me) return "own";
      const cur = listings.get(l.id);
      if (!cur || cur.soldToId) return "gone";
      if (readBlood() < l.price) return "poor";
      addBlood(-l.price);
      addItem(l.item);
      Object.assign(cur, { soldTo: myNick(), soldToId: me });
      presence.publishWorld(`sold/${l.id}`, { buyer: myNick(), buyerId: me, t: Date.now() });
      events.changed();
      return "ok";
    },
    cancel(l: Listing) {
      if (l.sellerId !== me || l.soldToId || paid.has(l.id)) return false;
      paid.add(l.id);
      savePaid();
      addItem(l.item);
      presence.publishWorld(`sale/${l.id}`, { gone: 1 });
      listings.delete(l.id);
      events.changed();
      return true;
    },
  };
}
