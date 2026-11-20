import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { Providers } from "./app/providers";
import { startWebVitals } from "./shared/observability/web-vitals";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("The root element was not found.");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);

// Measurement starts once for the page load, outside React, so Strict Mode's repeated development renders cannot
// register the same Core Web Vitals listeners twice.
startWebVitals();
