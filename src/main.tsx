import { createRoot } from "react-dom/client";
import "./global-styles.scss";
import App from "./App";
import { startEngagement } from "./engagement";
import { startRetention } from "./retention";

startEngagement();
startRetention();

// No <StrictMode>: the legacy cube code binds global listeners in useEffect
// without cleanup, so a double-mount would register everything twice.
createRoot(document.getElementById("root")!).render(<App />);
