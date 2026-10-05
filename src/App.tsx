// The cube is the first and only thing a visitor faces. The old riddle screen
// (components/welcomeForm) is kept in the repo but no longer part of the flow.
import Cube from "./components/cube/Cube";
import MusicToggle from "./components/music/MusicToggle";
// AskCube (components/oracle) is parked: answers were on-screen text.

export default function App() {
  return (
    <>
      <Cube />
      <MusicToggle />
    </>
  );
}
