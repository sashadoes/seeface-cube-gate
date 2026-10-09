// The chamber's input row: text, voice (→ text only) and uploads.
// Uploads go up as soon as they're picked; they ride along with the next message.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { health, transcribe, upload, type Asset } from "./api";
import { AUDIO_TYPES, IMAGE_TYPES, browserSpeech, canRecord, listen, prepareImage, record } from "./media";
import { Thumb } from "./Thumb";

type Props = { disabled: boolean; left: number; onSend: (text: string, attach: string[]) => void; onUploaded: (a: Asset) => void; assets: Asset[] };

const LIMIT = { image: { mb: 10, n: 12 }, audio: { mb: 20, n: 3 } };
const UPLOAD_ERR: Record<string, string> = {
  type: "That file type can't live in the labyrinth (images: png, jpg, webp · sound: mp3, wav, ogg).",
  size: "That file is too big (images up to 10 MB, sounds up to 20 MB).",
  count: "This room is full of that kind of material (12 images, 3 sounds). Remove one first.",
  submitted: "The room is being reviewed; it can't change now.",
};

export function Composer({ disabled, left, onSend, onUploaded, assets }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(0);
  const [note, setNote] = useState("");
  const [mic, setMic] = useState<"off" | "listening" | "recording" | "transcribing">("off");
  const [serverVoice, setServerVoice] = useState(false);
  const stopRef = useRef<null | (() => void)>(null);
  const recRef = useRef<null | { stop: () => Promise<Blob> }>(null);
  const before = useRef("");
  const file = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!browserSpeech && canRecord) health().then((h) => setServerVoice(Boolean(h.chamber?.transcribe)));
  }, []);
  // grow the box with its text
  useEffect(() => {
    const a = area.current;
    if (a) {
      a.style.height = "auto";
      a.style.height = `${a.scrollHeight}px`;
    }
  }, [text]);

  const send = () => {
    if (disabled || uploading) return;
    const t = text.trim() || (pending.length ? `I'm sharing ${pending.map((p) => `"${p.name}"`).join(", ")}.` : "");
    if (!t) return;
    stopMic();
    onSend(t, pending.map((p) => p.id));
    setText("");
    setPending([]);
    setNote("");
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      send();
    }
  };

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setNote("");
    for (const f of Array.from(files)) {
      const kind = IMAGE_TYPES.includes(f.type) ? "image" : AUDIO_TYPES.includes(f.type) || /\.(mp3|wav|ogg)$/i.test(f.name) ? "audio" : null;
      if (!kind) {
        setNote(UPLOAD_ERR.type);
        continue;
      }
      if (f.size > LIMIT[kind].mb * 1024 * 1024) {
        setNote(UPLOAD_ERR.size);
        continue;
      }
      if (assets.filter((a) => a.type === kind).length + pending.filter((a) => a.type === kind).length >= LIMIT[kind].n) {
        setNote(UPLOAD_ERR.count);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const prepared = kind === "image" ? await prepareImage(f) : { blob: f, palette: [] };
        const r = await upload(prepared.blob, f.name, prepared.palette);
        if (r.ok && r.asset) {
          setPending((p) => [...p, r.asset!]);
          onUploaded(r.asset);
        } else setNote(UPLOAD_ERR[r.error ?? ""] ?? "The upload didn't arrive. Try again.");
      } catch {
        setNote("That image couldn't be read. Try a png, jpg or webp.");
      }
      setUploading((n) => n - 1);
    }
    if (file.current) file.current.value = "";
  }

  // ---------------------------------------------------------------- voice
  function stopMic() {
    stopRef.current?.();
    stopRef.current = null;
  }
  async function toggleMic() {
    if (mic === "listening") return stopMic();
    if (mic === "recording") {
      setMic("transcribing");
      const clip = await recRef.current!.stop();
      recRef.current = null;
      const t = await transcribe(clip); // the clip is dropped after this call
      setMic("off");
      if (t) setText((s) => (s ? `${s} ${t}` : t));
      else setNote("Couldn't hear that. Try again, or type.");
      return;
    }
    setNote("");
    if (browserSpeech) {
      before.current = text ? `${text} ` : "";
      setMic("listening");
      stopRef.current = listen(
        (t) => setText(before.current + t),
        (err) => {
          setMic("off");
          stopRef.current = null;
          if (err && err !== "no-speech" && err !== "aborted") setNote(err === "not-allowed" ? "The microphone is blocked for this page." : "Voice stopped. Try again, or type.");
        }
      );
      return;
    }
    try {
      recRef.current = await record();
      setMic("recording");
    } catch {
      setNote("The microphone is blocked for this page.");
    }
  }
  const voice = browserSpeech || (canRecord && serverVoice);

  return (
    <div className="ch-composer">
      {pending.length > 0 && (
        <div className="ch-pending">
          {pending.map((a) => (
            <Thumb key={a.id} asset={a} />
          ))}
        </div>
      )}
      <div className="ch-inputrow">
        <button className="ch-icon" onClick={() => file.current?.click()} disabled={disabled || uploading > 0} aria-label="share images or sounds" title="share images or sounds">
          {uploading ? "…" : "+"}
        </button>
        <input ref={file} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" onChange={(e) => pick(e.target.files)} />
        <textarea
          ref={area}
          rows={1}
          value={text}
          maxLength={1200}
          placeholder={mic === "listening" || mic === "recording" ? "listening…" : mic === "transcribing" ? "turning your voice into words…" : "transmit…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={key}
          enterKeyHint="send"
          aria-label="message to SeeFace"
        />
        {voice && (
          <button className={`ch-icon mic ${mic}`} onClick={toggleMic} disabled={disabled || mic === "transcribing"} aria-label={mic === "off" ? "speak" : "stop listening"} aria-pressed={mic !== "off"}>
            {mic === "off" ? "◉" : "■"}
          </button>
        )}
        <button className="ch-send" onClick={send} disabled={disabled || uploading > 0 || (!text.trim() && !pending.length)} aria-label="send">
          ➝
        </button>
      </div>
      {note && <div className="ch-note warn">{note}</div>}
      {mic !== "off" && <div className="ch-note">your voice becomes text · it is never recorded or kept</div>}
      {left < 30 && <div className="ch-left">{left} messages left today</div>}
    </div>
  );
}
