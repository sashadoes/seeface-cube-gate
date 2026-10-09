// Claude for the AI host (lines, topic tags, verdicts, abuse flags). Without ANTHROPIC_API_KEY,
// or past the daily cap, every call returns null and the host falls back to scripted behaviour.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.HOST_MODEL || "claude-opus-5-5";
const CAP = Number(process.env.HOST_DAILY_CAP ?? 2000);
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
let day = "", used = 0;

export const llmReady = () => !!client;

/** one structured call; returns the parsed JSON or null (no key, cap, refusal, error) */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, effort: "low" | "medium" = "low", maxTokens = 2000): Promise<T | null> {
  if (!client) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) ((day = today), (used = 0));
  if (used >= CAP) return null;
  used++;
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    } as Parameters<typeof client.beta.messages.create>[0]);
    if (!("content" in response)) return null;
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return JSON.parse(text.text) as T;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("host llm: rate limited");
    else if (e instanceof Anthropic.APIError) console.warn(`host llm: api error ${e.status}`);
    else console.warn("host llm: failed", e);
    return null;
  }
}
