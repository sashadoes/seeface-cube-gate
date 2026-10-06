// Auto-filter for marks (owner choice: no manual approval). Rejects offensive
// words, links, emails, phone numbers and junk. Returns the cleaned text, or
// null if the mark must not be shown. It's a net, not a guarantee: the owner
// can still delete marks afterwards.

export const MAX_MARK = 80;

// Matched against a normalised form (lowercase, leetspeak undone, separators
// removed), so "f.u.c.k" and "fvck" are caught too. Kept short and stems-based.
const BLOCK = [
  // English
  "fuck", "fuk", "shit", "cunt", "bitch", "whore", "slut", "dick", "cock", "pussy",
  "asshole", "bastard", "wank", "twat", "porn", "nude", "nudes", "sex", "rape",
  "nigg", "nigga", "fag", "retard", "kike", "spic", "chink", "tranny", "nazi", "hitler",
  "kill yourself", "kys", "suicide",
  // Ukrainian / Russian (latin + cyrillic)
  "хуй", "хуе", "хуё", "пизд", "бля", "ебат", "ебан", "еба", "сука", "мудак", "гандон",
  "підар", "пидор", "пидар", "шлюх", "залуп", "дроч",
  "huy", "hui", "pizd", "blya", "blyat", "suka", "pidor", "pidar", "ebat", "yebat",
  // Polish
  "kurwa", "chuj", "pierdol", "jebac", "jebać", "spierdalaj", "pizda",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/** lowercase, undo leetspeak, drop punctuation inside a word */
function norm(word: string) {
  return word
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** fuuuuck → fuck */
const squash = (w: string) => w.replace(/(.)\1+/g, "$1");
const hasDouble = (w: string) => /(.)\1/.test(w);

/** Words of the mark, with runs of single letters joined ("f u c k" → "fuck"). */
function words(text: string): string[] {
  const out: string[] = [];
  let run = "";
  for (const raw of text.split(/\s+/)) {
    const w = norm(raw);
    if (!w) continue;
    if (w.length === 1) {
      run += w;
      continue;
    }
    if (run) out.push(run);
    run = "";
    out.push(w);
  }
  if (run) out.push(run);
  return out;
}

const STEMS = BLOCK.filter((b) => !b.includes(" ")).map(norm);
// The worst stems are caught anywhere inside a word ("motherfucker"). Everything
// else must start a word, so "grape", "peacock" and "auspicious" stay allowed.
const ANYWHERE = new Set(
  ["fuck", "cunt", "shit", "nigg", "whore", "bitch", "pussy", "хуй", "пизд", "ебат", "ебан", "pizd", "kurwa", "chuj", "pierdol", "jebac"].map(norm)
);
const PHRASES = BLOCK.filter((b) => b.includes(" "));

function offensive(text: string) {
  const ws = words(text);
  const lower = text.toLowerCase();
  if (PHRASES.some((p) => lower.includes(p))) return true;
  return ws.some((raw) =>
    STEMS.some((st) => {
      // stems without double letters are matched against the squashed word too,
      // so stretched spellings are caught; stems like "nigg" stay exact so
      // "night" is not blocked
      const w = hasDouble(st) ? raw : squash(raw);
      return ANYWHERE.has(st) ? w.includes(st) : w.startsWith(st);
    })
  );
}

const LINK = /(https?:\/\/|www\.)|\b[\w-]+\.(com|net|org|io|ru|ua|pl|xyz|link|ly|me|co|app|world|site|shop|gg|tv)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(\+?\d[\s().-]?){8,}/;
const HANDLE = /@\w{3,}/; // no @usernames: protects people from being targeted

export function filterMark(raw: string): string | null {
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_MARK);
  if (text.length < 2) return null;
  if (LINK.test(text) || EMAIL.test(text) || PHONE.test(text) || HANDLE.test(text)) return null;
  if (offensive(text)) return null;
  if (squash(norm(text)).length < 2) return null; // "aaaaaaa", "!!!!"
  return text;
}
