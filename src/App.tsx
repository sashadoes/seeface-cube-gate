// Simple and mysterious: the cube is the only thing a visitor faces, plus the
// music switch. /marks adds the marks journey (light beams + visitors' marks).
import Cube from "./components/cube/Cube";
import MusicToggle from "./components/music/MusicToggle";
import OnlineCounter from "./components/online/OnlineCounter";
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { hasEntered } from "./labyrinth/resume";

// the marks mode (and its 3D engine) is only downloaded on /marks
const MarksMode = lazy(() => import("./marks/MarksMode"));
const Labyrinth = lazy(() => import("./labyrinth/Labyrinth"));
const Privacy = lazy(() => import("./components/privacy/Privacy"));
const Watch = lazy(() => import("./watch/Watch"));
const Artists = lazy(() => import("./components/artists/Artists"));
// The Architects: invite → application → Creation Chamber → admin review
const ArchInvite = lazy(() => import("./architects/Invite"));
const ArchJoin = lazy(() => import("./architects/Join"));
const ArchTerms = lazy(() => import("./architects/Terms"));
const ARCH_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  "/architects": ArchInvite,
  "/architects/join": ArchJoin,
  "/architects/terms": ArchTerms,
};

const path = location.pathname.replace(/\/+$/, "");

// people who've already been inside skip the cube and go straight back in
// (seeface.world/?cube still shows the cube)
if ((path === "" || path === "/") && hasEntered() && !new URLSearchParams(location.search).has("cube")) {
  location.replace("/labyrinth/?from=return");
}
const isMarks = path === "/marks";
const isLabyrinth = path === "/labyrinth";

export default function App() {
  const ArchPage = ARCH_PAGES[path];
  if (ArchPage) {
    return (
      <Suspense fallback={null}>
        <ArchPage />
      </Suspense>
    );
  }
  // the owner's live stats + map (unlisted; see watch/Watch.tsx)
  if (path === "/the-eye") {
    return (
      <Suspense fallback={null}>
        <Watch />
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
