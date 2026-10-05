// Simple and mysterious: the cube is the only thing a visitor faces, plus the
// music switch. No counters, buttons or messages.
import Cube from "./components/cube/Cube";
import MusicToggle from "./components/music/MusicToggle";

export default function App() {
  return (
    <>
      <Cube />
      <MusicToggle />
    </>
  );
}
