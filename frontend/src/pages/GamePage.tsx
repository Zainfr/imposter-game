import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../hooks/useGameStore";
import type {
  Phase,
  Player,
  WordCategoryId
} from "../../../shared/event.contracts";

function useCountdown(endsAt: number | undefined): number | undefined {
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(undefined);
      return;
    }

    const tick = () => {
      const ms = endsAt - Date.now();
      setRemaining(Math.max(0, Math.round(ms / 1000)));
      if (ms > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    tick();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [endsAt]);

  return remaining;
}

const PhasePill: React.FC<{ phase: Phase; timerEndsAt?: number }> = ({
  phase,
  timerEndsAt
}) => {
  const remaining = useCountdown(timerEndsAt);

  const label =
    phase === "lobby"
      ? "Lobby"
      : phase === "clue"
      ? "Clue"
      : phase === "voting"
      ? "Voting"
      : phase === "guess"
      ? "Imposter guess"
      : "Finished";

  const isUrgent = typeof remaining === "number" && remaining <= 10 && remaining > 0;

  return (
    <div className="badge badge-outline gap-2">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isUrgent ? "bg-error animate-pulse" : "bg-success"
        }`}
      />
      <span>{label}</span>
      {typeof remaining === "number" && remaining > 0 && (
        <span
          className={`badge badge-sm ${
            isUrgent ? "badge-error" : "badge-ghost"
          }`}
        >
          {remaining}s
        </span>
      )}
    </div>
  );
};

const TimerWarningBanner: React.FC<{ secondsLeft?: number }> = ({
  secondsLeft
}) => {
  return (
    <div className="alert alert-warning shadow-md animate-bounce-once">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5 shrink-0 stroke-current"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span className="font-semibold">
        ⏰ Hurry!{" "}
        {typeof secondsLeft === "number"
          ? `~${secondsLeft} seconds`
          : "Time"}{" "}
        left for this phase!
      </span>
    </div>
  );
};

const TurnTimer: React.FC<{
  isMyTurn: boolean;
  turnEndsAt?: number;
}> = ({ isMyTurn, turnEndsAt }) => {
  const remaining = useCountdown(turnEndsAt);

  if (typeof remaining !== "number" || remaining <= 0) return null;

  const isUrgent = remaining <= 7;

  return (
    <div
      className={`flex items-center gap-2 rounded-box px-3 py-1 text-sm font-semibold ${
        isUrgent
          ? "bg-error text-error-content animate-pulse"
          : "bg-warning text-warning-content"
      }`}
    >
      <span>{isMyTurn ? "Your turn ends in" : "Turn ends in"}</span>
      <span className="tabular-nums">{remaining}s</span>
    </div>
  );
};

export const GamePage: React.FC = () => {
  const state = useGameStore((s) => s.state);
  const name = useGameStore((s) => s.name);
  const roomCode = useGameStore((s) => s.roomCode);
  const playerId = useGameStore((s) => s.playerId);
  const startGame = useGameStore((s) => s.startGame);
  const submitClue = useGameStore((s) => s.submitClue);
  const submitVote = useGameStore((s) => s.submitVote);
  const submitImposterGuess = useGameStore((s) => s.submitImposterGuess);
  const leave = useGameStore((s) => s.leave);
  const timerWarning = useGameStore((s) => s.timerWarning);

  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");

  const phaseRemaining = useCountdown(state?.timerEndsAt);

  const me: Player | undefined = useMemo(
    () => (state ? state.players[playerId ?? ""] : undefined),
    [state, playerId]
  );

  if (!state || !playerId) {
    return null;
  }

  const players = Object.values(state.players);
  const canStart = state.phase === "lobby" && players.length >= 4;

  const myClue =
    state.clues[state.round]?.[playerId] ??
    "";

  const hasVoted = Boolean(state.votes[playerId]);
  const currentTurnPlayer =
    state.currentTurnPlayerId && state.players[state.currentTurnPlayerId];
  const isMyTurn = state.currentTurnPlayerId === playerId;
  const currentRoundClues = state.clues[state.round] ?? {};

  const handleSubmitClue = () => {
    const trimmed = clue.trim();
    if (!trimmed) return;
    submitClue(trimmed);
    setClue("");
  };

  const handleSubmitGuess = () => {
    const trimmed = guess.trim();
    if (!trimmed) return;
    submitImposterGuess(trimmed);
    setGuess("");
  };

  return (
    <div className="flex h-full flex-col gap-4 pt-4">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs opacity-70">Room</div>
          <div className="text-xl font-bold tracking-widest">{roomCode}</div>
          <div className="flex flex-wrap items-center gap-2">
            <PhasePill phase={state.phase} timerEndsAt={state.timerEndsAt} />
            {me?.isImposter ? (
              <div className="badge badge-error badge-outline">Imposter</div>
            ) : state.secretWord ? (
              <div className="badge badge-primary badge-outline">
                Word: <span className="ml-1 font-semibold">{state.secretWord}</span>
              </div>
            ) : (
              <div className="badge badge-ghost">Waiting for word…</div>
            )}
            {state.categoryId && (
              <div className="badge badge-ghost badge-sm">
                {formatCategoryLabel(state.categoryId)}
              </div>
            )}
          </div>
        </div>

        <button type="button" onClick={leave} className="btn bg-error btn-xs px-2 py-1">
          Leave
        </button>
      </header>

      {timerWarning &&
        state.phase !== "lobby" &&
        state.phase !== "finished" && (
          <TimerWarningBanner secondsLeft={phaseRemaining} />
        )}

      <section className="card bg-base-100 shadow">
        <div className="card-body p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="card-title text-base">Players</h2>
            <div className="badge badge-ghost">{players.length}</div>
          </div>

          {state.phase === "lobby" && (
            <button
              type="button"
              disabled={!canStart}
              onClick={startGame}
              className="btn btn-primary w-full"
            >
              Start game
              <span className="ml-2 opacity-70">(min 4)</span>
            </button>
          )}

          <ul className="mt-3 flex flex-col gap-2 text-sm">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-box bg-base-200 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="avatar placeholder">
                  <span className="bg-neutral text-neutral-content flex items-center justify-center rounded-full w-9 h-9">
                  {p.name.slice(0, 2).toUpperCase()}
                  </span>
                </span>
                <div className="flex flex-col">
                  <span
                    className={`text-sm ${
                      p.id === playerId ? "font-semibold" : ""
                    }`}
                  >
                    {p.name}
                    {p.id === playerId && (
                      <span className="badge badge-secondary badge-outline badge-sm ml-2">
                        You
                      </span>
                    )}
                    {state.phase === "clue" &&
                      state.currentTurnPlayerId === p.id && (
                        <span className="badge badge-warning badge-sm ml-2">
                          Turn ▶
                        </span>
                      )}
                  </span>
                  <span className="text-xs opacity-70">
                    {p.connected ? "Connected" : "Reconnecting…"}
                  </span>
                </div>
              </div>
              <span className="badge badge-outline">{p.score} pts</span>
            </li>
          ))}
        </ul>
        </div>
      </section>

      {state.phase === "clue" && (
        <section className="card bg-base-100 shadow">
          <div className="card-body p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="card-title text-base">
                Round {state.round}: clues
              </h2>
              <TurnTimer isMyTurn={isMyTurn} turnEndsAt={state.turnEndsAt} />
            </div>

            {currentTurnPlayer && (
              <p className="text-sm opacity-70">
                Turn:{" "}
                <span className="font-semibold">
                  {currentTurnPlayer.name}
                  {isMyTurn && " (you)"}
                </span>
              </p>
            )}

            <div className="mt-3 space-y-2">
              {Object.entries(currentRoundClues).length > 0 ? (
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-box bg-base-200 p-3 text-sm">
                  {Object.entries(currentRoundClues).map(
                    ([pid, textValue]) => {
                      const p = state.players[pid];
                      if (!p) return null;
                      return (
                        <div
                          key={pid}
                          className="flex items-start gap-2 rounded-box bg-base-100 px-3 py-2"
                        >
                          <span className="avatar placeholder">
                            <span className="bg-neutral text-neutral-content flex items-center justify-center rounded-full w-7 h-7 text-xs">
                              {p.name.slice(0, 2).toUpperCase()}
                            </span>
                          </span>
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold">
                              {p.name}
                              {pid === playerId && " (you)"}
                            </span>
                            <span className="text-sm">{textValue}</span>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                <p className="text-sm opacity-60">
                  No clues yet. Waiting for the first player.
                </p>
              )}
            </div>

            {myClue ? (
              <div className="alert alert-success mt-3 text-sm">
                <span>
                  You submitted: <span className="font-semibold">{myClue}</span>
                </span>
              </div>
            ) : isMyTurn ? (
              <>
                <p className="mt-3 text-sm opacity-70">
                  Describe the secret without giving it away. Short, clever,
                  single phrase.
                </p>
                <textarea
                  rows={2}
                  maxLength={80}
                  className="textarea textarea-bordered w-full"
                  placeholder="Mysterious, sandy and very sunny…"
                  value={clue}
                  onChange={(e) => setClue(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSubmitClue}
                  disabled={!clue.trim().length}
                  className="btn btn-primary w-full"
                >
                  Submit clue
                </button>
              </>
            ) : (
              <p className="mt-3 text-sm opacity-70">
                Wait for your turn to write a clue.
              </p>
            )}
          </div>
        </section>
      )}

      {state.phase === "voting" && (
        <section className="card bg-base-100 shadow">
          <div className="card-body p-5">
          <h2 className="card-title text-base">
            Who is the imposter?
          </h2>
          <p className="text-sm opacity-70">
            Tap a player to cast your vote. You can&apos;t vote for yourself.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {players
              .filter((p) => p.id !== playerId)
              .map((p) => {
                const votesFor = Object.values(state.votes).filter(
                  (v) => v === p.id
                ).length;
                const isMyVote = state.votes[playerId] === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={hasVoted && !isMyVote}
                    onClick={() => submitVote(p.id)}
                    className={`btn h-auto min-h-0 flex-col items-center gap-0 px-3 py-3 text-left ${
                      isMyVote ? "btn-error" : "btn-ghost"
                    }`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs opacity-70">
                      {votesFor} vote{votesFor === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
          </div>
          </div>
        </section>
      )}

      {state.phase === "guess" && me?.isImposter && (
        <section className="card bg-base-100 shadow">
          <div className="card-body p-5">
          <h2 className="card-title text-base text-error">
            Final guess
          </h2>
          <p className="text-sm opacity-70">
            You&apos;re the imposter. If you guess the team&apos;s secret word
            correctly, you win.
          </p>
          <input
            maxLength={32}
            className="input input-bordered w-full"
            placeholder="Type your guess…"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
          />
          <button
            type="button"
            onClick={handleSubmitGuess}
            disabled={!guess.trim().length}
            className="btn btn-error w-full"
          >
            Submit guess
          </button>
          </div>
        </section>
      )}

      {state.phase === "guess" && !me?.isImposter && (
        <section className="card bg-base-200 shadow">
          <div className="card-body p-5">
            <h2 className="card-title text-base">Waiting…</h2>
            <p className="text-sm opacity-70">
              The imposter is making their final guess. Hang tight!
            </p>
          </div>
        </section>
      )}

      {state.phase === "finished" && (
        <section className="card bg-base-100 shadow">
          <div className="card-body p-5">
          <h2 className="card-title text-base">
            Game finished
          </h2>
          <p className="text-sm opacity-70">
            Start a fresh room from the home screen to play again.
          </p>
          </div>
        </section>
      )}

      <section className="mt-auto text-xs opacity-70">
        Playing as{" "}
        <span className="font-semibold">{name}</span>.
      </section>
    </div>
  );
};

function formatCategoryLabel(categoryId: WordCategoryId): string {
  switch (categoryId) {
    case "clash_royale":
      return "Clash Royale";
    case "animals":
      return "Animals";
    case "countries":
      return "Countries";
    default:
      return categoryId;
  }
}

