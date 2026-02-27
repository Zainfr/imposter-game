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
  try {
    const existing = window.sessionStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    // Fallback if storage is unavailable
    return crypto.randomUUID();
  }
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

    const playerId = getOrCreatePlayerId();

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
            set({ state: data.state, playerId: selfId });
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
    const { socket } = get();
    if (socket) {
      const event: ClientEvent = { type: "leave" };
      socket.send(JSON.stringify(event));
      socket.close();
    }
    set({
      status: "disconnected",
      state: null,
      socket: null
    });
  }
}));

