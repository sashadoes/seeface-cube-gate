// Durable world state behind one small interface. Default: in memory, flushed to a JSON file
// (dev). WORLD_STORE=memory keeps it in memory only (tests). A Postgres implementation can sit
// behind DATABASE_URL with the same methods; the schema is in server/world/schema.sql.
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type User = {
  id: string;
  name: string;
  blob: string;
  createdAt: number;
  lastSeen: number;
  ageVerified: boolean;
  ageMethod: string | null;
  moderator: boolean;
  bannedUntil: number;
  voiceBannedUntil: number;
  transcribe: boolean;
  mutes: string[];
  blocks: string[];
  follows: string[];
  quests: string[];
  days: string[]; // UTC dates visited
};

export type Report = { id: string; at: number; reporter: string; target: string; reason: string; room: string | null; excerpt: string[]; aiFlag: string | null; status: "open" | "actioned" | "dismissed" };
export type Strike = { at: number; user: string; reason: string; by: string };

export type Data = {
  users: Record<string, User>;
  reports: Report[];
  strikes: Strike[];
  ledger: import("../../shared/world/ledger.ts").Entry[];
  ownedRooms: Record<string, import("../../shared/world/ledger.ts").OwnedRoom>;
  transcripts: import("../../shared/world/transcripts.ts").Line[];
  verdicts: import("../../shared/world/transcripts.ts").Verdict[];
  payments: Record<string, { user: string; pack: string; coins: number; status: "pending" | "paid"; at: number }>;
};

const empty = (): Data => ({ users: {}, reports: [], strikes: [], ledger: [], ownedRooms: {}, transcripts: [], verdicts: [], payments: {} });

export type Store = {
  data: Data;
  dirty: () => void;
  flush: () => void;
};

export function createStore(mode = process.env.WORLD_STORE ?? "file"): Store {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "..", "data-world", "world.json");
  let data = empty();
  if (mode === "file" && existsSync(file)) {
    try {
      data = { ...empty(), ...JSON.parse(readFileSync(file, "utf8")) };
    } catch (e) {
      console.error("world store: unreadable file, starting empty", e);
    }
  }
  let pending = false;
  const flush = () => {
    pending = false;
    if (mode !== "file") return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file + ".tmp", JSON.stringify(data));
    renameSync(file + ".tmp", file);
  };
  return {
    data,
    dirty() {
      if (pending) return;
      pending = true;
      setTimeout(flush, 1500);
    },
    flush,
  };
}
