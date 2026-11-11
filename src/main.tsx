import { createRoot } from "react-dom/client";
import { App } from "./editor/App";
import "./theme.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(<App />);
