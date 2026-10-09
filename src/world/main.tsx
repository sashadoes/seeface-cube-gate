import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { World } from "./World.tsx";
import { markLanded } from "./analytics.ts";
import "./world.css";

performance.mark("world-boot");
markLanded();
document.getElementById("boot")?.remove();
// a crash in an overlay must never black out the world: show a quiet reload line instead
class Guard extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  componentDidCatch(e: unknown) {
    console.error("world crashed", e);
  }
  render() {
    return this.state.err ? <button className="w-crash" onClick={() => location.reload()}>something broke · tap to come back</button> : this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <Guard>
    <World />
  </Guard>,
);
