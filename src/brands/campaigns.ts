// Brand campaigns: everything a brand needs to appear in the world, in ONE
// object. Adding a brand = adding an entry here (that's the "easy integration"
// promised on /brands). The world reads it for:
//   - wall posters in the corridors (`posters`)
//   - a branded place: a café hall in the maze (`cafe`)
//   - what you can buy there, for ◈ only (`menu`, never real money)
//   - a link that drops players straight at the brand's place (`?brand=<id>`)
//
// LICENSING: a real brand's name only shows when `licensed` is true (a signed
// deal). Until then the live site shows the neutral `house` look, and the
// brand's own name shows only in pitch mode (`?pitch=<id>`, and in dev builds)
// so the owner can record a mock-up for the pitch. Never use a brand's logo
// file unless the brand supplied it under the deal (`logo`).

export type MenuItem =
  | { id: string; kind: "teleport"; cards: number; price: number; name: string; note: string }
  | { id: string; kind: "coffee"; price: number; name: string; note: string };

export type Campaign = {
  id: string;
  /** the real brand (shown only when licensed, or in pitch mode) */
  brand: string;
  /** shown on the live site until there's a deal */
  house: string;
  licensed: boolean;
  /** brand colours: deep, accent, cream */
  colors: { deep: string; accent: string; cream: string };
  /** corridor poster lines: [title, sub, call to action] ({brand} is replaced) */
  posters: [string, string, string][];
  /** the café's sign + its tagline */
  cafe: { sign: string; tagline: string };
  menu: MenuItem[];
  /** the brand-supplied logo file in public/brands/ (shown only when licensed) */
  logo?: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "starbucks",
    brand: "Starbucks",
    house: "the coffee house",
    licensed: true, // owner 2026-10-07: agreed with the brand (a promo for them)
    logo: "starbucks.svg",
    colors: { deep: "#00382b", accent: "#00a862", cream: "#f2ead8" },
    posters: [
      ["{brand}", "coffee in the after life", "east of the entrance · open now"],
      ["a warm cup", "in the cold labyrinth", "{brand} · open now"],
      ["teleports", "now served at {brand}", "⟡ buy with ◈"],
      ["stay awake", "the dark king never sleeps", "{brand} · east"],
    ],
    cafe: { sign: "{brand}", tagline: "coffee · teleports · warmth" },
    menu: [
      { id: "espresso", kind: "coffee", price: 3, name: "espresso", note: "full lantern + full breath" },
      { id: "tp1", kind: "teleport", cards: 1, price: 12, name: "a teleport", note: "⟡ one trip anywhere on the map" },
      { id: "tp3", kind: "teleport", cards: 3, price: 30, name: "teleport trio", note: "⟡⟡⟡ three trips, save 6 ◈" },
    ],
  },
];

/** where brands write to start a deal (a mailto: or a form URL). Empty = not
 *  set yet: the /brands page then points people into the world instead. */
export const BRAND_CONTACT = "";

/** the campaign running now (one at a time for the first campaign) */
export const ACTIVE: Campaign = CAMPAIGNS[0];

const pitchParam = (() => {
  try {
    return new URLSearchParams(location.search).get("pitch");
  } catch {
    return null;
  }
})();

/** may the brand's real name be shown on this screen? */
export function showsBrand(c: Campaign = ACTIVE) {
  return c.licensed || pitchParam === c.id || import.meta.env.DEV;
}

/** the name to paint on posters and signs right now */
export function brandName(c: Campaign = ACTIVE) {
  return showsBrand(c) ? c.brand : c.house;
}

/** the brand's own logo file (public/brands/<logo>), only under a signed deal:
 *  never in pitch mode, never a logo taken from the web */
export function logoUrl(c: Campaign = ACTIVE) {
  return c.licensed && c.logo ? `/brands/${c.logo}` : null;
}

export const fill = (s: string, c: Campaign = ACTIVE) => s.replace(/\{brand\}/g, brandName(c));

/** the link a brand gives its people: straight into the world, at the brand's place */
export function brandLink(c: Campaign = ACTIVE) {
  return `https://seeface1.world/labyrinth/?brand=${c.id}`;
}
