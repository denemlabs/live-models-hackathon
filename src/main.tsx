import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./wonderbook.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App
      designPreview={
        new URLSearchParams(location.search).get("preview") === "story"
      }
    />
  </React.StrictMode>,
);
