import { describe, expect, it } from "vitest";
import { apply, balance, gift, type Entry } from "../../shared/world/ledger.ts";

let n = 0;
const id = () => `e${++n}`;
const T = Date.UTC(2026, 9, 9, 12);

describe("coin ledger", () => {
  it("credits the welcome once, even on retries with new keys", () => {
    const L: Entry[] = [];
    expect(apply(L, { user: "u", delta: 100, reason: "welcome", key: "w1", at: T }, id).ok).toBe(true);
    const again = apply(L, { user: "u", delta: 100, reason: "welcome", key: "w2", at: T }, id);
    expect(again.ok).toBe(false);
    expect(balance(L, "u")).toBe(100);
  });

  it("is idempotent per key", () => {
    const L: Entry[] = [];
    apply(L, { user: "u", delta: 2, reason: "listen", key: "k", at: T }, id);
    const r = apply(L, { user: "u", delta: 2, reason: "listen", key: "k", at: T }, id);
    expect(r).toMatchObject({ ok: false, error: "duplicate" });
    expect(balance(L, "u")).toBe(2);
  });

  it("never goes negative", () => {
    const L: Entry[] = [];
    apply(L, { user: "u", delta: 100, reason: "welcome", key: "w", at: T }, id);
    expect(apply(L, { user: "u", delta: -500, reason: "room", key: "r", at: T }, id)).toMatchObject({ ok: false, error: "insufficient" });
    expect(balance(L, "u")).toBe(100);
  });

  it("enforces daily caps and resets the next day", () => {
    const L: Entry[] = [];
    for (let i = 0; i < 12; i++) apply(L, { user: "u", delta: 2, reason: "listen", key: `l${i}`, at: T }, id);
    expect(apply(L, { user: "u", delta: 2, reason: "listen", key: "l-over", at: T }, id)).toMatchObject({ ok: false, error: "cap" });
    expect(apply(L, { user: "u", delta: 2, reason: "listen", key: "l-tomorrow", at: T + 86_400_000 }, id).ok).toBe(true);
  });

  it("rejects wrong signs and non-integers", () => {
    const L: Entry[] = [];
    expect(apply(L, { user: "u", delta: 5, reason: "room", key: "a", at: T }, id).ok).toBe(false);
    expect(apply(L, { user: "u", delta: -5, reason: "daily", key: "b", at: T }, id).ok).toBe(false);
    expect(apply(L, { user: "u", delta: 1.5, reason: "speak", key: "c", at: T }, id).ok).toBe(false);
  });

  it("gifts move coins atomically and can't be sent to yourself", () => {
    const L: Entry[] = [];
    apply(L, { user: "a", delta: 100, reason: "welcome", key: "w", at: T }, id);
    expect(gift(L, "a", "b", "moon", "g1", T, id).ok).toBe(true);
    expect(balance(L, "a")).toBe(80);
    expect(balance(L, "b")).toBe(20);
    expect(gift(L, "a", "b", "moon", "g1", T, id).ok).toBe(false); // replay
    expect(gift(L, "a", "a", "moon", "g2", T, id).ok).toBe(false);
    expect(gift(L, "b", "a", "comet", "g3", T, id)).toMatchObject({ ok: false, error: "insufficient" });
    expect(balance(L, "b")).toBe(20);
  });
});
