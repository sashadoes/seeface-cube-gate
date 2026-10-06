// Simple and mysterious: the cube is the only thing a visitor faces, plus the
// music switch. /marks adds the marks journey (light beams + visitors' marks).
import Cube from "./components/cube/Cube";
import MusicToggle from "./components/music/MusicToggle";
import { lazy, Suspense } from "react";

// the marks mode (and its 3D engine) is only downloaded on /marks
const MarksMode = lazy(() => import("./marks/MarksMode"));

const isMarks = location.pathname.replace(/\/+$/, "") === "/marks";

export default function App() {
  return (
    <>
      <Cube />
      <MusicToggle />
      {isMarks && (
        <Suspense fallback={null}>
          <MarksMode />
        </Suspense>
      )}
    </>
  );
}
