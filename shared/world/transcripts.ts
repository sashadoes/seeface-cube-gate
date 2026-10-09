// Transcript privacy rules. Audio is never stored anywhere; only text from live speech-to-text,
// and only for speakers who switched "Transcribe me" on. Pure functions, tested.
//
// - A caption is kept only if its speaker has transcription on at that moment.
// - Room owners read their own room's full transcript for 90 days; then it's purged.
// - Nobody else reads transcripts. Moderators see only the reported person's own lines from
//   ±5 minutes around a report.
// - The Library keeps only verdicts (title, conclusions, key arguments, best quotes), and a quote
//   appears publicly only once its speaker approved it.
// - Deleting your data removes your lines and your quotes (approved or not) everywhere.

export const RETENTION_MS = 90 * 24 * 3600 * 1000;
export const EXCERPT_WINDOW_MS = 5 * 60 * 1000;
export const MAX_LINE = 400;

export type Line = { id: string; room: string; session: string; speaker: string; name: string; text: string; at: number };
export type Quote = { id: string; speaker: string; name: string; text: string; approved: boolean | null };
export type Verdict = { id: string; room: string; session: string; at: number; title: string; conclusions: string[]; arguments: string[]; quotes: Quote[]; aiWritten: boolean };

export function acceptCaption(speaker: { id: string; transcribe: boolean }, text: string): string | null {
  if (!speaker.transcribe) return null;
  const t = text.replace(/\s+/g, " ").trim().slice(0, MAX_LINE);
  return t || null;
}

export function purgeExpired(lines: Line[], now: number): Line[] {
  return lines.filter((l) => now - l.at < RETENTION_MS);
}

/** the full transcript of a room, only for its owner, only inside retention */
export function transcriptFor(lines: readonly Line[], room: { id: string; owner: string | null }, reader: string, now: number): Line[] | null {
  if (!room.owner || room.owner !== reader) return null;
  return lines.filter((l) => l.room === room.id && now - l.at < RETENTION_MS);
}

/** what a moderator may see for a report: the target's own lines near the report time */
export function reportExcerpt(lines: readonly Line[], target: string, room: string | null, at: number): string[] {
  return lines
    .filter((l) => l.speaker === target && (!room || l.room === room) && Math.abs(l.at - at) <= EXCERPT_WINDOW_MS)
    .slice(-20)
    .map((l) => l.text);
}

/** a verdict as the public Library shows it: unapproved quotes are hidden */
export function publicVerdict(v: Verdict): Verdict {
  return { ...v, quotes: v.quotes.filter((q) => q.approved === true) };
}

export function approveQuote(v: Verdict, quoteId: string, by: string, yes: boolean): boolean {
  const q = v.quotes.find((x) => x.id === quoteId);
  if (!q || q.speaker !== by) return false;
  q.approved = yes;
  return true;
}

export function deleteUserData(lines: Line[], verdicts: Verdict[], user: string): { lines: Line[]; verdicts: Verdict[] } {
  return {
    lines: lines.filter((l) => l.speaker !== user),
    verdicts: verdicts.map((v) => ({ ...v, quotes: v.quotes.filter((q) => q.speaker !== user) })),
  };
}
