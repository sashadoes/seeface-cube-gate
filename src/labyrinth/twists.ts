// Twists: small unpredictable things that happen to YOU (not clock events for
// everyone). Every 45–110 s something may happen: the lights die, you see
// yourself, the labyrinth moves you, everything turns backwards, someone's
// lost ◈ falls at your feet, or an echo of something said nearby comes back.
export type TwistKind = "blackout" | "doppel" | "moved" | "mirror" | "money" | "echo";

const KINDS: TwistKind[] = ["blackout", "doppel", "moved", "mirror", "money", "echo"];

export function createTwists() {
  let next = 50 + Math.random() * 40;
  let last: TwistKind | null = null;
  return {
    /** returns a twist to play now, or null */
    update(dt: number, ok: boolean): TwistKind | null {
      next -= dt;
      if (next > 0 || !ok) return null;
      next = 45 + Math.random() * 65;
      if (Math.random() < 0.25) return null; // sometimes nothing. that's a twist too
      let k: TwistKind;
      do k = KINDS[Math.floor(Math.random() * KINDS.length)];
      while (k === last);
      last = k;
      return k;
    },
  };
}

/** Text that arrives from far away breaks up, like a bad radio. */
export function garble(text: string, amount: number) {
  if (amount <= 0) return text;
  return [...text].map((ch) => (ch !== " " && Math.random() < amount ? "░▒▓·"[Math.floor(Math.random() * 4)] : ch)).join("");
}
