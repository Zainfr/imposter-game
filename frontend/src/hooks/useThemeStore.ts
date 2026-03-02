import { create } from "zustand";

export type ThemeId =
  | "forest"
  | "retro"
  | "valentine"
  | "aqua"
  | "black"
  | "night"
  | "acid"
  | "coffee"
  | "nord"
  | "caramellatte";

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

export const THEMES: ThemeOption[] = [
  { id: "forest",      label: "🌲 Forest" },
  { id: "retro",       label: "📻 Retro" },
  { id: "valentine",   label: "🌸 Valentine" },
  { id: "aqua",        label: "🌊 Aqua" },
  { id: "black",       label: "⬛ Black" },
  { id: "night",       label: "🌙 Night" },
  { id: "acid",        label: "🧪 Acid" },
  { id: "coffee",      label: "☕ Coffee" },
  { id: "nord",        label: "❄️ Nord" },
  { id: "caramellatte",label: "🍮 Caramellatte" },
];

const STORAGE_KEY = "imposter-clue-theme";
const DEFAULT_THEME: ThemeId = "forest";

function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }
}

interface ThemeStore {
  theme: ThemeId;
  setTheme(theme: ThemeId): void;
  initTheme(): void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: DEFAULT_THEME,

  initTheme() {
    const theme = loadTheme();
    applyTheme(theme);
    set({ theme });
  },

  setTheme(theme: ThemeId) {
    applyTheme(theme);
    set({ theme });
  },
}));
