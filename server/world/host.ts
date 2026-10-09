// The AI room host (always labelled AI). Milestone 2 version: scripted lines only. M5 adds Claude,
// transcripts and Library verdicts behind the same interface.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store, Report } from "./store.ts";
import { roomById } from "../../shared/world/rooms.ts";

type Deps = { send: (room: string, text: string) => void; store: Store };
type Member = { name: string; talking: boolean };

export function createHost({ send }: Deps) {
  const lastVoice = new Map<string, number>();
  const lastPrompt = new Map<string, number>();
  return {
    onJoin(room: string, name: string, people: number) {
      const def = roomById(room);
      if (!def) return;
      send(room, people > 1 ? `hi ${name}. we're on: ${def.topic}.` : `hi ${name}. it's quiet in ${def.name} right now. we're on: ${def.topic}. say something and the door lights up for others.`);
    },
    onText(room: string | null, _name: string, _text: string) {
      if (room) lastVoice.set(room, Date.now());
    },
    onCaption(room: string, _id: string, _name: string, _text: string) {
      lastVoice.set(room, Date.now());
    },
    flagReport(_r: Report) {},
    tick(now: number, members: (room: string) => Member[]) {
      for (const def of [...lastPrompt.keys(), ...lastVoice.keys()]) void def;
      void now;
      void members;
    },
    topicOf(_room: string): string | null {
      return null;
    },
    async http(_req: IncomingMessage, _res: ServerResponse, _url: URL, _verify: (t: unknown) => string | null) {
      return false;
    },
  };
}
