import { Moon, Sun } from "lucide-react";
import { Button } from "../components/ui/button";

export type Theme = "light" | "dark";
const themeKey = "localdesign-theme";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(themeKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    // The selected theme still works in this tab when storage is unavailable.
  }
}
export function ThemeToggle({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const label =
    theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  return (
    <Button
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => onChange(theme === "light" ? "dark" : "light")}
    >
      {theme === "light" ? <Moon /> : <Sun />}
    </Button>
  );
}
