// Voice → text, shared by the Creation Chamber and the labyrinth's chat.
// The audio is only ever held in memory for the one request and is never written anywhere.
//
// ELEVENLABS_API_KEY   preferred: ElevenLabs speech-to-text (ELEVENLABS_STT_MODEL, default scribe_v2)
// TRANSCRIBE_API_KEY   fallback: any OpenAI-compatible /audio/transcriptions endpoint
//                      (TRANSCRIBE_URL, default https://api.openai.com/v1/audio/transcriptions; TRANSCRIBE_MODEL, default whisper-1)
// Without either: transcribeReady() is false, and the mic only works where the browser itself can transcribe.

export const transcribeReady = () => Boolean(process.env.ELEVENLABS_API_KEY || process.env.TRANSCRIBE_API_KEY);

const EXT = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-m4a": "m4a", "audio/aac": "aac" };

/** raw audio bytes + their content type → the words, or null when it failed */
export async function transcribe(audio, contentType) {
  const type = String(contentType || "audio/webm").split(";")[0].trim();
  const form = new FormData();
  form.append("file", new Blob([audio], { type }), `voice.${EXT[type] || "webm"}`);
  let url, headers;
  if (process.env.ELEVENLABS_API_KEY) {
    url = "https://api.elevenlabs.io/v1/speech-to-text";
    headers = { "xi-api-key": process.env.ELEVENLABS_API_KEY };
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
    form.append("tag_audio_events", "false"); // words only, no "(laughs)"
  } else {
    url = process.env.TRANSCRIBE_URL || "https://api.openai.com/v1/audio/transcriptions";
    headers = { Authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` };
    form.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
  }
  const r = await fetch(url, { method: "POST", headers, body: form, signal: AbortSignal.timeout(30_000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || typeof d.text !== "string") return null;
  return d.text.trim();
}
