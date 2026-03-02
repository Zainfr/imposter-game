import React, { useEffect } from "react";
import { HomePage } from "./HomePage";
import { GamePage } from "./GamePage";
import { useGameStore } from "../hooks/useGameStore";
import { useThemeStore, THEMES } from "../hooks/useThemeStore";

const App: React.FC = () => {
  const state = useGameStore((s) => s.state);
  const setRoomCode = useGameStore((s) => s.setRoomCode);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const initTheme = useThemeStore((s) => s.initTheme);

  // Restore persisted theme on first mount
  useEffect(() => {
    initTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      if (typeof window === "undefined") return;
      const path = window.location.pathname;
      const match = path.match(/^\/room\/([A-Za-z0-9]+)$/i);
      if (match) {
        setRoomCode(match[1].toUpperCase());
      }
    };

    syncFromUrl();

    const onPopState = () => {
      syncFromUrl();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setRoomCode]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <header className="navbar sticky top-0 z-50 bg-base-100/90 backdrop-blur border-b border-base-200 px-4 py-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                SusBabyGronkImposter
              </span>
              <span className="text-sm font-semibold truncate">Real-time party game</span>
            </div>
          </div>

          <div className="flex-none gap-2 items-center">

          {/* Theme picker — only visible on the homepage (no active game) */}
          {!state && (
            <div className="dropdown dropdown-end">
              <div tabIndex={0} role="button" className="btn btn-ghost btn-xs gap-1.5" title="Change theme">
                {/* Palette icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4 opacity-60 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M12 3a9 9 0 1 0 6.09 15.67A2 2 0 0 0 16.5 15H15a3 3 0 0 1-3-3V9.5a.5.5 0 0 1 .5-.5H15a3 3 0 0 0 0-6h-3zM12 5h3a1 1 0 0 1 0 2h-2.5A2.5 2.5 0 0 0 10 9.5V12a5 5 0 0 0 5 5h1.12a.5.5 0 0 1 .38.83A7 7 0 1 1 12 5z" />
                  <circle cx="7.5" cy="12.5" r="1.25" />
                  <circle cx="9"   cy="8.5"  r="1.25" />
                  <circle cx="13"  cy="6.5"  r="1.25" />
                  <circle cx="16"  cy="9.5"  r="1.25" />
                </svg>
                <span className="text-xs font-medium">
                  {THEMES.find((t) => t.id === theme)?.label ?? "Theme"}
                </span>
              </div>

              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 rounded-box z-50 w-36 p-1 shadow text-xs"
              >
                {THEMES.map((t) => (
                  <li key={t.id}>
                    <a
                      className={t.id === theme ? "active" : ""}
                      onClick={() => setTheme(t.id as typeof theme)}
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
        </header>

        <main className="flex-1 px-4 py-6">
          {/* Live indicator */}
            <div className="flex w-fit items-center gap-1 mb-4 bg-success/10 text-success text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Live
            </div>
          {state ? <GamePage /> : <HomePage />}
        </main>

        <footer className="px-4 py-6 text-center text-xs opacity-70">
          Built by <span className="font-semibold">@zaintfr</span> on Instagram
        </footer>
      </div>
    </div>
  );
};

export default App;
