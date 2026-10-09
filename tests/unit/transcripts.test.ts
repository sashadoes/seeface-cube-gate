import { describe, expect, it } from "vitest";
import { RETENTION_MS, acceptCaption, approveQuote, deleteUserData, publicVerdict, purgeExpired, reportExcerpt, transcriptFor, type Line, type Verdict } from "../../shared/world/transcripts.ts";

const now = Date.UTC(2026, 9, 9);
const line = (speaker: string, at: number, room = "r", text = "hello"): Line => ({ id: `${speaker}${at}`, room, session: "s", speaker, name: speaker, text, at });

describe("transcript privacy", () => {
  it("keeps captions only from people who opted in", () => {
    expect(acceptCaption({ id: "a", transcribe: false }, "hi")).toBeNull();
    expect(acceptCaption({ id: "a", transcribe: true }, "  hi  there ")).toBe("hi there");
    expect(acceptCaption({ id: "a", transcribe: true }, "   ")).toBeNull();
  });

  it("only the owner reads, and only within 90 days", () => {
    const lines = [line("a", now - 1000), line("b", now - RETENTION_MS - 1)];
    expect(transcriptFor(lines, { id: "r", owner: "o" }, "x", now)).toBeNull();
    expect(transcriptFor(lines, { id: "r", owner: null }, "x", now)).toBeNull();
    expect(transcriptFor(lines, { id: "r", owner: "o" }, "o", now)?.map((l) => l.speaker)).toEqual(["a"]);
    expect(purgeExpired(lines, now).length).toBe(1);
  });

  it("moderator excerpts contain only the reported person near the report", () => {
    const lines = [line("t", now - 60_000, "r", "bad"), line("x", now - 30_000, "r", "innocent"), line("t", now - 3_600_000, "r", "old")];
    expect(reportExcerpt(lines, "t", "r", now)).toEqual(["bad"]);
  });

  it("the Library only shows approved quotes; only the speaker approves", () => {
    const v: Verdict = { id: "v", room: "r", session: "s", at: now, title: "t", conclusions: [], arguments: [], aiWritten: true, quotes: [{ id: "q1", speaker: "a", name: "a", text: "x", approved: null }, { id: "q2", speaker: "b", name: "b", text: "y", approved: null }] };
    expect(publicVerdict(v).quotes).toEqual([]);
    expect(approveQuote(v, "q1", "b", true)).toBe(false);
    expect(approveQuote(v, "q1", "a", true)).toBe(true);
    expect(publicVerdict(v).quotes.map((q) => q.id)).toEqual(["q1"]);
  });

  it("deleting your data removes your lines and quotes", () => {
    const v: Verdict = { id: "v", room: "r", session: "s", at: now, title: "t", conclusions: [], arguments: [], aiWritten: true, quotes: [{ id: "q1", speaker: "a", name: "a", text: "x", approved: true }] };
    const out = deleteUserData([line("a", now), line("b", now)], [v], "a");
    expect(out.lines.map((l) => l.speaker)).toEqual(["b"]);
    expect(out.verdicts[0].quotes).toEqual([]);
  });
});
