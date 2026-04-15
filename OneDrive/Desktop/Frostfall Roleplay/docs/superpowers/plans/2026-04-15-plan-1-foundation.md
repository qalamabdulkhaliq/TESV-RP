# Frostfall Roleplay — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the TypeScript game mode project inside the installed SkyMP server directory, establish shared types, wire up the event-routing entry point, and confirm the test harness works end-to-end.

**Architecture:** One TypeScript file per system, wired together through a central `index.ts` that registers all event listeners. Systems communicate only by dispatching typed events — never by calling each other directly. Shared types live in `src/types/index.ts` and are imported everywhere.

**Tech Stack:** TypeScript, Node.js, Jest (unit tests), SkyMP ScampServer API (game mode runtime)

---

## Before You Start

After running the SkyMP installer, locate the server directory. It will contain a `server-settings.json`. Open it and find the `gamemodePath` field — that is where the compiled game mode script goes. Note the path. All source code in this plan lives in a `gamemode/` folder next to the server binary.

```
<SkyMP server root>/
  server-settings.json
  gamemode/           ← we create this
    src/
    tests/
    dist/             ← compiled output, referenced by server-settings.json
```

---

## File Map

| File | Purpose |
|------|---------|
| `gamemode/package.json` | Node project config, scripts |
| `gamemode/tsconfig.json` | TypeScript compiler config |
| `gamemode/jest.config.ts` | Jest config |
| `gamemode/src/types/index.ts` | All shared types used across systems |
| `gamemode/src/events.ts` | Typed internal event bus |
| `gamemode/src/index.ts` | Entry point — imports and wires all systems |
| `gamemode/tests/events.test.ts` | Tests for the event bus |
| `gamemode/tests/types.test.ts` | Smoke test confirming type shapes |

---

## Task 1: Create the gamemode directory and initialize the Node project

**Files:**
- Create: `gamemode/package.json`

- [ ] **Step 1: Create the directory**

```bash
cd "<your SkyMP server root>"
mkdir -p gamemode/src/types
mkdir -p gamemode/tests
cd gamemode
```

- [ ] **Step 2: Initialize package.json**

```bash
npm init -y
```

- [ ] **Step 3: Replace the generated package.json with this exact content**

```json
{
  "name": "frostfall-gamemode",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.12.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected output: `added N packages` with no errors.

- [ ] **Step 5: Commit**

```bash
git add gamemode/package.json gamemode/package-lock.json
git commit -m "chore: initialize gamemode Node project"
```

---

## Task 2: Configure TypeScript and Jest

**Files:**
- Create: `gamemode/tsconfig.json`
- Create: `gamemode/jest.config.ts`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 2: Create jest.config.ts**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};

export default config;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add gamemode/tsconfig.json gamemode/jest.config.ts
git commit -m "chore: configure TypeScript and Jest"
```

---

## Task 3: Define shared types

**Files:**
- Create: `gamemode/src/types/index.ts`
- Create: `gamemode/tests/types.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```typescript
// gamemode/tests/types.test.ts
import type {
  PlayerId,
  HoldId,
  FactionId,
  PlayerState,
  Property,
  PropertyType,
  GameEvent,
} from '../src/types';

describe('shared types', () => {
  it('HoldId covers all nine holds', () => {
    const holds: HoldId[] = [
      'whiterun',
      'eastmarch',
      'rift',
      'reach',
      'haafingar',
      'pale',
      'falkreath',
      'hjaalmarch',
      'winterhold',
    ];
    expect(holds).toHaveLength(9);
  });

  it('PlayerState has all required fields', () => {
    const state: PlayerState = {
      id: 1,
      name: 'Thorald',
      holdId: 'whiterun',
      factions: [],
      bounty: {},
      isDown: false,
      isCaptive: false,
      downedAt: null,
      captiveAt: null,
      properties: [],
      hungerLevel: 5,
      drunkLevel: 0,
      septims: 0,
      stipendPaidHours: 0,
    };
    expect(state.holdId).toBe('whiterun');
  });

  it('Property has all required fields', () => {
    const prop: Property = {
      id: 'whiterun-breezehome',
      holdId: 'whiterun',
      ownerId: null,
      type: 'home',
      pendingRequestBy: null,
      pendingRequestAt: null,
    };
    expect(prop.type).toBe('home');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/types.test.ts
```

Expected: FAIL — `Cannot find module '../src/types'`

- [ ] **Step 3: Create src/types/index.ts**

```typescript
// gamemode/src/types/index.ts

export type PlayerId = number;

export type HoldId =
  | 'whiterun'
  | 'eastmarch'
  | 'rift'
  | 'reach'
  | 'haafingar'
  | 'pale'
  | 'falkreath'
  | 'hjaalmarch'
  | 'winterhold';

export type FactionId =
  | 'imperialGarrison'
  | 'fourthLegionAuxiliary'
  | 'thalmor'
  | 'companions'
  | 'collegeOfWinterhold'
  | 'thievesGuild'
  | 'bardsCollege'
  | 'vigilants'
  | 'forsworn'
  | 'stormcloakUnderground'
  | 'eastEmpireCompany'
  | 'confederationOfTemples';

export type PropertyType = 'home' | 'business';

export interface PlayerState {
  id: PlayerId;
  name: string;
  holdId: HoldId | null;
  factions: FactionId[];
  /** Bounty amount per hold. Missing key = 0. */
  bounty: Partial<Record<HoldId, number>>;
  isDown: boolean;
  isCaptive: boolean;
  /** Unix ms timestamp when player was downed this in-game day, or null */
  downedAt: number | null;
  /** Unix ms timestamp when captivity began, or null */
  captiveAt: number | null;
  properties: PropertyId[];
  /** 0 = starving, 10 = full. Drops 1 per 30 IRL minutes. */
  hungerLevel: number;
  /** 0 = sober, 10 = blackout. */
  drunkLevel: number;
  septims: number;
  /** How many stipend payments (1/hr) the player has received, max 24 */
  stipendPaidHours: number;
}

export type PropertyId = string;

export interface Property {
  id: PropertyId;
  holdId: HoldId;
  ownerId: PlayerId | null;
  type: PropertyType;
  pendingRequestBy: PlayerId | null;
  /** Unix ms timestamp of purchase request, or null */
  pendingRequestAt: number | null;
}

// ---------------------------------------------------------------------------
// Internal event bus types
// ---------------------------------------------------------------------------

export type GameEventType =
  | 'playerJoined'
  | 'playerLeft'
  | 'playerDowned'
  | 'playerCaptured'
  | 'playerReleased'
  | 'playerArrested'
  | 'bountyChanged'
  | 'propertyRequested'
  | 'propertyApproved'
  | 'hungerTick'
  | 'drunkChanged'
  | 'stipendTick';

export interface GameEvent<T = unknown> {
  type: GameEventType;
  payload: T;
  timestamp: number;
}

export interface PlayerJoinedPayload {
  playerId: PlayerId;
  name: string;
}

export interface PlayerDownedPayload {
  victimId: PlayerId;
  attackerId: PlayerId;
  holdId: HoldId;
}

export interface BountyChangedPayload {
  playerId: PlayerId;
  holdId: HoldId;
  amount: number;
  previousAmount: number;
}

export interface PropertyRequestedPayload {
  playerId: PlayerId;
  propertyId: PropertyId;
}

export interface PropertyApprovedPayload {
  propertyId: PropertyId;
  newOwnerId: PlayerId;
  approvedBy: PlayerId;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/types.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add gamemode/src/types/index.ts gamemode/tests/types.test.ts
git commit -m "feat: define shared types for all game systems"
```

---

## Task 4: Build the internal event bus

**Files:**
- Create: `gamemode/src/events.ts`
- Create: `gamemode/tests/events.test.ts`

The event bus is how systems communicate. A system dispatches an event; any other system that cares about it has registered a listener. No system calls another directly.

- [ ] **Step 1: Write the failing tests**

```typescript
// gamemode/tests/events.test.ts
import { EventBus } from '../src/events';

describe('EventBus', () => {
  it('calls a registered listener when event is dispatched', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerJoined', handler);
    bus.dispatch({ type: 'playerJoined', payload: { playerId: 1, name: 'Thorald' }, timestamp: Date.now() });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes the full event to the listener', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerDowned', handler);
    const event = { type: 'playerDowned' as const, payload: { victimId: 2, attackerId: 1, holdId: 'whiterun' as const }, timestamp: 1000 };
    bus.dispatch(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not call listeners for other event types', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerJoined', handler);
    bus.dispatch({ type: 'bountyChanged', payload: { playerId: 1, holdId: 'whiterun', amount: 500, previousAmount: 0 }, timestamp: 1000 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls multiple listeners for the same event type', () => {
    const bus = new EventBus();
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    bus.on('playerJoined', handler1);
    bus.on('playerJoined', handler2);
    bus.dispatch({ type: 'playerJoined', payload: { playerId: 1, name: 'Thorald' }, timestamp: 1000 });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('removes a listener with off()', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerJoined', handler);
    bus.off('playerJoined', handler);
    bus.dispatch({ type: 'playerJoined', payload: { playerId: 1, name: 'Thorald' }, timestamp: 1000 });
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/events.test.ts
```

Expected: FAIL — `Cannot find module '../src/events'`

- [ ] **Step 3: Implement EventBus**

```typescript
// gamemode/src/events.ts
import type { GameEvent, GameEventType } from './types';

type EventHandler = (event: GameEvent<unknown>) => void;

export class EventBus {
  private listeners: Map<GameEventType, Set<EventHandler>> = new Map();

  on(type: GameEventType, handler: EventHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  off(type: GameEventType, handler: EventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(event: GameEvent<unknown>): void {
    const handlers = this.listeners.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(event);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/events.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add gamemode/src/events.ts gamemode/tests/events.test.ts
git commit -m "feat: implement internal event bus"
```

---

## Task 5: Create the SkyMP adapter layer

**Files:**
- Create: `gamemode/src/skymp.ts`

This file is the **only** place that touches the SkyMP runtime API. Everything else imports from here. This keeps the rest of the codebase testable without needing a running SkyMP server.

> **Note:** After running the SkyMP installer, check the installed server directory for TypeScript type definitions (likely in a `types/` folder or an npm package). If `@skymp/types` or equivalent is available, install it: `npm install @skymp/types`. Until then, the adapter defines its own minimal interface.

- [ ] **Step 1: Create the adapter**

```typescript
// gamemode/src/skymp.ts

/**
 * Minimal interface for the SkyMP ScampServer API.
 * Replace with the actual @skymp types package once verified from your install.
 * This is the ONLY file that imports from the SkyMP runtime.
 */
export interface SkympServer {
  /** Get all currently connected actor/player IDs */
  getActorIds(): number[];
  /** Get the display name of an actor */
  getActorName(actorId: number): string;
  /** Get item count for a given form ID in an actor's inventory */
  getItemCount(actorId: number, formId: number): number;
  /** Add items to an actor's inventory */
  addItem(actorId: number, formId: number, count: number): void;
  /** Remove items from an actor's inventory */
  removeItem(actorId: number, formId: number, count: number): void;
  /** Register a handler for a named SkyMP event */
  on(event: string, handler: (...args: unknown[]) => void): void;
  /** Send a notification message to a specific actor */
  sendMessage(actorId: number, message: string): void;
  /** Open a UI dialog for an actor */
  openDialog(actorId: number, options: DialogOptions): void;
}

export interface DialogOptions {
  title: string;
  body: string;
  buttons: string[];
}

/** Form ID for gold (Septims) in Skyrim */
export const GOLD_FORM_ID = 0x0000000f;

/**
 * The global SkyMP server instance, injected at startup.
 * Call initSkymp() once from index.ts before using getServer().
 */
let _server: SkympServer | null = null;

export function initSkymp(server: SkympServer): void {
  _server = server;
}

export function getServer(): SkympServer {
  if (!_server) throw new Error('SkyMP server not initialized. Call initSkymp() first.');
  return _server;
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add gamemode/src/skymp.ts
git commit -m "feat: add SkyMP adapter layer (testable boundary)"
```

---

## Task 6: Build the player state store

**Files:**
- Create: `gamemode/src/store.ts`
- Create: `gamemode/tests/store.test.ts`

All game systems read and write player state through the store. No system holds its own player state map.

- [ ] **Step 1: Write the failing tests**

```typescript
// gamemode/tests/store.test.ts
import { PlayerStore } from '../src/store';

describe('PlayerStore', () => {
  let store: PlayerStore;

  beforeEach(() => {
    store = new PlayerStore();
  });

  it('creates a fresh player state on registerPlayer', () => {
    store.registerPlayer(1, 'Thorald');
    const state = store.get(1);
    expect(state).not.toBeNull();
    expect(state!.name).toBe('Thorald');
    expect(state!.hungerLevel).toBe(10);
    expect(state!.drunkLevel).toBe(0);
    expect(state!.septims).toBe(0);
    expect(state!.isDown).toBe(false);
    expect(state!.factions).toEqual([]);
  });

  it('returns null for unknown player', () => {
    expect(store.get(99)).toBeNull();
  });

  it('updates player state', () => {
    store.registerPlayer(1, 'Thorald');
    store.update(1, { hungerLevel: 7 });
    expect(store.get(1)!.hungerLevel).toBe(7);
  });

  it('removes player on deregister', () => {
    store.registerPlayer(1, 'Thorald');
    store.deregisterPlayer(1);
    expect(store.get(1)).toBeNull();
  });

  it('returns all registered players', () => {
    store.registerPlayer(1, 'Thorald');
    store.registerPlayer(2, 'Ulfric');
    expect(store.getAll()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/store.test.ts
```

Expected: FAIL — `Cannot find module '../src/store'`

- [ ] **Step 3: Implement PlayerStore**

```typescript
// gamemode/src/store.ts
import type { PlayerId, PlayerState, HoldId } from './types';

const DEFAULT_HUNGER = 10;
const DEFAULT_DRUNK = 0;

function createDefaultState(id: PlayerId, name: string): PlayerState {
  return {
    id,
    name,
    holdId: null,
    factions: [],
    bounty: {},
    isDown: false,
    isCaptive: false,
    downedAt: null,
    captiveAt: null,
    properties: [],
    hungerLevel: DEFAULT_HUNGER,
    drunkLevel: DEFAULT_DRUNK,
    septims: 0,
    stipendPaidHours: 0,
  };
}

export class PlayerStore {
  private players: Map<PlayerId, PlayerState> = new Map();

  registerPlayer(id: PlayerId, name: string): PlayerState {
    const state = createDefaultState(id, name);
    this.players.set(id, state);
    return state;
  }

  deregisterPlayer(id: PlayerId): void {
    this.players.delete(id);
  }

  get(id: PlayerId): PlayerState | null {
    return this.players.get(id) ?? null;
  }

  getAll(): PlayerState[] {
    return Array.from(this.players.values());
  }

  update(id: PlayerId, patch: Partial<PlayerState>): void {
    const current = this.players.get(id);
    if (!current) throw new Error(`Player ${id} not found in store`);
    this.players.set(id, { ...current, ...patch });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/store.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add gamemode/src/store.ts gamemode/tests/store.test.ts
git commit -m "feat: implement player state store"
```

---

## Task 7: Wire up index.ts entry point

**Files:**
- Create: `gamemode/src/index.ts`

This is the file the SkyMP server loads. It initializes the store and event bus, registers SkyMP event handlers, and will import all future systems.

- [ ] **Step 1: Create index.ts**

```typescript
// gamemode/src/index.ts
import { initSkymp, getServer, type SkympServer } from './skymp';
import { EventBus } from './events';
import { PlayerStore } from './store';

// These will be imported as systems are built in subsequent plans:
// import { initHunger } from './hunger';
// import { initDrunkBar } from './drunkBar';
// import { initEconomy } from './economy';
// ... etc.

let bus: EventBus;
let store: PlayerStore;

/**
 * Called by SkyMP when the server starts.
 * Replace 'mp' with whatever the actual SkyMP global is called in your install.
 */
export function main(server: SkympServer): void {
  initSkymp(server);

  bus = new EventBus();
  store = new PlayerStore();

  // Register SkyMP event hooks
  server.on('connect', (actorId: unknown) => {
    const id = actorId as number;
    const name = server.getActorName(id);
    const state = store.registerPlayer(id, name);
    bus.dispatch({
      type: 'playerJoined',
      payload: { playerId: id, name },
      timestamp: Date.now(),
    });
    console.log(`[Frostfall] Player joined: ${name} (${id})`);
  });

  server.on('disconnect', (actorId: unknown) => {
    const id = actorId as number;
    store.deregisterPlayer(id);
    bus.dispatch({
      type: 'playerLeft',
      payload: { playerId: id },
      timestamp: Date.now(),
    });
    console.log(`[Frostfall] Player left: ${id}`);
  });

  console.log('[Frostfall] Game mode initialized.');
}
```

> **Note:** The SkyMP runtime may use a global `mp` object rather than passing a server parameter to `main()`. Check the example game modes in your SkyMP install directory and adjust accordingly. The adapter in `skymp.ts` is your single point of change.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 3: Build the dist output**

```bash
npm run build
```

Expected: `dist/index.js` and accompanying files are created.

- [ ] **Step 4: Update server-settings.json to point at the compiled output**

In your SkyMP server's `server-settings.json`, set the game mode path:

```json
{
  "gamemodePath": "./gamemode/dist/index.js"
}
```

(Exact key name may vary — check the SkyMP docs or example config in your install.)

- [ ] **Step 5: Run all tests to confirm nothing broke**

```bash
npm test
```

Expected: PASS — all tests passing.

- [ ] **Step 6: Commit**

```bash
git add gamemode/src/index.ts
git commit -m "feat: wire up entry point, ready for system integration"
```

---

## Task 8: Run the full test suite and verify the build

- [ ] **Step 1: Run all tests**

```bash
cd gamemode && npm test
```

Expected output:
```
PASS tests/types.test.ts
PASS tests/events.test.ts
PASS tests/store.test.ts

Test Suites: 3 passed, 3 total
Tests:       13 passed, 13 total
```

- [ ] **Step 2: Run the full build**

```bash
npm run build
```

Expected: `dist/` populated with no TypeScript errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: plan 1 complete — foundation ready for system integration"
```

---

## What Plan 2 Builds On Top Of This

Plan 2 (Character Systems) will:
- Import `PlayerStore` and `EventBus` from this foundation
- Add `hunger.ts` — uses `store.update()` and dispatches `hungerTick` events
- Add `drunkBar.ts` — uses `store.update()` and reacts to item consumption events
- Each system exports an `init(store, bus, server)` function that `index.ts` calls

The pattern is established here. Every subsequent plan follows it.

---

*Plan 1 of 6. Subsequent plans: Character Systems, Economy & Resources, Property & Housing, Combat & Justice, Factions & College.*
