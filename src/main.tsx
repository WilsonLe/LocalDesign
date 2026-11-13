import { createRoot } from "react-dom/client";
import { App } from "./editor/App";
import { applyTheme, readTheme } from "./editor/ThemeToggle";
import "./theme.css";
import "./style.css";
applyTheme(readTheme());
createRoot(document.getElementById("root")!).render(<App />);
