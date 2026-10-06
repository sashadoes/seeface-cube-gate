// Simple and mysterious: the cube is the only thing a visitor faces, plus the
// music switch. /marks adds the marks journey (light beams + visitors' marks).
import Cube from "./components/cube/Cube";
import MusicToggle from "./components/music/MusicToggle";
import OnlineCounter from "./components/online/OnlineCounter";
import { lazy, Suspense } from "react";

// the marks mode (and its 3D engine) is only downloaded on /marks
const MarksMode = lazy(() => import("./marks/MarksMode"));
const Labyrinth = lazy(() => import("./labyrinth/Labyrinth"));

const path = location.pathname.replace(/\/+$/, "");
const isMarks = path === "/marks";
const isLabyrinth = path === "/labyrinth";

export default function App() {
  if (isLabyrinth) {
    return (
      <>
        <Suspense fallback={null}>
          <Labyrinth />
        </Suspense>
        <MusicToggle />
      </>
    );
  }
  return (
    <>
      <Cube />
      <MusicToggle />
      <OnlineCounter />
      {isMarks && (
        <Suspense fallback={null}>
          <MarksMode />
        </Suspense>
      )}
    </>
  );
}
