// SEEFACE1 SHOWS: how the world pays for itself (owner, 2026-10-07: "it's a
// virtual world for artists · artist pays to make a show"). Everyone creates
// for free; an artist pays to turn their place (or the theater) into a show
// night the whole world is pointed at. Prices are the owner's to set: these
// are proposals shown as "planned", and nothing here takes money. Booking
// requests go to the API (server /api/show-requests) only when one is hosted;
// interest is always counted in GoatCounter (`show-interest-<pack>`).
//
// To put a show on: add it to SHOWS below and deploy. While it's on, every
// player sees a "● live" chip that takes them there for free.

export type Pack = { id: "room" | "opening" | "headliner" | "residency"; name: string; price: string; per: string; lines: string[]; hot?: boolean };

export const PACKS: Pack[] = [
  {
    id: "room",
    name: "your room",
    price: "free",
    per: "while the opening lasts",
    lines: ["claim a room in the labyrinth", "the architect builds it: style, colours, stage, shelves, screens", "your name and instagram on every door", "visits and ♥ counted on the door", "your own link: seeface1.world/labyrinth?place=…"],
  },
  {
    id: "opening",
    name: "opening night",
    price: "€29",
    per: "one night",
    hot: true,
    lines: ["a ● live chip for everyone in the world during your show", "free teleport to your room for every player", "your place pinned first in explore for 24 h", "your poster on corridor walls for 24 h", "a 6-second video of your room for your stories"],
  },
  {
    id: "headliner",
    name: "headliner",
    price: "€99",
    per: "one night",
    lines: ["the theater for a night: your name on the stage", "everything in opening night", "your own track on 66.6 after life fm during the show", "a promo reel of your night, ready for instagram"],
  },
  {
    id: "residency",
    name: "residency",
    price: "€249",
    per: "a month",
    lines: ["a big hall in the front row, built with custom pieces", "a weekly show night", "your posters and your track in rotation all month", "monthly numbers: visits, ♥, who came back"],
  },
];

/** the founding offer (the owner confirms before it goes live) */
export const FOUNDING = "founding artists: the first 20 who book get their opening night on us.";

export type Show = {
  id: string;
  title: string;
  artist: string;
  /** a plot id (r<I>_<J>) or a place by world metres */
  at: string | { x: number; z: number; name: string };
  /** ISO time it starts */
  start: string;
  hours: number;
};

/** booked shows (the owner adds them here) */
export const SHOWS: Show[] = [];

export function liveShow(now = Date.now()) {
  return SHOWS.find((s) => {
    const t0 = Date.parse(s.start);
    return now >= t0 && now < t0 + s.hours * 3_600_000;
  }) ?? null;
}

export function nextShows(now = Date.now()) {
  return SHOWS.filter((s) => Date.parse(s.start) + s.hours * 3_600_000 > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
