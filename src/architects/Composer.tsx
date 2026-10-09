// The chamber's input row: text, (voice and uploads join in the next step).
import { useState, type KeyboardEvent } from "react";
import type { Asset } from "./api";

type Props = { disabled: boolean; left: number; onSend: (text: string) => void; onUploaded: (a: Asset) => void; assets: Asset[] };

export function Composer({ disabled, left, onSend }: Props) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
      e.preventDefault();
      send();
    }
  };
  return (
    <div className="ch-composer">
      <div className="ch-inputrow">
        <textarea rows={1} value={text} maxLength={1200} placeholder="transmit…" onChange={(e) => setText(e.target.value)} onKeyDown={key} enterKeyHint="send" aria-label="message to SeeFace" />
        <button className="ch-send" onClick={send} disabled={disabled || !text.trim()} aria-label="send">
          ➝
        </button>
      </div>
      {left < 30 && <div className="ch-left">{left} messages left today</div>}
    </div>
  );
}
