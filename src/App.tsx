// Simple and mysterious: the cube is the only thing a visitor faces, plus the
// music switch. /marks adds the marks journey (light beams + visitors' marks).
import Cube from "./components/cube/Cube";
import MusicToggle from "./components/music/MusicToggle";
import OnlineCounter from "./components/online/OnlineCounter";
import { lazy, Suspense } from "react";
import { hasEntered } from "./labyrinth/resume";

// the marks mode (and its 3D engine) is only downloaded on /marks
const MarksMode = lazy(() => import("./marks/MarksMode"));
const Labyrinth = lazy(() => import("./labyrinth/Labyrinth"));
const Privacy = lazy(() => import("./components/privacy/Privacy"));
const Watch = lazy(() => import("./watch/Watch"));
const Control = lazy(() => import("./control/Control"));
const Artists = lazy(() => import("./components/artists/Artists"));
const Brands = lazy(() => import("./components/brands/Brands"));

const path = location.pathname.replace(/\/+$/, "");

// people who've already been inside skip the cube and go straight back in
// (seeface1.world/?cube still shows the cube)
if ((path === "" || path === "/") && hasEntered() && !new URLSearchParams(location.search).has("cube")) {
  location.replace("/labyrinth/?from=return");
}
const isMarks = path === "/marks";
const isLabyrinth = path === "/labyrinth";

export default function App() {
  // the owner's live stats + map (unlisted; see watch/Watch.tsx)
  if (path === "/the-eye") {
    return (
      <Suspense fallback={null}>
        <Watch />
      </Suspense>
    );
  }
  // the owner's control room: services, processes, deploy/restart (see control/Control.tsx)
  if (path === "/control") {
    return (
      <Suspense fallback={null}>
        <Control />
      </Suspense>
    );
  }
  if (path === "/artists") {
    return (
      <Suspense fallback={null}>
        <Artists />
      </Suspense>
    );
  }
  if (path === "/brands") {
    return (
      <Suspense fallback={null}>
        <Brands />
      </Suspense>
    );
  }
  if (path === "/privacy") {
    return (
      <Suspense fallback={null}>
        <Privacy />
      </Suspense>
    );
  }
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
