import { useRef, useState } from "react";
import { answer } from "./answers";
import { oracleReveal } from "../cube/mystery";
import { track } from "../../analytics";
import "./AskCube.scss";

// Keep clicks/typing in the box from spinning the cube or entering digits.
const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

/** Old-Tumblr "ask me anything" box: visitors ask, the cube answers. */
export default function AskCube() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    setOpen((o) => !o);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || thinking) return;
    track("oracle-question");
    setThinking(true);
    oracleReveal(answer(question));
    setTimeout(() => {
      setThinking(false);
      setQuestion("");
      setOpen(false);
    }, 1500);
  };

  return (
    <div
      className={"ask-cube" + (open ? " is-open" : "")}
      onMouseDown={swallow}
      onMouseUp={swallow}
      onPointerDown={swallow}
      onPointerUp={swallow}
      onTouchStart={swallow}
      onTouchEnd={swallow}
      onClick={swallow}
    >
      <button className="ask-link" onClick={toggle}>
        {open ? "close ×" : "ask the cube ↗"}
      </button>
      {open && (
        <form className="ask-box" onSubmit={ask}>
          <label htmlFor="ask-input">ask anything. it answers once a day.</label>
          <input
            id="ask-input"
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="your question…"
            maxLength={140}
            autoComplete="off"
            disabled={thinking}
          />
          <button type="submit" disabled={!question.trim() || thinking}>
            {thinking ? "it is thinking…" : "ask"}
          </button>
        </form>
      )}
    </div>
  );
}
