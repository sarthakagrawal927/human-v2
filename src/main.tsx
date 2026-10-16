import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "./Home";
import "./styles.css";
import "./life-theatre.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root.");
createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
