import React, { useEffect } from "react";
import { HomePage } from "./HomePage";
import { GamePage } from "./GamePage";
import { useGameStore } from "../hooks/useGameStore";

const App: React.FC = () => {
  const state = useGameStore((s) => s.state);
   const setRoomCode = useGameStore((s) => s.setRoomCode);

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
        <div className="flex-none gap-2">
          <div className="flex items-center gap-1.5 bg-success/10 text-success text-xs font-semibold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </div>
        </div>
      </header>

        <main className="flex-1 px-4 py-6">
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

