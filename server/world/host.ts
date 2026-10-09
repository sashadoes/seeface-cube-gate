// The AI room host. Always labelled AI. It:
//   · greets newcomers by name and says in one line what the room is talking about
//   · drops a provocative question on the topic when a room with people has been silent for 30 s
//   · re-tags the topic every ~10 minutes from what was said (the room "grows with the conversation":
//     the tag and a theme variant go out in the room list)
//   · writes the Library verdict when a session ends (title, conclusions, key arguments, best quotes;
//     quotes appear publicly only after their speaker approves them)
//   · flags abuse to moderators (reports get an AI read of the reported person's own lines)
// It only ever reads TEXT: transcript lines from people who switched on "Transcribe me", and the
// text bubbles people typed. Audio never reaches it.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Store, Report } from "./store.ts";
import { roomById } from "../../shared/world/rooms.ts";
import { approveQuote, publicVerdict, transcriptFor, type Line, type Verdict } from "../../shared/world/transcripts.ts";
import { askJson, llmReady } from "./llm.ts";

type Deps = { send: (room: string, text: string) => void; store: Store };
type Member = { name: string; talking: boolean };

type RoomSession = { id: string; room: string; startedAt: number; lastVoice: number; lastPrompt: number; lastTag: number; emptySince: number; bubbles: { name: string; text: string; at: number }[]; flaggedUpTo: number };

const SILENCE_MS = Number(process.env.WORLD_SILENCE_MS ?? 30_000);
const PROMPT_GAP_MS = Number(process.env.WORLD_PROMPT_GAP_MS ?? 90_000);
const TAG_EVERY_MS = 10 * 60_000;
const END_AFTER_EMPTY_MS = Number(process.env.WORLD_SESSION_END_MS ?? 2 * 60_000);

const SYSTEM = `You are the AI host of a live voice room in "seeface1 world", a dark, playful place called the Maze where strangers (all 18+) talk. You are openly an AI; never claim to be human. Your voice: warm, curious, a little weird, never preachy. You never invent things people said. Keep lines short (under 25 words). No hashtags, no emojis unless asked.`;

const QUESTIONS: Record<string, string[]> = {
  default: ["what's something you believed for way too long?", "what's the strangest thing that happened to you this week?", "if this room had a rule, what should it be?", "what's a hill you'd happily die on?"],
  "night-shift": ["what keeps you up tonight, honestly?", "best thing about being awake when everyone sleeps?"],
  "static-church": ["which conspiracy do you secretly half-believe?", "what's a coincidence you still can't explain?"],
  "lost-found": ["what's something you lost that you still think about?", "what did you find when you weren't looking?"],
  "bad-advice": ["worst advice you ever followed?", "give someone here terrible advice. go."],
  "neon-confessional": ["what's a small thing you've never told anyone?", "what are you pretending not to care about?"],
  "weird-science": ["what theory would you defend with zero evidence?", "what should science study that it ignores?"],
  "basement-radio": ["which song do you pretend to hate but love?", "what was the first album that was yours?"],
  "dream-desk": ["what did you dream last night?", "ever had a dream that came back?"],
  "strangers-kitchen": ["what are you eating right now?", "what's a food combo people judge you for?"],
  "archive-steps": ["what are you obsessed with this month?", "which book or film changed how you see people?"],
  "cryptid-hotline": ["seen anything you can't explain?", "which cryptid would you want as a roommate?"],
  "first-words": ["where in the world are you right now?", "what brought you down here tonight?"],
};

export function createHost({ send, store }: Deps) {
  const sessions = new Map<string, RoomSession>();
  const topics = new Map<string, { tag: string; variant: number }>();
  const pending = new Set<string>(); // rooms with an LLM call in flight

  const sessionOf = (room: string) => {
    let s = sessions.get(room);
    if (!s) {
      const now = Date.now();
      s = { id: randomUUID(), room, startedAt: now, lastVoice: now, lastPrompt: 0, lastTag: now, emptySince: 0, bubbles: [], flaggedUpTo: now };
      sessions.set(room, s);
    }
    return s;
  };
  const topicLine = (room: string) => topics.get(room)?.tag ?? roomById(room)?.topic ?? "anything";
  const linesOf = (s: RoomSession) => store.data.transcripts.filter((l) => l.session === s.id);
  const recentText = (s: RoomSession, n = 30) =>
    [...linesOf(s).map((l) => ({ name: l.name, text: l.text, at: l.at })), ...s.bubbles]
      .sort((a, b) => a.at - b.at)
      .slice(-n)
      .map((l) => `${l.name}: ${l.text}`)
      .join("\n");

  async function silencePrompt(room: string, s: RoomSession) {
    const def = roomById(room);
    const bank = QUESTIONS[room] ?? QUESTIONS.default;
    let q = bank[Math.floor(Math.random() * bank.length)];
    if (llmReady() && !pending.has(room)) {
      pending.add(room);
      const r = await askJson<{ question: string }>(SYSTEM, `Room: ${def?.name}. Topic: ${topicLine(room)}.\nRecent text (may be empty):\n${recentText(s, 12) || "(nothing yet)"}\n\nThe room has gone quiet. Ask ONE short provocative but kind question that gets strangers talking about the topic.`, { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false });
      pending.delete(room);
      if (r?.question) q = r.question.slice(0, 160);
    }
    send(room, q);
  }

  async function retag(room: string, s: RoomSession) {
    const text = recentText(s, 40);
    if (!text || !llmReady() || pending.has(room)) return;
    pending.add(room);
    const r = await askJson<{ topic: string }>(SYSTEM, `Room: ${roomById(room)?.name}. Original topic: ${roomById(room)?.topic}.\nWhat people said recently:\n${text}\n\nIn at most 6 lowercase words, what is this room talking about now?`, { type: "object", properties: { topic: { type: "string" } }, required: ["topic"], additionalProperties: false });
    pending.delete(room);
    if (r?.topic) topics.set(room, { tag: r.topic.toLowerCase().slice(0, 60), variant: ((topics.get(room)?.variant ?? 0) + 1) % 4 });
  }

  async function writeVerdict(s: RoomSession) {
    const lines = linesOf(s);
    if (lines.length < 6) return;
    const numbered = lines.map((l, i) => `[${i}] ${l.name}: ${l.text}`).join("\n");
    const schema = {
      type: "object",
      properties: {
        title: { type: "string" },
        conclusions: { type: "array", items: { type: "string" } },
        arguments: { type: "array", items: { type: "string" } },
        quotes: { type: "array", items: { type: "integer" } },
      },
      required: ["title", "conclusions", "arguments", "quotes"],
      additionalProperties: false,
    };
    const r = await askJson<{ title: string; conclusions: string[]; arguments: string[]; quotes: number[] }>(
      SYSTEM,
      `Write the Library verdict for this session of "${roomById(s.room)?.name}" (topic: ${topicLine(s.room)}).\nTranscript (numbered lines, only people who opted in to transcription):\n${numbered}\n\nReturn: a short evocative title; 1-4 conclusions; 1-5 key arguments (who argued what, by first name only); and up to 3 line numbers that are the best quotes (exact lines, chosen for wit or insight). Use only what is in the transcript.`,
      schema,
      "medium",
      4000,
    );
    const pick = (r?.quotes ?? [...lines.keys()].sort((a, b) => lines[b].text.length - lines[a].text.length).slice(0, 3)).filter((i) => lines[i]).slice(0, 3);
    const v: Verdict = {
      id: randomUUID(),
      room: s.room,
      session: s.id,
      at: Date.now(),
      title: (r?.title ?? `${roomById(s.room)?.name ?? "a room"} · ${new Date(s.startedAt).toISOString().slice(0, 10)}`).slice(0, 120),
      conclusions: (r?.conclusions ?? []).slice(0, 4).map((x) => x.slice(0, 300)),
      arguments: (r?.arguments ?? []).slice(0, 5).map((x) => x.slice(0, 300)),
      quotes: pick.map((i) => ({ id: randomUUID(), speaker: lines[i].speaker, name: lines[i].name, text: lines[i].text, approved: null })),
      aiWritten: !!r,
    };
    store.data.verdicts.push(v);
    store.dirty();
  }

  async function flagLines(s: RoomSession) {
    if (!llmReady()) return;
    const fresh = linesOf(s).filter((l) => l.at > s.flaggedUpTo);
    if (fresh.length < 5) return;
    s.flaggedUpTo = fresh[fresh.length - 1].at;
    const r = await askJson<{ flags: { line: number; category: string }[] }>(
      "You are a safety classifier for an 18+ voice community. Flag only clear violations: harassment or threats, hate, sexual content involving minors or non-consent, doxxing, someone saying they are under 18, self-harm risk. Ordinary swearing, dark humour and disagreement are fine.",
      fresh.map((l, i) => `[${i}] ${l.text}`).join("\n"),
      { type: "object", properties: { flags: { type: "array", items: { type: "object", properties: { line: { type: "integer" }, category: { type: "string" } }, required: ["line", "category"], additionalProperties: false } } }, required: ["flags"], additionalProperties: false },
    );
    for (const f of r?.flags ?? []) {
      const l = fresh[f.line];
      if (!l) continue;
      store.data.reports.push({ id: randomUUID(), at: Date.now(), reporter: "ai-host", target: l.speaker, reason: `AI flag: ${f.category}`, room: l.room, excerpt: [l.text], aiFlag: f.category.slice(0, 60), status: "open" });
    }
    if (r?.flags.length) store.dirty();
  }

  return {
    onJoin(room: string, name: string, people: number) {
      const def = roomById(room);
      if (!def) return;
      sessionOf(room).emptySince = 0;
      send(room, people > 1 ? `hi ${name}. we're on: ${topicLine(room)}.` : `hi ${name}. it's quiet in ${def.name} right now. the topic: ${topicLine(room)}. say something and the door lights up for others.`);
    },
    onText(room: string | null, name: string, text: string) {
      if (!room) return;
      const s = sessionOf(room);
      s.lastVoice = Date.now();
      s.bubbles.push({ name, text, at: Date.now() });
      if (s.bubbles.length > 60) s.bubbles.shift();
    },
    onCaption(room: string, id: string, name: string, text: string) {
      const s = sessionOf(room);
      s.lastVoice = Date.now();
      const line: Line = { id: randomUUID(), room, session: s.id, speaker: id, name, text, at: Date.now() };
      store.data.transcripts.push(line);
      store.dirty();
    },
    flagReport(r: Report) {
      if (!llmReady() || !r.excerpt.length) return;
      void askJson<{ category: string; severity: "low" | "medium" | "high" }>(
        "Classify a user report from an 18+ voice community. Read only the reported person's own lines. Categories: harassment, hate, sexual, minor, doxxing, self-harm, spam, none.",
        `Report reason: ${r.reason}\nTheir lines:\n${r.excerpt.join("\n")}`,
        { type: "object", properties: { category: { type: "string" }, severity: { type: "string", enum: ["low", "medium", "high"] } }, required: ["category", "severity"], additionalProperties: false },
      ).then((x) => {
        if (x) {
          r.aiFlag = `${x.category} · ${x.severity}`;
          store.dirty();
        }
      });
    },
    tick(now: number, members: (room: string) => Member[]) {
      for (const [room, s] of sessions) {
        const m = members(room);
        if (!m.length) {
          if (!s.emptySince) s.emptySince = now;
          if (now - s.emptySince > END_AFTER_EMPTY_MS) {
            sessions.delete(room);
            topics.delete(room);
            void writeVerdict(s);
          }
          continue;
        }
        s.emptySince = 0;
        if (m.some((x) => x.talking)) s.lastVoice = now;
        if (roomById(room) && now - s.lastVoice > SILENCE_MS && now - s.lastPrompt > PROMPT_GAP_MS) {
          s.lastPrompt = now;
          s.lastVoice = now;
          void silencePrompt(room, s);
        }
        if (now - s.lastTag > TAG_EVERY_MS) {
          s.lastTag = now;
          void retag(room, s);
          void flagLines(s);
        }
      }
    },
    topicOf: (room: string) => topics.get(room)?.tag ?? null,
    variantOf: (room: string) => topics.get(room)?.variant ?? 0,
    /** Library, transcripts (owner only), quote approvals, the admin queue */
    async http(req: IncomingMessage, res: ServerResponse, url: URL, verify: (t: unknown) => string | null) {
      const json = (code: number, body: unknown) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body));
      const auth = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (url.pathname === "/library" && req.method === "GET") {
        return json(200, { verdicts: store.data.verdicts.slice(-100).reverse().map(publicVerdict).filter((v) => v.conclusions.length || v.quotes.length || v.arguments.length) }), true;
      }
      if (url.pathname === "/my/quotes" && req.method === "GET") {
        if (!auth) return json(401, { ok: false }), true;
        const out = store.data.verdicts.flatMap((v) => v.quotes.filter((q) => q.speaker === auth && q.approved === null).map((q) => ({ verdict: v.id, title: v.title, quote: q.id, text: q.text })));
        return json(200, { quotes: out }), true;
      }
      if (url.pathname === "/my/quotes" && req.method === "POST") {
        if (!auth) return json(401, { ok: false }), true;
        const body = await readJson(req);
        const v = store.data.verdicts.find((x) => x.id === body?.verdict);
        const ok = !!v && approveQuote(v, String(body?.quote), auth, !!body?.yes);
        if (ok) store.dirty();
        return json(ok ? 200 : 400, { ok }), true;
      }
      if (url.pathname === "/transcript" && req.method === "GET") {
        if (!auth) return json(401, { ok: false }), true;
        const roomId = url.searchParams.get("room") ?? "";
        const owned = store.data.ownedRooms[roomId];
        const lines = transcriptFor(store.data.transcripts, { id: roomId, owner: owned?.owner ?? null }, auth, Date.now());
        if (!lines) return json(403, { ok: false }), true;
        return json(200, { lines: lines.map((l) => ({ name: l.name, text: l.text, at: l.at })) }), true;
      }
      if (url.pathname.startsWith("/admin/")) {
        const key = req.headers["x-admin-key"];
        if (!process.env.WORLD_ADMIN_KEY || key !== process.env.WORLD_ADMIN_KEY) return json(403, { ok: false }), true;
        if (url.pathname === "/admin/queue") {
          const reports = store.data.reports.filter((r) => r.status === "open").slice(-200).reverse().map((r) => ({ ...r, targetName: store.data.users[r.target]?.name ?? "(deleted)", strikes: store.data.strikes.filter((s) => s.user === r.target).length }));
          return json(200, { reports }), true;
        }
        if (url.pathname === "/admin/action" && req.method === "POST") {
          const body = await readJson(req);
          const r = store.data.reports.find((x) => x.id === body?.report);
          if (!r) return json(404, { ok: false }), true;
          const u = store.data.users[r.target];
          const now = Date.now();
          if (body?.action === "dismiss") r.status = "dismissed";
          else if (body?.action === "strike" && u) {
            r.status = "actioned";
            store.data.strikes.push({ at: now, user: r.target, reason: r.reason, by: "moderator" });
            const n = store.data.strikes.filter((s) => s.user === r.target && s.by !== "system").length;
            // strike ladder: 1 → 24 h voice pause, 2 → 7 days, 3 → banned
            if (n >= 3) u.bannedUntil = now + 365 * 86_400_000;
            else u.voiceBannedUntil = now + (n === 1 ? 1 : 7) * 86_400_000;
          } else if (body?.action === "ban" && u) {
            r.status = "actioned";
            u.bannedUntil = now + 365 * 86_400_000;
          } else return json(400, { ok: false }), true;
          store.dirty();
          return json(200, { ok: true }), true;
        }
      }
      return false;
    },
  };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8000) return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
