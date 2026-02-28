export type Phase = "lobby" | "clue" | "voting" | "guess" | "finished";

export type WordCategoryId = "clash_royale" | "animals" | "countries";

export interface Player {
  id: string;
  name: string;
  isImposter: boolean;
  score: number;
  connected: boolean;
}

export interface GameState {
  phase: Phase;
  round: number;
  maxRounds: number;
  players: Record<string, Player>;
  secretWord: string;
  imposterWord?: string | null;
  categoryId?: WordCategoryId;
  votes: Record<string, string>;
  clues: Record<number, Record<string, string>>;
  timerEndsAt?: number;
  turnEndsAt?: number;
  selfId?: string;
  currentTurnPlayerId?: string;
}

export type ClientEvent =
  | { type: "join"; name: string }
  | { type: "start_game"; categoryId?: WordCategoryId }
  | { type: "submit_clue"; clue: string }
  | { type: "submit_vote"; targetId: string }
  | { type: "imposter_guess"; word: string }
  | { type: "leave" };

export type GameResult = "team" | "imposter";

export type ServerEvent =
  | { type: "state_update"; state: GameState }
  | { type: "player_joined"; player: Player }
  | { type: "player_left"; playerId: string }
  | { type: "phase_changed"; phase: Phase }
  | { type: "game_finished"; result: GameResult }
  | { type: "error"; message: string }
  | { type: "timer_sync"; timerEndsAt?: number; turnEndsAt?: number }
  | { type: "timer_warning"; secondsLeft: number };
