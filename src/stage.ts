// Which site this build is: the live one (seeface.world) or the test one
// (dev.seeface.world and every branch preview on Cloudflare Pages).
// Set at build time: VITE_STAGE=test. Anything else (or nothing) = live.
//
// The test site is its own world: it talks on its own relay topics, so
// unfinished features never reach real players, and the eye, the champions'
// billboard and quests on the live site stay clean. It is never counted in
// GoatCounter, never cached by the service worker, and hidden from search.
export const IS_TEST = import.meta.env.VITE_STAGE === "test";

/** the first part of every relay topic: "seeface1" live, "seeface1-test" on the test site */
export const RELAY = IS_TEST ? "seeface1-test" : "seeface1";
