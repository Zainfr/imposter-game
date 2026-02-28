import React from "react";
import { useGameStore } from "../hooks/useGameStore";

const randomRoomId = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

export const HomePage: React.FC = () => {
  const name = useGameStore((s) => s.name);
  const roomCode = useGameStore((s) => s.roomCode);
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const categoryId = useGameStore((s) => s.categoryId);
  const setName = useGameStore((s) => s.setName);
  const setRoomCode = useGameStore((s) => s.setRoomCode);
  const setCategoryId = useGameStore((s) => s.setCategoryId);
  const connectAndJoin = useGameStore((s) => s.connectAndJoin);

  const navigateToRoom = (code: string) => {
    if (typeof window === "undefined") return;
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    window.history.pushState({}, "", `/room/${normalized}`);
    setRoomCode(normalized);
  };

  const handleJoinOrQuickPlay = () => {
    const existing = roomCode.trim();
    const code = existing || randomRoomId();
    // navigateToRoom calls setRoomCode — but that is async state.
    // Pass the resolved code directly to connectAndJoin so the new
    // room code is definitely picked up even on quick play.
    navigateToRoom(code);
    // Sync the store immediately before connectAndJoin reads it
    useGameStore.setState({ roomCode: code });
    connectAndJoin();
  };

  const disabled = !name.trim() || status === "connecting";

  return (
    <div className="flex h-full flex-col">
      <section className="card mb-6 bg-base-100 shadow">
        <div className="card-body p-5">
          <h2 className="card-title text-base">Start a match</h2>
          <p className="text-sm opacity-70">
            4–10 friends. 1 imposter. Real-time clues, accusations, and a final
            guess.
          </p>

          <div className="mt-3 space-y-3">
            <div className="form-control w-full">
              <label className="label py-1" htmlFor="name">
                <span className="label-text">Display name</span>
              </label>
              <input
                id="name"
                autoComplete="off"
                maxLength={18}
                className="input input-bordered w-full"
                placeholder="Detective Nova"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-control w-full">
              <label className="label py-1">
                <span className="label-text">Word category</span>
              </label>
              <div className="join w-full h-full border border-primary">
                <button
                  type="button"
                  className={`btn btn-xs sm:btn-sm h-8 join-item w-1/3 ${
                    categoryId === "clash_royale" ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => setCategoryId("clash_royale")}
                >
                  Clash Royale
                </button>
                <button
                  type="button"
                  className={`btn btn-xs sm:btn-sm h-8 join-item w-1/3 ${
                    categoryId === "animals" ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => setCategoryId("animals")}
                >
                  Animals
                </button>
                <button
                  type="button"
                  className={`btn btn-xs sm:btn-sm h-8 join-item w-1/3 ${
                    categoryId === "countries" ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => setCategoryId("countries")}
                >
                  Countries
                </button>
              </div>
            </div>

            <div className="form-control w-full">
              <label className="label py-1" htmlFor="room">
                <span className="label-text">Room code</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setRoomCode(randomRoomId())}
                >
                  Generate
                </button>
              </label>
              <input
                id="room"
                autoComplete="off"
                className="input input-bordered w-full tracking-widest"
                placeholder="ABCD12"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
            </div>

            <button
              type="button"
              disabled={disabled}
            onClick={handleJoinOrQuickPlay}
              className="btn btn-primary btn-lg w-full"
            >
              {status === "connecting"
                ? "Connecting..."
                : roomCode
                ? "Join room"
                : "Quick play"}
                ⚡
            </button>

            {error && (
              <div className="alert alert-error text-sm" role="alert">
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

