# 🎮 Imposter Clue Game – PartyKit Architecture Blueprint

---

# 1. Project Vision

A globally scalable real-time multiplayer social deduction game built using PartyKit edge rooms.

Core Requirements:
- 4–10 players per room
- 1 imposter per match
- 2–3 clue rounds
- Voting phase
- Imposter final guess
- Live synchronized gameplay
- Mobile-first PWA
- Edge-deployed globally

Primary Goal:
Leverage PartyKit’s edge room architecture to avoid managing WebSocket clusters or Redis infrastructure.

---

# 2. Architecture Overview

Client (React PWA)
        ↓
PartyKit WebSocket Connection
        ↓
PartyKit Edge Room Instance
        ↓
(Optional) External Database (Postgres) for persistence

Design Philosophy:
- Server authoritative
- Room-isolated state
- Edge execution for low latency
- Stateless frontend
- Type-safe message contracts

---

# 3. Tech Stack

## Frontend
- React (Vite)
- TypeScript
- Tailwind CSS
- Zustand (local UI state)
- PartyKit client SDK
- PWA enabled

## Backend (Edge)
- PartyKit
- TypeScript
- Room-based architecture
- In-memory room state (isolated per room)


---

# 4. Project Structure

root/
│
├── frontend/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── partySocket.ts
│   └── main.tsx
│
├── partykit/
│   ├── game.room.ts
│   ├── types.ts
│   ├── word.service.ts
│   └── utils.ts
│
├── shared/
│   └── event.contracts.ts
│
└── partykit.json

Game logic must be fully isolated inside game.room.ts

---

# 5. Room Lifecycle (PartyKit)

Each room = one game instance.

Room ID = match ID

Room Phases:

LOBBY
  → STARTED
    → ROUND_CLUE_1
    → ROUND_CLUE_2
    → ROUND_CLUE_3 (optional)
      → VOTING
        → IMPOSTER_GUESS
          → FINISHED

Room destroyed automatically after inactivity timeout.

---

# 6. Game State Model

Stored in-memory inside PartyKit room instance.

interface GameState {
  phase: "lobby" | "clue" | "voting" | "guess" | "finished";
  round: number;
  maxRounds: number;

  players: Record<string, Player>;

  secretWord: string;
  imposterWord?: string | null;

  votes: Record<string, string>;
  clues: Record<number, Record<string, string>>;

  timerEndsAt?: number;
}

interface Player {
  id: string;
  name: string;
  isImposter: boolean;
  score: number;
  connected: boolean;
}

Server is always source of truth.

---

# 7. Event Contracts

## Client → Server

type ClientEvent =
  | { type: "join"; name: string }
  | { type: "start_game" }
  | { type: "submit_clue"; clue: string }
  | { type: "submit_vote"; targetId: string }
  | { type: "imposter_guess"; word: string }
  | { type: "leave" }

## Server → Client

type ServerEvent =
  | { type: "state_update"; state: GameState }
  | { type: "player_joined"; player: Player }
  | { type: "player_left"; playerId: string }
  | { type: "phase_changed"; phase: string }
  | { type: "game_finished"; result: "team" | "imposter" }
  | { type: "error"; message: string }

All messages must be validated before processing.

---

# 8. PartyKit Room Responsibilities

game.room.ts must:

1. Handle onConnect
   - Create player
   - Add to state
   - Broadcast state

2. Handle onMessage
   - Validate event
   - Mutate state safely
   - Broadcast update

3. Handle onDisconnect
   - Mark player disconnected
   - Optionally remove after timeout

4. Manage phase transitions
   - Automatically move phases when conditions met
   - Enforce timers

5. Assign imposter & words

6. Calculate voting result

7. Determine final winner

All logic must be deterministic.

---

# 9. Word Selection Strategy

Option A (MVP):
- Static word list in word.service.ts

Option B (Scalable):
- Word database in PostgreSQL
- Cached on first load
- Hard mode similar word mapping

Word selection must:
- Avoid repetition inside same room
- Randomize fairly

---

# 10. Timers & Phase Control

Server controls timers.

Example:
- 45 seconds per clue round
- 30 seconds voting
- 20 seconds imposter guess

Timer logic:
- Set timerEndsAt
- Use setTimeout inside room
- Auto-transition on expiry

Client displays countdown based on server timestamp.

---

# 11. Reconnection Strategy

On reconnect:
- Client sends stored playerId
- Server rebinds socket to existing player
- State resent immediately

Player slot preserved for X minutes.

If not reconnected:
- Remove player
- If below 2 players → end game

---

# 12. Anti-Cheat & Validation

- Only 1 clue per round per player
- Only 1 vote per player
- Cannot vote self
- Validate phase before accepting action
- Enforce clue length limits
- Ignore late submissions after timer

All validation server-side.

---

# 13. Deployment Strategy

Development:
- party dev
- Local React client

Staging:
- Preview deploy

Production:
- Deploy to PartyKit edge

Region Strategy:
- PartyKit handles edge routing
- No manual regional clustering needed initially

---

# 14. Performance Targets

Room Size: max 10 players
State Size: < 15KB
Latency: < 150ms globally
Room Isolation: independent scaling

PartyKit ensures horizontal scaling by design.

---

# 15. MVP Scope Lock

Included:
- Public rooms
- Core gameplay
- Scoring
- Mobile responsive UI
- Reconnect support

Excluded:
- Global leaderboard
- User accounts
- Friends system
- Voice chat
- Monetization

---

# 16. Development Phases

Phase 1:
- Implement game engine logic (no sockets)

Phase 2:
- Integrate PartyKit room
- Basic multiplayer working

Phase 3:
- Add timers + voting logic
- Implement reconnect flow

Phase 4:
- UI polish
- Mobile responsiveness
- Load testing

Phase 5:
- Production deployment
- Monitoring

---

END OF DOCUMENT