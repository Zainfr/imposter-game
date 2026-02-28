import { create } from "zustand";
import type {
  GameState,
  ServerEvent,
  ClientEvent,
  WordCategoryId
} from "../../../shared/event.contracts";
import { createGameSocket } from "../../partySocket";
import type PartySocket from "partysocket";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface GameStore {
  name: string;
  roomCode: string;
  playerId: string | null;
  status: ConnectionStatus;
  state: GameState | null;
  error?: string;
  socket: PartySocket | null;
  categoryId: WordCategoryId;
  timerWarning: boolean;

  setName(name: string): void;
  setRoomCode(code: string): void;
  setCategoryId(categoryId: WordCategoryId): void;
  connectAndJoin(): void;
  startGame(): void;
  submitClue(clue: string): void;
  submitVote(targetId: string): void;
  submitImposterGuess(word: string): void;
  leave(): void;
}

const PLAYER_ID_KEY = "imposter-clue-player-id";

function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();

  // Use sessionStorage so each browser tab gets its own player id.
  // We store it once per tab; clearing is done explicitly on a fresh join.
  try {
    const existing = window.sessionStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Generate and persist a brand-new player ID (used when entering a new room) */
function refreshPlayerId(): string {
  const id = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(PLAYER_ID_KEY, id);
  } catch { /* ignore */ }
  return id;
}

export const useGameStore = create<GameStore>((set, get) => ({
  name: "",
  roomCode: "",
  playerId: null,
  status: "disconnected",
  state: null,
  error: undefined,
  socket: null,
  categoryId: "clash_royale",
  timerWarning: false,

  setName(name: string) {
    set({ name });
  },

  setRoomCode(code: string) {
    set({ roomCode: code.toUpperCase() });
  },

  setCategoryId(categoryId: WordCategoryId) {
    set({ categoryId });
  },

  connectAndJoin() {
    const { name, roomCode, socket, status } = get();
    if (!name.trim() || !roomCode.trim()) return;
    if (status === "connecting" || status === "connected") return;
    if (socket) {
      socket.close();
    }

    // Always generate a fresh ID when joining.  Re-using a stale ID from a
    // previous room would cause the new room's server to treat this socket as
    // a "reconnection" of an unknown player.
    const playerId = refreshPlayerId();

    set({
      status: "connecting",
      playerId,
      error: undefined,
      state: null
    });

    const ws = createGameSocket({
      room: roomCode.trim(),
      id: playerId,
      onOpen: () => {
        const joinEvent: ClientEvent = {
          type: "join",
          name: name.trim()
        };
        ws.send(JSON.stringify(joinEvent));
        set({ status: "connected" });
      },
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data) as ServerEvent;
          if (data.type === "state_update") {
            const selfId = data.state.selfId ?? null;
            // Clear warning when a fresh state arrives (phase may have changed)
            set({ state: data.state, playerId: selfId, timerWarning: false });
          } else if (data.type === "timer_sync") {
            // Patch only the timer fields to avoid full re-render
            const cur = get().state;
            if (cur) {
              set({
                state: {
                  ...cur,
                  timerEndsAt: data.timerEndsAt ?? cur.timerEndsAt,
                  turnEndsAt: data.turnEndsAt ?? cur.turnEndsAt
                }
              });
            }
          } else if (data.type === "timer_warning") {
            set({ timerWarning: true });
          } else if (data.type === "error") {
            set({ error: data.message });
          }
        } catch {
          // ignore malformed messages
        }
      },
      onClose: () => {
        set({ status: "disconnected", socket: null });
      },
      onError: () => {
        set({
          status: "disconnected",
          error: "Connection error. Please try again."
        });
      }
    });

    set({ socket: ws });
  },

  startGame() {
    const { socket, categoryId } = get();
    if (!socket) return;
    const event: ClientEvent = { type: "start_game", categoryId };
    socket.send(JSON.stringify(event));
  },

  submitClue(clue: string) {
    const { socket } = get();
    if (!socket) return;
    const event: ClientEvent = { type: "submit_clue", clue };
    socket.send(JSON.stringify(event));
  },

  submitVote(targetId: string) {
    const { socket } = get();
    if (!socket) return;
    const event: ClientEvent = { type: "submit_vote", targetId };
    socket.send(JSON.stringify(event));
  },

  submitImposterGuess(word: string) {
    const { socket } = get();
    if (!socket) return;
    const event: ClientEvent = { type: "imposter_guess", word };
    socket.send(JSON.stringify(event));
  },

  leave() {
    const { socket, state } = get();
    if (socket) {
      // Send leave event and give the server a moment to process it before
      // closing the socket — avoids the race where the socket closes before
      // the leave message is delivered.
      try {
        const event: ClientEvent = { type: "leave" };
        socket.send(JSON.stringify(event));
      } catch { /* socket may already be closing */ }

      setTimeout(() => socket.close(), 150);
    }
    set({
      status: "disconnected",
      // Preserve the final game state on the finished screen so players can
      // see results. Only clear it when they navigate back to home.
      state: state?.phase === "finished" ? state : null,
      socket: null,
      timerWarning: false
    });
  }
}));

