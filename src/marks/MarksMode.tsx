import { useEffect, useRef, useState } from "react";
import { memory } from "../components/cube/memory";
import { newRoomSkin } from "../components/cube/alive";
import { track } from "../analytics";
import { filterMark, MAX_MARK } from "./filter";
import { marksStore, type Mark } from "./store";
import { addMark, chamberTransition, initScene, showChamber } from "./scene";

// /marks: an endless journey through chambers. Every 12 spins the room moves
// on to a new chamber with a different set of marks on the wall. Once someone
// has spun the cube 12 times in total, the cube sometimes offers a quill:
// tap it to leave a mark of your own. Marks are auto-filtered.

const CHAMBER_EVERY = 12;
const EARN_AFTER = 12;
const QUILL_CHANCE = 0.18;
const QUILL_MS = 7000;
const COOLDOWN_MS = 3 * 60 * 1000; // one mark per 3 minutes per browser
const LAST_KEY = "seeface-marks-last";

const swallow = (e: React.SyntheticEvent) => e.stopPropagation();
const guards = {
  onMouseDown: swallow,
  onMouseUp: swallow,
  onPointerDown: swallow,
  onPointerUp: swallow,
  onTouchStart: swallow,
  onTouchEnd: swallow,
  onTouchMove: swallow,
  onClick: swallow,
};

function lastMarkAt() {
  try {
    return Number(localStorage.getItem(LAST_KEY) || 0);
  } catch {
    return 0;
  }
}

export default function MarksMode() {
  const [quill, setQuill] = useState(false);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [rejected, setRejected] = useState(false);
  const all = useRef<Mark[]>([]);
  const quillTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);

  useEffect(() => {
    const keeper = new URLSearchParams(location.search).has("keeper");
    initScene({
      keeper,
      onRemove: (m) => {
        all.current = all.current.filter((x) => x.id !== m.id);
        marksStore.remove(m.id);
      },
    });
    marksStore.list(200).then((ms) => {
      all.current = ms;
      showChamber(ms);
    });
    const unsub = marksStore.subscribe((m) => {
      if (!all.current.some((x) => x.id === m.id)) all.current = [...all.current, m];
    });
    track("marks-opened");

    let chamber = 0;
    const onSpin = (e: Event) => {
      const step = (e as CustomEvent<{ step: number }>).detail.step;

      // the journey: a new chamber every 12 spins, forever
      if (step % CHAMBER_EVERY === 0) {
        chamber += 1;
        track(`chamber-${Math.min(chamber, 50)}`);
        chamberTransition(() => {
          newRoomSkin();
          showChamber(all.current);
        });
      }

      // earned: after 12 spins in total, the cube sometimes offers a quill
      const earned = memory.spins >= EARN_AFTER;
      const cooled = Date.now() - lastMarkAt() > COOLDOWN_MS;
      if (earned && cooled && !busy.current && Math.random() < QUILL_CHANCE) {
        busy.current = true;
        setQuill(true);
        track("quill-offered");
        quillTimer.current = setTimeout(() => {
          setQuill(false);
          busy.current = false;
        }, QUILL_MS);
      }
    };
    window.addEventListener("cube-spin", onSpin);
    return () => {
      window.removeEventListener("cube-spin", onSpin);
      unsub();
      clearTimeout(quillTimer.current);
    };
  }, []);

  const openComposer = () => {
    clearTimeout(quillTimer.current);
    setQuill(false);
    setComposing(true);
    track("quill-taken");
  };

  const leave = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = filterMark(text);
    if (!clean) {
      setRejected(true);
      track("mark-rejected");
      setTimeout(() => setRejected(false), 450);
      return;
    }
    const m = await marksStore.add(clean);
    all.current = [...all.current, m];
    addMark(m);
    try {
      localStorage.setItem(LAST_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    track("mark-left");
    setText("");
    setComposing(false);
    busy.current = false;
  };

  const cancel = () => {
    setComposing(false);
    busy.current = false;
  };

  return (
    <>
      {quill && (
        <button className="marks-quill" aria-label="leave a mark" {...guards} onClick={(e) => { e.stopPropagation(); openComposer(); }}>
          ✎
        </button>
      )}
      {composing && (
        <form className={"marks-composer" + (rejected ? " rejected" : "")} onSubmit={leave} {...guards} onClick={swallow}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_MARK}
            placeholder="leave a mark…"
            autoComplete="off"
            enterKeyHint="done"
          />
          <button type="submit" disabled={!text.trim()} aria-label="leave it">
            ✶
          </button>
          <button type="button" className="marks-close" onClick={(e) => { e.stopPropagation(); cancel(); }} aria-label="close">
            ×
          </button>
        </form>
      )}
    </>
  );
}
