// The cube's answers: a Magic 8-Ball in the seeface voice. No AI involved.
// The same question on the same day always gets the same answer.

const YES = [
  "yes",
  "yes. but not the way you think",
  "the 1 says yes",
  "6 says yes. 6 lies sometimes",
  "it is already happening",
  "yes. spin it once more to be sure",
  "the floor agrees",
  "yes, if you stop asking",
  "closer than you think",
  "it was always yes",
];

const NO = [
  "no",
  "the cube says no",
  "never on this face",
  "not today",
  "don't",
  "no. turn around",
  "the walls shook their heads",
  "not while the fog is here",
  "it laughed",
];

const MAYBE = [
  "ask again when the fog lifts",
  "the answer is on the other face",
  "you already know",
  "it knows. it won't say",
  "only if you spin left",
  "soon",
  "the cube is thinking. it might not stop",
  "count to 6 and ask again",
  "half yes. half something else",
  "it depends who is watching",
  "wrong question",
];

// Asking what it is gets a truthful in-character answer.
const SELF = [
  "i am only a cube",
  "a cube. six faces. some of them yours",
  "i was here before the shop",
  "just a cube with a long memory",
];

const SELF_PATTERN =
  /\b(who|what)\s+(are|r)\s+(you|u)\b|\bare (you|u) (real|alive|human|a person|ai|a bot|robot)\b|\b(ai|bot|robot|chatgpt|claude)\b/i;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalize(q: string) {
  return q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

export function answer(question: string): string {
  const q = normalize(question);
  if (q.length < 3) return "ask properly";
  const today = new Date().toISOString().slice(0, 10);
  const h = hash(q + "|" + today);
  if (SELF_PATTERN.test(q)) return SELF[h % SELF.length];
  const bucket = [YES, NO, MAYBE][h % 3];
  return bucket[Math.floor(h / 3) % bucket.length];
}
