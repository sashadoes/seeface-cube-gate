import { createRoot } from "react-dom/client";
import { World } from "./World.tsx";
import { markLanded } from "./analytics.ts";
import "./world.css";

performance.mark("world-boot");
markLanded();
document.getElementById("boot")?.remove();
createRoot(document.getElementById("root")!).render(<World />);
