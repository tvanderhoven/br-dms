import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { installDemoMode } from "./demo";

// Online-Demo ohne echtes Backend (siehe frontend/README-DEMO.md) – nur aktiv,
// wenn mit "npm run build:demo" bzw. "npm run dev:demo" gebaut/gestartet wurde.
if (import.meta.env.VITE_DEMO_MODE === "true") {
  installDemoMode();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
