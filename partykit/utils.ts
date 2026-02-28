import type { GameState, Player, Phase } from "../shared/event.contracts";

export const TURN_SECONDS = 60;
export const VOTING_SECONDS = 60;
export const GUESS_SECONDS = 40;
export const DISCONNECT_GRACE_MS = 2 * 60 * 1000;

export function computeClueSeconds(playerCount: number): number {
  return playerCount * TURN_SECONDS + 15;
}

export function createInitialState(): GameState {
  return {
    phase: "lobby",
    round: 0,
    maxRounds: 3,
    players: {},
    secretWord: "",
    imposterWord: null,
    votes: {},
    clues: {}
  };
}

export function pickImposter(players: Record<string, Player>): string | null {
  const ids = Object.keys(players);
  if (ids.length === 0) return null;
  const index = Math.floor(Math.random() * ids.length);
  return ids[index] ?? null;
}

export function isActionAllowed(state: GameState, expected: Phase): boolean {
  return state.phase === expected;
}

export function serialize<T>(event: T): string {
  return JSON.stringify(event);
}

