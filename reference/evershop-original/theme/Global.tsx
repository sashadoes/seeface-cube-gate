import React from "react";
import { ComponentLayout } from "@evershop/evershop";
import "./global-styles.scss"; // Your global styles

export default function Global() {
  window.stop();
  setTimeout(
    () => (document.getElementsByClassName("wrapper").className = "hi"),
    10000
  );
  // This component doesn't need to render anything visible
  return <></>;
}

export const layout: ComponentLayout = {
  areaId: "head", // This will include the component in the head section
  sortOrder: 1, // Lower numbers load first
};
