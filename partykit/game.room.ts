import type * as Party from "partykit/server";
import {
  type ClientEvent,
  type GameResult,
  type GameState,
  type Phase,
  type Player,
  type ServerEvent
} from "../shared/event.contracts";
import {
  computeClueSeconds,
  DISCONNECT_GRACE_MS,
  GUESS_SECONDS,
  VOTING_SECONDS,
  TURN_SECONDS,
  ROUND_END_SECONDS,
  createInitialState,
  isActionAllowed,
  pickImposter,
  serialize
} from "./utils";
import { WordService } from "./word.service";
import type { RoundEndReason, WordCategoryId } from "../shared/event.contracts";

type TimerHandle = ReturnType<typeof setTimeout> | null;

export default class GameRoom implements Party.Server {
  readonly room: Party.Room;
  readonly wordService = new WordService();

  state: GameState = createInitialState();
  private phaseTimer: TimerHandle = null;
  /** Timer that auto-advances the current clue turn when a player is idle */
  private turnTimer: TimerHandle = null;
  /** Interval that re-broadcasts timerEndsAt so clients stay in sync */
  private syncInterval: TimerHandle = null;
  /** Timer that fires a warning broadcast 10 seconds before the phase ends */
  private warningTimer: TimerHandle = null;
  private disconnectTimers = new Map<string, TimerHandle>();
  private turnOrder: string[] = [];

  constructor(room: Party.Room) {
    this.room = room;
  }

  readonly options: Party.ServerOptions = {
    hibernate: true
  };

  onStart() {
    this.state = createInitialState();
  }

  onConnect(connection: Party.Connection) {
    const existing = this.state.players[connection.id];
    if (existing) {
      // Reconnection — restore connected flag and cancel removal timer
      this.clearDisconnectTimer(connection.id);
      this.state.players[connection.id] = {
        ...existing,
        connected: true
      };
      this.broadcastStateToAll();
      return;
    }

    // Brand-new socket in a non-lobby room: reject unless the game is finished
    // (finished rooms allow a spectator view while waiting for a reset).
    if (this.state.phase !== "lobby" && this.state.phase !== "finished") {
      this.sendEvent(connection, {
        type: "error",
        message: "Game already started"
      });
      connection.close();
      return;
    }

    // Just send current state — do NOT add the player yet.
    // The client will immediately send a {type:"join",name:"..."} message
    // which is where the player entry is actually created.
    this.sendState(connection);
  }

  onMessage(message: string, sender: Party.Connection) {
    let event: ClientEvent;
    try {
      event = JSON.parse(message) as ClientEvent;
    } catch {
      this.sendError(sender, "Invalid message format");
      return;
    }

    switch (event.type) {
      case "join":
        this.handleJoin(sender, event.name);
        break;
      case "start_game":
        this.handleStartGame(sender, event.categoryId);
        break;
      case "submit_clue":
        this.handleSubmitClue(sender, event.clue);
        break;
      case "submit_vote":
        this.handleSubmitVote(sender, event.targetId);
        break;
      case "imposter_guess":
        this.handleImposterGuess(sender, event.word);
        break;
      case "leave":
        this.handleLeave(sender);
        break;
      default:
        this.sendError(sender, "Unknown event");
    }
  }

  onClose(connection: Party.Connection) {
    const player = this.state.players[connection.id];
    if (!player) return;

    // Cancel any existing grace timer before starting a new one
    // (e.g. rapid disconnect → reconnect → disconnect again)
    this.clearDisconnectTimer(connection.id);

    this.state.players[connection.id] = {
      ...player,
      connected: false
    };

    const leaveEvent: ServerEvent = {
      type: "player_left",
      playerId: connection.id
    };

    this.room.broadcast(serialize(leaveEvent));
    this.broadcastStateToAll();

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(connection.id);
      this.removePlayer(connection.id);
    }, DISCONNECT_GRACE_MS);

    this.disconnectTimers.set(connection.id, timer);
  }

  private handleJoin(connection: Party.Connection, name: string) {
    const trimmedName = name.trim().slice(0, 18) || "Player";

    const existing = this.state.players[connection.id];
    if (existing) {
      this.state.players[connection.id] = {
        ...existing,
        name: trimmedName,
        connected: true
      };
      this.clearDisconnectTimer(connection.id);
    } else {
      if (this.state.phase !== "lobby") {
        this.sendError(connection, "Cannot join after game start");
        return;
      }

      const player: Player = {
        id: connection.id,
        name: trimmedName,
        isImposter: false,
        score: 0,
        connected: true
      };

      this.state.players[player.id] = player;

      const joinEvent: ServerEvent = {
        type: "player_joined",
        player
      };
      this.room.broadcast(serialize(joinEvent));
    }

    this.broadcastStateToAll();
  }

  private handleStartGame(
    connection: Party.Connection,
    categoryId?: WordCategoryId
  ) {
    if (!isActionAllowed(this.state, "lobby")) {
      this.sendError(connection, "Game already started");
      return;
    }

    const connectedPlayers = Object.values(this.state.players).filter(
      (p) => p.connected
    );
    const playerCount = connectedPlayers.length;

    if (playerCount < 4) {
      this.sendError(connection, "Need at least 4 players to start");
      return;
    }

    // Only pick from players who are actually connected right now
    const connectedPlayerIds = Object.values(this.state.players)
      .filter((p) => p.connected)
      .reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<string, Player>);

    const imposterId = pickImposter(connectedPlayerIds);
    if (!imposterId) {
      this.sendError(connection, "Unable to assign imposter");
      return;
    }

    const category: WordCategoryId = categoryId ?? "clash_royale";
    const selection = this.wordService.getRandomWord(category);
    this.state.secretWord = selection.word;
    this.state.imposterWord = null;

    for (const player of Object.values(this.state.players)) {
      player.isImposter = player.id === imposterId;
    }

    this.turnOrder = Object.keys(this.state.players);
    this.state.currentTurnPlayerId = this.getNextTurnPlayerId();

    // Dynamic round duration: every player gets TURN_SECONDS + 15 s buffer
    const clueSeconds = computeClueSeconds(playerCount);

    this.state.phase = "clue";
    this.state.round = 1;
    this.state.clues[1] = {};
    this.state.votes = {};
    this.state.timerEndsAt = this.futureMs(clueSeconds * 1000);
    this.state.turnEndsAt = this.futureMs(TURN_SECONDS * 1000);
    this.state.categoryId = category;

    this.broadcastPhaseChanged("clue");
    this.broadcastStateToAll();
    this.schedulePhaseTimer("clue", this.state.timerEndsAt);
    this.scheduleTurnTimer();
    this.startSyncInterval();
    this.scheduleWarningBroadcast(this.state.timerEndsAt);
  }

  private handleSubmitClue(connection: Party.Connection, clue: string) {
    if (!isActionAllowed(this.state, "clue")) {
      this.sendError(connection, "Not in clue phase");
      return;
    }

    const player = this.state.players[connection.id];
    if (!player) {
      this.sendError(connection, "Unknown player");
      return;
    }

    if (
      this.state.currentTurnPlayerId &&
      this.state.currentTurnPlayerId !== connection.id
    ) {
      this.sendError(connection, "Not your turn to give a clue");
      return;
    }

    const normalized = clue.trim();
    if (!normalized) {
      this.sendError(connection, "Clue cannot be empty");
      return;
    }

    if (normalized.length > 80) {
      this.sendError(connection, "Clue too long");
      return;
    }

    const round = this.state.round;
    if (!this.state.clues[round]) {
      this.state.clues[round] = {};
    }

    if (this.state.clues[round][player.id]) {
      this.sendError(connection, "You already submitted a clue");
      return;
    }

    const now = Date.now();
    if (this.state.timerEndsAt && now > this.state.timerEndsAt) {
      this.sendError(connection, "Clue phase has ended");
      return;
    }

    this.state.clues[round][player.id] = normalized;
    this.broadcastStateToAll();
    this.advanceClueTurn();
  }

  private handleSubmitVote(connection: Party.Connection, targetId: string) {
    if (!isActionAllowed(this.state, "voting")) {
      this.sendError(connection, "Not in voting phase");
      return;
    }

    const player = this.state.players[connection.id];
    if (!player) {
      this.sendError(connection, "Unknown player");
      return;
    }

    if (connection.id === targetId) {
      this.sendError(connection, "Cannot vote for yourself");
      return;
    }

    if (!this.state.players[targetId]) {
      this.sendError(connection, "Invalid vote target");
      return;
    }

    if (this.state.votes[player.id]) {
      this.sendError(connection, "You already voted");
      return;
    }

    const now = Date.now();
    if (this.state.timerEndsAt && now > this.state.timerEndsAt) {
      this.sendError(connection, "Voting phase has ended");
      return;
    }

    this.state.votes[player.id] = targetId;
    this.broadcastStateToAll();

    const eligibleVoters = Object.values(this.state.players).filter(
      (p) => p.connected
    );
    const votesCount = Object.keys(this.state.votes).length;

    if (votesCount >= eligibleVoters.length) {
      this.resolveVoting();
    }
  }

  private handleImposterGuess(connection: Party.Connection, word: string) {
    if (!isActionAllowed(this.state, "guess")) {
      this.sendError(connection, "Not in guess phase");
      return;
    }

    const player = this.state.players[connection.id];
    if (!player || !player.isImposter) {
      this.sendError(connection, "Only imposter may guess");
      return;
    }

    const normalized = word.trim().toLowerCase();
    if (!normalized) {
      this.sendError(connection, "Guess cannot be empty");
      return;
    }

    const result: GameResult =
      normalized === this.state.secretWord.toLowerCase() ? "imposter" : "team";

    this.finishGame(result);
  }

  private handleLeave(connection: Party.Connection) {
    const player = this.state.players[connection.id];
    if (!player) {
      connection.close();
      return;
    }

    if (this.state.phase === "lobby" || this.state.phase === "finished") {
      // In lobby/finished, a leave is permanent — remove immediately.
      this.removePlayer(connection.id);
    } else {
      // During an active game, treat the leave the same as a network drop.
      // Cancel any existing grace timer first to avoid double-removePlayer.
      this.clearDisconnectTimer(connection.id);

      this.state.players[connection.id] = { ...player, connected: false };

      const leaveEvent: ServerEvent = {
        type: "player_left",
        playerId: connection.id
      };
      this.room.broadcast(serialize(leaveEvent));
      this.broadcastStateToAll();

      const timer = setTimeout(() => {
        this.disconnectTimers.delete(connection.id);
        this.removePlayer(connection.id);
      }, DISCONNECT_GRACE_MS);
      this.disconnectTimers.set(connection.id, timer);
    }

    connection.close();
  }


  private startRoundCooldown(reason: RoundEndReason) {
    this.clearPhaseTimer();
    this.clearTurnTimer();
    this.clearWarningTimer();
    this.stopSyncInterval();

    this.state.phase = "round_end";
    this.state.timerEndsAt = this.futureMs(ROUND_END_SECONDS * 1000);
    this.state.turnEndsAt = undefined;
    this.state.currentTurnPlayerId = undefined;
    this.state.roundEndReason = reason;

    this.broadcastPhaseChanged("round_end");
    this.broadcastStateToAll();

    this.phaseTimer = setTimeout(() => {
      if (this.state.phase !== "round_end") return;
      this.doAdvanceFromClue();
    }, ROUND_END_SECONDS * 1000);
  }

  private doAdvanceFromClue() {
    this.clearTurnTimer();
    const nextRound = this.state.round + 1;
    if (nextRound <= this.state.maxRounds) {
      // Recompute based on currently connected players for the new round
      const playerCount = Object.values(this.state.players).filter(
        (p) => p.connected
      ).length;
      const clueSeconds = computeClueSeconds(playerCount);

      this.state.phase = "clue"; // Set phase BEFORE broadcast
      this.state.round = nextRound;
      this.state.clues[nextRound] = {};
      this.state.timerEndsAt = this.futureMs(clueSeconds * 1000);
      this.state.turnEndsAt = this.futureMs(TURN_SECONDS * 1000);
      this.state.currentTurnPlayerId = this.getNextTurnPlayerId();
      this.state.roundEndReason = undefined;
      this.broadcastPhaseChanged("clue");
      this.broadcastStateToAll();
      this.schedulePhaseTimer("clue", this.state.timerEndsAt);
      this.scheduleTurnTimer();
      this.scheduleWarningBroadcast(this.state.timerEndsAt);
      this.startSyncInterval();
    } else {
      this.state.phase = "voting";
      this.state.votes = {}; // Always reset votes cleanly
      this.state.timerEndsAt = this.futureMs(VOTING_SECONDS * 1000);
      this.state.turnEndsAt = undefined;
      this.state.currentTurnPlayerId = undefined;
      this.state.roundEndReason = undefined;
      this.broadcastPhaseChanged("voting");
      this.broadcastStateToAll();
      this.schedulePhaseTimer("voting", this.state.timerEndsAt);
      this.scheduleWarningBroadcast(this.state.timerEndsAt);
      this.startSyncInterval();
    }
  }

  private resolveVoting() {
    this.stopSyncInterval();
    this.clearWarningTimer();
    const tally: Record<string, number> = {};
    for (const target of Object.values(this.state.votes)) {
      tally[target] = (tally[target] ?? 0) + 1;
    }

    let eliminatedId: string | null = null;
    let bestVotes = 0;
    for (const [target, count] of Object.entries(tally)) {
      if (count > bestVotes) {
        bestVotes = count;
        eliminatedId = target;
      } else if (count === bestVotes) {
        eliminatedId = null;
      }
    }

    if (eliminatedId) {
      const eliminated = this.state.players[eliminatedId];
      if (eliminated) {
        if (eliminated.isImposter) {
          for (const player of Object.values(this.state.players)) {
            if (!player.isImposter) {
              player.score += 1;
            }
          }
        } else {
          const imposter = Object.values(this.state.players).find(
            (p) => p.isImposter
          );
          if (imposter) {
            imposter.score += 1;
          }
        }
      }
    }

    this.state.phase = "guess";
    this.state.votes = {}; // Clear votes — not needed after resolution
    this.state.timerEndsAt = this.futureMs(GUESS_SECONDS * 1000);
    this.state.turnEndsAt = undefined;
    this.broadcastPhaseChanged("guess");
    this.broadcastStateToAll();
    this.schedulePhaseTimer("guess", this.state.timerEndsAt);
    this.startSyncInterval();
    this.scheduleWarningBroadcast(this.state.timerEndsAt);
  }

  private finishGame(result: GameResult) {
    this.clearPhaseTimer();
    this.clearTurnTimer();
    this.stopSyncInterval();
    this.clearWarningTimer();
    this.state.phase = "finished";
    this.state.timerEndsAt = undefined;
    this.state.turnEndsAt = undefined;

    const event: ServerEvent = {
      type: "game_finished",
      result
    };

    this.room.broadcast(serialize(event));
    this.broadcastStateToAll();
  }

  /**
   * Schedule the phase-end timer.
   * @param phase   — which phase this timer belongs to
   * @param endsAt  — absolute epoch ms when the phase should end
   */
  private schedulePhaseTimer(phase: Phase, endsAt: number) {
    this.clearPhaseTimer();
    const delay = Math.max(0, endsAt - Date.now());

    this.phaseTimer = setTimeout(() => {
      if (this.state.phase !== phase) return;

      switch (phase) {
        case "clue":
          this.startRoundCooldown("time_up");
          break;
        case "voting":
          this.resolveVoting();
          break;
        case "guess":
          this.finishGame("team");
          break;
        default:
          break;
      }
    }, delay);
  }

  private clearPhaseTimer() {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  private scheduleTurnTimer() {
    this.clearTurnTimer();
    const expectedPlayerId = this.state.currentTurnPlayerId;
    const endsAt = this.futureMs(TURN_SECONDS * 1000);
    this.state.turnEndsAt = endsAt;

    this.turnTimer = setTimeout(() => {
      if (this.state.phase !== "clue") return;
      if (this.state.currentTurnPlayerId !== expectedPlayerId) return;

      // Auto-advance turn (skip current player for this round)
      this.advanceClueTurn();
    }, TURN_SECONDS * 1000);
  }

  private clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private startSyncInterval() {
    this.stopSyncInterval();
    this.syncInterval = setInterval(() => {
      if (
        this.state.phase === "finished" ||
        this.state.phase === "lobby"
      ) {
        this.stopSyncInterval();
        return;
      }
      this.broadcastTimerSync();
    }, 5000) as unknown as TimerHandle;
  }

  private stopSyncInterval() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval as unknown as ReturnType<typeof setInterval>);
      this.syncInterval = null;
    }
  }


  private broadcastTimerSync() {
    const event: ServerEvent = {
      type: "timer_sync",
      timerEndsAt: this.state.timerEndsAt,
      turnEndsAt: this.state.turnEndsAt
    };
    this.room.broadcast(serialize(event));
  }


  private scheduleWarningBroadcast(endsAt: number) {
    this.clearWarningTimer();
    const WARNING_MS = 10_000;
    const delay = Math.max(0, endsAt - Date.now() - WARNING_MS);

    this.warningTimer = setTimeout(() => {
      if (
        this.state.phase === "finished" ||
        this.state.phase === "lobby" ||
        this.state.phase === "round_end" // warning during cooldown is confusing
      )
        return;
      const event: ServerEvent = {
        type: "timer_warning",
        secondsLeft: Math.round(Math.max(0, (endsAt - Date.now()) / 1000))
      };
      this.room.broadcast(serialize(event));
    }, delay);
  }

  private clearWarningTimer() {
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }

  private removePlayer(playerId: string) {
    const existing = this.state.players[playerId];
    if (!existing) return;

    delete this.state.players[playerId];

    // Only end the game if there are fewer than 2 players who are still
    // connected (i.e. actively in the room). Disconnected players in their
    // grace period are not counted so a temporary drop doesn't kill the game.
    const connectedCount = Object.values(this.state.players).filter(
      (p) => p.connected
    ).length;

    if (connectedCount < 2 && Object.keys(this.state.players).length < 2) {
      this.finishGame("imposter");
    } else {
      this.broadcastStateToAll();
    }
  }

  private broadcastStateToAll() {
    for (const connection of this.room.getConnections()) {
      this.sendState(connection);
    }
  }

  private sendState(connection: Party.Connection) {
    this.sendEvent(connection, {
      type: "state_update",
      state: {
        ...this.state,
        selfId: connection.id
      }
    });
  }

  private getNextTurnPlayerId(): string | undefined {
    for (const id of this.turnOrder) {
      const p = this.state.players[id];
      if (p && p.connected) return id;
    }
    return undefined;
  }

  private advanceClueTurn() {
    this.clearTurnTimer();
    const round = this.state.round;
    const currentId = this.state.currentTurnPlayerId;
    const startIndex = currentId
      ? this.turnOrder.indexOf(currentId) + 1
      : 0;

    const total = this.turnOrder.length;
    for (let i = 0; i < total; i++) {
      const idx = (startIndex + i) % total;
      const id = this.turnOrder[idx];
      const player = this.state.players[id];

      // Skip players who have disconnected or are no longer in the game
      if (!player || !player.connected) continue;

      const hasClue = this.state.clues[round]?.[id];
      if (!hasClue) {
        this.state.currentTurnPlayerId = id;
        this.state.turnEndsAt = this.futureMs(TURN_SECONDS * 1000);
        this.broadcastStateToAll();
        this.scheduleTurnTimer();
        return;
      }
    }

    // All connected players have submitted — enter 5-second cooldown
    this.startRoundCooldown("all_submitted");
  }

  private clearDisconnectTimer(playerId: string) {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  private broadcastPhaseChanged(phase: Phase) {
    const event: ServerEvent = {
      type: "phase_changed",
      phase
    };
    this.room.broadcast(serialize(event));
  }

  private sendEvent(connection: Party.Connection, event: ServerEvent) {
    connection.send(serialize(event));
  }

  private sendError(connection: Party.Connection, message: string) {
    const event: ServerEvent = {
      type: "error",
      message
    };
    connection.send(serialize(event));
  }

  private futureMs(ms: number): number {
    return Date.now() + ms;
  }
}
