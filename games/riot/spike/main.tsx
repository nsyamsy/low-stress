import React from "react";
import ReactDOM from "react-dom/client";
import { SpikeApp } from "./SpikeApp";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SpikeApp />
    </React.StrictMode>,
  );
}
