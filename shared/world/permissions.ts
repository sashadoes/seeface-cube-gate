// Who may do what. Pure functions, used by the server (authoritative) and mirrored by the client
// only to grey things out. Tested in tests/unit/permissions.test.ts.
import { MAX_SPEAKERS, type Role } from "./protocol.ts";

export type Actor = { id: string; ageVerified: boolean; role: Role; moderator?: boolean; banned?: boolean };
export type RoomState = {
  id: string;
  owner: string | null;
  public: boolean;
  invited: Set<string>;
  members: Set<string>;
  speakers: Set<string>;
  hosts: Set<string>;
  stageAt: number;
  kicked: Map<string, number>; // user id → kicked until (ms)
};

export const isStage = (r: RoomState) => r.members.size > r.stageAt;

/** hard rule: no access to voice rooms without the 18+ gate */
export function mayEnterVoice(a: Actor) {
  return a.ageVerified && !a.banned;
}

export function mayEnterRoom(a: Actor, r: RoomState, now: number) {
  if (a.banned) return false;
  const until = r.kicked.get(a.id);
  if (until && until > now) return false;
  if (r.public) return true;
  return r.owner === a.id || r.invited.has(a.id) || !!a.moderator;
}

export function roleIn(a: Actor, r: RoomState): Role {
  if (a.moderator) return "moderator";
  if (r.owner === a.id) return "owner";
  if (r.hosts.has(a.id)) return "host";
  if (r.speakers.has(a.id)) return "speaker";
  return "member";
}

/** small rooms: anyone (age-verified) can talk; big rooms: only speakers, hosts, owner, moderators */
export function maySpeak(a: Actor, r: RoomState) {
  if (!mayEnterVoice(a)) return false;
  if (!isStage(r)) return true;
  return roleIn(a, r) !== "member";
}

export function mayPromote(actor: Actor, r: RoomState, target: string) {
  const role = roleIn(actor, r);
  if (!(role === "owner" || role === "host" || role === "moderator")) return false;
  return r.members.has(target) && (r.speakers.size < MAX_SPEAKERS || r.speakers.has(target));
}

export function mayKick(actor: Actor, r: RoomState, target: Actor) {
  if (actor.id === target.id) return false;
  const role = roleIn(actor, r);
  if (target.moderator) return false;
  if (r.owner === target.id) return false;
  return role === "owner" || role === "moderator" || (role === "host" && roleIn(target, r) !== "host");
}

/** room owners read their own room's transcript; moderators read flagged excerpts only (see transcripts.ts) */
export function mayReadTranscript(a: Actor, r: Pick<RoomState, "owner">) {
  return !!r.owner && r.owner === a.id;
}

/** voice link rules between two people: never when either blocked the other, never without the age gate */
export function mayLink(a: Actor, b: Actor, blocked: (x: string, y: string) => boolean) {
  if (!mayEnterVoice(a) || !mayEnterVoice(b)) return false;
  if (blocked(a.id, b.id) || blocked(b.id, a.id)) return false;
  return true;
}
