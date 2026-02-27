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
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
        <header className="navbar rounded-box bg-base-100 shadow">
          <div className="flex-1">
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                Imposter Clue
              </span>
              <span className="text-base font-semibold">Real-time party game</span>
            </div>
          </div>
          <div className="flex-none">
            <div className="badge badge-outline">Mobile-first</div>
          </div>
        </header>

        <main className="flex-1">
          {state ? <GamePage /> : <HomePage />}
        </main>

        <footer className="mt-6 text-center text-xs opacity-70">
          Built on <span className="font-semibold">PartyKit</span> edge rooms
        </footer>
      </div>
    </div>
  );
};

export default App;

