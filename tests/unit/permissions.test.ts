import { describe, expect, it } from "vitest";
import { isStage, mayEnterRoom, mayEnterVoice, mayKick, mayLink, mayPromote, mayReadTranscript, maySpeak, type Actor, type RoomState } from "../../shared/world/permissions.ts";

const actor = (id: string, extra: Partial<Actor> = {}): Actor => ({ id, ageVerified: true, role: "member", ...extra });
const room = (extra: Partial<RoomState> = {}): RoomState => ({
  id: "r",
  owner: null,
  public: true,
  invited: new Set(),
  members: new Set(),
  speakers: new Set(),
  hosts: new Set(),
  stageAt: 3,
  kicked: new Map(),
  ...extra,
});

describe("permissions", () => {
  it("never lets an unverified person into voice", () => {
    expect(mayEnterVoice(actor("a", { ageVerified: false }))).toBe(false);
    expect(maySpeak(actor("a", { ageVerified: false }), room())).toBe(false);
    expect(mayLink(actor("a", { ageVerified: false }), actor("b"), () => false)).toBe(false);
  });

  it("banned people can't enter voice or rooms", () => {
    const a = actor("a", { banned: true });
    expect(mayEnterVoice(a)).toBe(false);
    expect(mayEnterRoom(a, room(), 0)).toBe(false);
  });

  it("small rooms: anyone verified talks; big rooms: speakers only", () => {
    const r = room({ members: new Set(["a", "b"]) });
    expect(maySpeak(actor("a"), r)).toBe(true);
    r.members = new Set(["a", "b", "c", "d"]);
    expect(isStage(r)).toBe(true);
    expect(maySpeak(actor("a"), r)).toBe(false);
    r.speakers.add("a");
    expect(maySpeak(actor("a"), r)).toBe(true);
  });

  it("only owner/host/moderator promote, and the speaker cap holds", () => {
    const r = room({ owner: "o", members: new Set(["o", "a", "b", "c", "d", "e", "f", "g"]) });
    expect(mayPromote(actor("a"), r, "b")).toBe(false);
    expect(mayPromote(actor("o"), r, "b")).toBe(true);
    for (const s of ["a", "b", "c", "d", "e", "f"]) r.speakers.add(s);
    expect(mayPromote(actor("o"), r, "g")).toBe(false);
    expect(mayPromote(actor("o"), r, "a")).toBe(true); // demoting is always allowed
  });

  it("kick rules", () => {
    const r = room({ owner: "o", hosts: new Set(["h"]) });
    expect(mayKick(actor("o"), r, actor("x"))).toBe(true);
    expect(mayKick(actor("h"), r, actor("x"))).toBe(true);
    expect(mayKick(actor("h"), r, actor("o"))).toBe(false);
    expect(mayKick(actor("x"), r, actor("y"))).toBe(false);
    expect(mayKick(actor("o"), r, actor("m", { moderator: true }))).toBe(false);
    expect(mayKick(actor("o"), r, actor("o"))).toBe(false);
  });

  it("kicked people stay out until the timer ends; private rooms need an invite", () => {
    const r = room({ kicked: new Map([["a", 1000]]) });
    expect(mayEnterRoom(actor("a"), r, 500)).toBe(false);
    expect(mayEnterRoom(actor("a"), r, 1500)).toBe(true);
    const p = room({ public: false, owner: "o", invited: new Set(["i"]) });
    expect(mayEnterRoom(actor("x"), p, 0)).toBe(false);
    expect(mayEnterRoom(actor("i"), p, 0)).toBe(true);
    expect(mayEnterRoom(actor("o"), p, 0)).toBe(true);
  });

  it("blocks cut voice both ways", () => {
    const blocked = (x: string, y: string) => x === "a" && y === "b";
    expect(mayLink(actor("a"), actor("b"), blocked)).toBe(false);
    expect(mayLink(actor("b"), actor("a"), blocked)).toBe(false);
    expect(mayLink(actor("a"), actor("c"), blocked)).toBe(true);
  });

  it("only the owner reads a room transcript", () => {
    expect(mayReadTranscript(actor("o"), { owner: "o" })).toBe(true);
    expect(mayReadTranscript(actor("x"), { owner: "o" })).toBe(false);
    expect(mayReadTranscript(actor("m", { moderator: true }), { owner: "o" })).toBe(false);
    expect(mayReadTranscript(actor("o"), { owner: null })).toBe(false);
  });
});
