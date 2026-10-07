// Twists: small unpredictable things that happen to YOU (not clock events for
// everyone). Every 35–90 s something may happen: the lights die, you see
// yourself, the labyrinth moves you, everything turns backwards, someone's
// lost ◈ falls at your feet, an echo, gravity forgets you, a whisper tells you
// where a real person is, the Hollow shows itself for a blink, a treasure is
// hidden nearby (with an arrow), a wall of fog rolls in, the colours go wrong.
export type TwistKind = "blackout" | "doppel" | "mirror" | "money" | "echo" | "gravity" | "whisper" | "glimpse" | "treasure" | "fogwall" | "colours" | "waterfall";

const KINDS: TwistKind[] = ["blackout", "doppel", "mirror", "money", "echo", "gravity", "whisper", "glimpse", "treasure", "treasure", "fogwall", "colours", "waterfall", "waterfall"];

export function createTwists() {
  let next = 40 + Math.random() * 30;
  let last: TwistKind | null = null;
  return {
    /** returns a twist to play now, or null */
    update(dt: number, ok: boolean): TwistKind | null {
      next -= dt;
      if (next > 0 || !ok) return null;
      next = 35 + Math.random() * 55;
      if (Math.random() < 0.15) return null; // sometimes nothing. that's a twist too
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
