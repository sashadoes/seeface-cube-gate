// Port of reference/evershop-original/extension-src/pages/frontStore/all/Entery.tsx
// with the riddle -> cube gating re-enabled. EverShop-only parts (activator
// fetch to :3001, /api/check/email) are not wired in this standalone project.
import { useState } from "react";

import { getYearsDay } from "./components/helper.js";
import dailyPasses from "./config/dailyPass.json";
import magicPasses from "./config/magicPass.json";

import WelcomeForm from "./components/welcomeForm/WelcomeForm";
import Cube from "./components/cube/Cube";
import { track } from "./analytics";

const ACCESS_KEY = "access-code-contraface";
const enteryCode = dailyPasses[getYearsDay()];

const url = new URL(window.location.href);

// ?special=<magic pass> grants access for today
const special = url.searchParams.get("special");
if (special && magicPasses.includes(special)) {
  localStorage.setItem(ACCESS_KEY, enteryCode);
}

// dev shortcut: ?screen=cube skips the riddle
const forcedScreen = url.searchParams.get("screen");

export default function App() {
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const [screen, setScreen] = useState(forcedScreen === "cube" ? "cube" : "form");

  if (accessToken === enteryCode && !forcedScreen) {
    return <div id="shop-unlocked">Gate open — shop goes here.</div>;
  }

  if (screen === "form") {
    return <WelcomeForm
        openCube={() => {
          track("cube-opened");
          setScreen("cube");
        }}
      />;
  }

  return <Cube />;
}
