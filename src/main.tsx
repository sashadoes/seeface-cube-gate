import { createRoot } from "react-dom/client";
import "./global-styles.scss";
import App from "./App";

// No <StrictMode>: the legacy cube code binds global listeners in useEffect
// without cleanup, so a double-mount would register everything twice.
createRoot(document.getElementById("root")!).render(<App />);
