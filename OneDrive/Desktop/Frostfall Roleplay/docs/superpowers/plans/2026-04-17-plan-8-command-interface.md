# Plan 8: Command Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a `/command` chat interface so players can invoke all built game systems — lecture, training, skills, economy, housing, bounty, captivity — without touching the existing system files.

**Architecture:** Three layers: `permissions.ts` stores player roles (player/leader/staff) via `mp.set`; `commands.ts` holds a registry of command name → handler, parses chat messages, checks permissions; `playerCommands.ts` registers all player-accessible handlers at init time. Leader and staff commands come in Plan 9. The `customPacket` handler in `index.ts` is wired to `dispatchCommand` to route chat messages.

**Tech Stack:** TypeScript, Jest/ts-jest, existing `PlayerStore` / `EventBus` / `sendPacket` / `mp.set` patterns.

---

## File Map

| File | Action |
|------|--------|
| `gamemode/src/permissions.ts` | Create — role storage and permission checking |
| `gamemode/src/commands.ts` | Create — registry, parser, resolver, dispatcher, feedback |
| `gamemode/src/playerCommands.ts` | Create — all player-permission command handlers |
| `gamemode/src/index.ts` | Modify — wire `customPacket` chat messages to `dispatchCommand`; call `initPlayerCommands` |
| `gamemode/tests/permissions.test.ts` | Create |
| `gamemode/tests/commands.test.ts` | Create |
| `gamemode/tests/playerCommands.test.ts` | Create |
| `CHANGELOG.md` | Modify |

**Do not modify** any existing system file (`college.ts`, `training.ts`, `skills.ts`, etc.). The command layer only imports and calls their exported functions.

---

## Task 1 — permissions.ts

**Files:**
- Create: `gamemode/src/permissions.ts`
- Create: `gamemode/tests/permissions.test.ts`

### Implementation

```typescript
// gamemode/src/permissions.ts
import type { Mp } from './skymp';
import type { PlayerId } from './types';

export type PlayerRole = 'player' | 'leader' | 'staff';

const ROLE_LEVELS: Record<PlayerRole, number> = { player: 0, leader: 1, staff: 2 };
const ROLE_KEY = 'ff_role';

export function getPlayerRole(mp: Mp, playerId: PlayerId): PlayerRole {
  return (mp.get(playerId, ROLE_KEY) as PlayerRole) ?? 'player';
}

export function setPlayerRole(mp: Mp, playerId: PlayerId, role: PlayerRole): void {
  mp.set(playerId, ROLE_KEY, role);
}

export function hasPermission(mp: Mp, playerId: PlayerId, required: PlayerRole): boolean {
  return ROLE_LEVELS[getPlayerRole(mp, playerId)] >= ROLE_LEVELS[required];
}
```

- [ ] **Step 1: Write `gamemode/tests/permissions.test.ts`**

```typescript
import { getPlayerRole, setPlayerRole, hasPermission } from '../src/permissions';

function makeMp(): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((id: number, key: string) => storage[`${id}:${key}`]),
    set: jest.fn((id: number, key: string, val: unknown) => { storage[`${id}:${key}`] = val; }),
  };
}

describe('getPlayerRole', () => {
  it('returns player by default when no role set', () => {
    const mp = makeMp();
    expect(getPlayerRole(mp, 1)).toBe('player');
  });
  it('returns stored role', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'staff');
    expect(getPlayerRole(mp, 1)).toBe('staff');
  });
});

describe('setPlayerRole', () => {
  it('persists role via mp.set', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'leader');
    expect(mp.set).toHaveBeenCalledWith(1, 'ff_role', 'leader');
  });
});

describe('hasPermission', () => {
  it('player passes player-level check', () => {
    const mp = makeMp();
    expect(hasPermission(mp, 1, 'player')).toBe(true);
  });
  it('player fails leader-level check', () => {
    const mp = makeMp();
    expect(hasPermission(mp, 1, 'leader')).toBe(false);
  });
  it('leader passes leader-level check', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'leader');
    expect(hasPermission(mp, 1, 'leader')).toBe(true);
  });
  it('leader fails staff-level check', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'leader');
    expect(hasPermission(mp, 1, 'staff')).toBe(false);
  });
  it('staff passes all levels', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'staff');
    expect(hasPermission(mp, 1, 'player')).toBe(true);
    expect(hasPermission(mp, 1, 'leader')).toBe(true);
    expect(hasPermission(mp, 1, 'staff')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd gamemode && npm test -- --testPathPattern="permissions"
```

Expected: FAIL — import errors.

- [ ] **Step 3: Write `gamemode/src/permissions.ts`** with the implementation above.

- [ ] **Step 4: Run to confirm all pass**

```
cd gamemode && npm test -- --testPathPattern="permissions"
```

Expected: 9 tests passing.

- [ ] **Step 5: Commit**

```
git add gamemode/src/permissions.ts gamemode/tests/permissions.test.ts
git commit -m "feat: player role and permission system"
```

---

## Task 2 — commands.ts

**Files:**
- Create: `gamemode/src/commands.ts`
- Create: `gamemode/tests/commands.test.ts`

### Implementation

```typescript
// gamemode/src/commands.ts
import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';
import type { PlayerRole } from './permissions';
import { hasPermission } from './permissions';
import { sendPacket } from './skymp';

export interface CommandContext {
  mp: Mp;
  store: PlayerStore;
  bus: EventBus;
  playerId: PlayerId;
  args: string[];
}

export type CommandHandler = (ctx: CommandContext) => void;

interface CommandEntry {
  permission: PlayerRole;
  handler: CommandHandler;
}

const registry = new Map<string, CommandEntry>();

export function registerCommand(
  name: string,
  permission: PlayerRole,
  handler: CommandHandler,
): void {
  registry.set(name.toLowerCase(), { permission, handler });
}

export function _clearRegistry(): void {
  registry.clear();
}

export function parseMessage(message: string): { command: string; args: string[] } | null {
  if (!message.startsWith('/')) return null;
  const parts = message.slice(1).trim().split(/\s+/);
  if (!parts[0]) return null;
  return { command: parts[0].toLowerCase(), args: parts.slice(1) };
}

export function resolvePlayer(store: PlayerStore, name: string): PlayerId | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  const match = store.getAll().find(p => p.name.toLowerCase() === lower);
  return match ? match.id : null;
}

export function sendFeedback(mp: Mp, playerId: PlayerId, message: string, success = true): void {
  sendPacket(mp, playerId, { type: 'commandFeedback', message, success });
}

export function dispatchCommand(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  message: string,
): void {
  const parsed = parseMessage(message);
  if (!parsed) return;

  const entry = registry.get(parsed.command);
  if (!entry) {
    sendFeedback(mp, playerId, `Unknown command: /${parsed.command}`, false);
    return;
  }

  if (!hasPermission(mp, playerId, entry.permission)) {
    sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
    return;
  }

  entry.handler({ mp, store, bus, playerId, args: parsed.args });
}
```

- [ ] **Step 1: Write `gamemode/tests/commands.test.ts`**

```typescript
import {
  parseMessage,
  resolvePlayer,
  sendFeedback,
  dispatchCommand,
  registerCommand,
  _clearRegistry,
} from '../src/commands';
import { setPlayerRole } from '../src/permissions';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

function makeMp(): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((id: number, key: string) => storage[`${id}:${key}`]),
    set: jest.fn((id: number, key: string, val: unknown) => { storage[`${id}:${key}`] = val; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

function setup() {
  const mp = makeMp();
  const store = new PlayerStore();
  const bus = new EventBus();
  store.registerPlayer(1, 0xff000001, 'Lydia');
  store.registerPlayer(2, 0xff000002, 'Farengar');
  return { mp, store, bus };
}

beforeEach(() => _clearRegistry());

// ---------------------------------------------------------------------------
// parseMessage
// ---------------------------------------------------------------------------

describe('parseMessage', () => {
  it('returns null for non-command messages', () => {
    expect(parseMessage('hello there')).toBeNull();
    expect(parseMessage('')).toBeNull();
  });
  it('parses command with no args', () => {
    expect(parseMessage('/bounty')).toEqual({ command: 'bounty', args: [] });
  });
  it('parses command with args', () => {
    expect(parseMessage('/pay 100 Farengar')).toEqual({ command: 'pay', args: ['100', 'Farengar'] });
  });
  it('lowercases the command', () => {
    expect(parseMessage('/BOUNTY')).toEqual({ command: 'bounty', args: [] });
  });
  it('handles extra whitespace', () => {
    expect(parseMessage('/pay  100  Farengar')).toEqual({ command: 'pay', args: ['100', 'Farengar'] });
  });
});

// ---------------------------------------------------------------------------
// resolvePlayer
// ---------------------------------------------------------------------------

describe('resolvePlayer', () => {
  it('returns null for unknown name', () => {
    const { store } = setup();
    expect(resolvePlayer(store, 'Nobody')).toBeNull();
  });
  it('returns playerId for matching name', () => {
    const { store } = setup();
    expect(resolvePlayer(store, 'Lydia')).toBe(1);
  });
  it('is case-insensitive', () => {
    const { store } = setup();
    expect(resolvePlayer(store, 'lydia')).toBe(1);
  });
  it('returns null for empty string', () => {
    const { store } = setup();
    expect(resolvePlayer(store, '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — routing
// ---------------------------------------------------------------------------

describe('dispatchCommand', () => {
  it('does nothing for non-command message', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('test', 'player', handler);
    dispatchCommand(mp, store, bus, 1, 'just talking');
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler for registered command', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('greet', 'player', handler);
    dispatchCommand(mp, store, bus, 1, '/greet');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ playerId: 1, args: [] }));
  });

  it('sends feedback for unknown command', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/unknown');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(
      0xff000001,
      expect.stringContaining('Unknown command'),
    );
  });

  it('sends permission-denied feedback when role insufficient', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('staffcmd', 'staff', handler);
    dispatchCommand(mp, store, bus, 1, '/staffcmd');
    expect(handler).not.toHaveBeenCalled();
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(
      0xff000001,
      expect.stringContaining('permission'),
    );
  });

  it('passes through for sufficient role', () => {
    const { mp, store, bus } = setup();
    setPlayerRole(mp, 1, 'staff');
    const handler = jest.fn();
    registerCommand('staffcmd', 'staff', handler);
    dispatchCommand(mp, store, bus, 1, '/staffcmd');
    expect(handler).toHaveBeenCalled();
  });

  it('passes args to handler', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('echo', 'player', handler);
    dispatchCommand(mp, store, bus, 1, '/echo hello world');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['hello', 'world'] }));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd gamemode && npm test -- --testPathPattern="commands"
```

Expected: FAIL — import errors.

- [ ] **Step 3: Write `gamemode/src/commands.ts`** with the implementation above.

- [ ] **Step 4: Run to confirm all pass**

```
cd gamemode && npm test -- --testPathPattern="commands"
```

Expected: 16 tests passing.

- [ ] **Step 5: Run full suite — expect no regressions**

```
cd gamemode && npm test
```

- [ ] **Step 6: Commit**

```
git add gamemode/src/commands.ts gamemode/tests/commands.test.ts
git commit -m "feat: command registry, parser, dispatcher"
```

---

## Task 3 — playerCommands.ts

**Files:**
- Create: `gamemode/src/playerCommands.ts`
- Create: `gamemode/tests/playerCommands.test.ts`

### Implementation

```typescript
// gamemode/src/playerCommands.ts
import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { SkillId } from './types';
import { SKILL_IDS } from './types';
import { registerCommand, sendFeedback, resolvePlayer } from './commands';
import { startLecture, joinLecture, endLecture } from './college';
import { startTraining, joinTraining, endTraining } from './training';
import { getSkillXp, getSkillCap, getSkillLevel } from './skills';
import { transferGold } from './economy';
import { getAllBounties } from './bounty';
import { capturePlayer, releasePlayer } from './captivity';
import { requestProperty, getPropertiesByHold } from './housing';

export function initPlayerCommands(mp: Mp, store: PlayerStore, bus: EventBus): void {

  // /lecture start | /lecture join [name] | /lecture end
  registerCommand('lecture', 'player', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];
    if (sub === 'start') {
      const ok = startLecture(mp, store, bus, playerId);
      sendFeedback(mp, playerId, ok ? 'Lecture started.' : 'You already have an active lecture.', ok);
    } else if (sub === 'join') {
      const lecturerId = resolvePlayer(store, args[1] ?? '');
      if (!lecturerId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const ok = joinLecture(mp, store, bus, playerId, lecturerId);
      sendFeedback(mp, playerId, ok ? 'You joined the lecture.' : 'Could not join lecture.', ok);
    } else if (sub === 'end') {
      const ok = endLecture(mp, store, bus, playerId);
      sendFeedback(mp, playerId, ok ? 'Lecture ended.' : 'No active lecture.', ok);
    } else {
      sendFeedback(mp, playerId, 'Usage: /lecture start | /lecture join [name] | /lecture end', false);
    }
  });

  // /train start [skillId] | /train join [name] | /train end
  registerCommand('train', 'player', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];
    if (sub === 'start') {
      const skillId = args[1] as SkillId;
      if (!(SKILL_IDS as readonly string[]).includes(skillId)) {
        sendFeedback(mp, playerId, `Unknown skill. Valid: ${SKILL_IDS.join(', ')}`, false);
        return;
      }
      const ok = startTraining(mp, store, bus, playerId, skillId);
      sendFeedback(mp, playerId, ok ? `Training session started for ${skillId}.` : 'You already have an active session.', ok);
    } else if (sub === 'join') {
      const trainerId = resolvePlayer(store, args[1] ?? '');
      if (!trainerId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const ok = joinTraining(mp, store, bus, playerId, trainerId);
      sendFeedback(mp, playerId, ok ? 'You joined the training session.' : 'Could not join. Check you are close enough.', ok);
    } else if (sub === 'end') {
      const ok = endTraining(mp, store, bus, playerId);
      sendFeedback(mp, playerId, ok ? 'Training session ended.' : 'No active session.', ok);
    } else {
      sendFeedback(mp, playerId, 'Usage: /train start [skill] | /train join [name] | /train end', false);
    }
  });

  // /skill | /skill [skillId]
  registerCommand('skill', 'player', ({ mp, store, playerId, args }) => {
    const skillId = args[0] as SkillId | undefined;
    if (skillId && !(SKILL_IDS as readonly string[]).includes(skillId)) {
      sendFeedback(mp, playerId, `Unknown skill. Valid: ${SKILL_IDS.join(', ')}`, false);
      return;
    }
    const skills = (skillId ? [skillId] : [...SKILL_IDS]) as SkillId[];
    const lines = skills.map(s => {
      const xp  = getSkillXp(mp, playerId, s);
      const lvl = getSkillLevel(xp);
      const cap = getSkillCap(mp, store, playerId, s);
      return `${s}: level ${lvl} (${xp}/${cap} XP)`;
    });
    sendFeedback(mp, playerId, lines.join('\n'));
  });

  // /pay [amount] [playerName]
  registerCommand('pay', 'player', ({ mp, store, playerId, args }) => {
    const amount = parseInt(args[0] ?? '', 10);
    if (isNaN(amount) || amount <= 0) {
      sendFeedback(mp, playerId, 'Usage: /pay [amount] [player]', false);
      return;
    }
    const targetId = resolvePlayer(store, args[1] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    if (targetId === playerId) { sendFeedback(mp, playerId, 'You cannot pay yourself.', false); return; }
    const ok = transferGold(mp, store, playerId, targetId, amount);
    const targetName = store.get(targetId)?.name ?? 'Unknown';
    sendFeedback(mp, playerId, ok ? `Paid ${amount} Septims to ${targetName}.` : 'Insufficient funds.', ok);
  });

  // /bounty — self-check
  registerCommand('bounty', 'player', ({ mp, store, playerId }) => {
    const bounties = getAllBounties(mp, store, playerId);
    if (bounties.length === 0) {
      sendFeedback(mp, playerId, 'You have no active bounties.');
      return;
    }
    const lines = bounties.map(b => `${b.holdId}: ${b.amount} Septims`);
    sendFeedback(mp, playerId, 'Your bounties:\n' + lines.join('\n'));
  });

  // /capture [playerName]
  registerCommand('capture', 'player', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const target = store.get(targetId);
    if (!target?.isDown) {
      sendFeedback(mp, playerId, 'Target must be downed first.', false);
      return;
    }
    capturePlayer(mp, store, bus, targetId, playerId);
    sendFeedback(mp, playerId, `${target.name} is now your captive.`);
  });

  // /release [playerName]
  registerCommand('release', 'player', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const target = store.get(targetId);
    if (!target?.isCaptive) {
      sendFeedback(mp, playerId, 'That player is not captive.', false);
      return;
    }
    releasePlayer(mp, store, bus, targetId);
    sendFeedback(mp, playerId, `${target.name} has been released.`);
  });

  // /property list | /property request [id]
  registerCommand('property', 'player', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];
    if (sub === 'list') {
      const player = store.get(playerId);
      if (!player?.holdId) {
        sendFeedback(mp, playerId, 'Your hold is not assigned. Speak to a guard.', false);
        return;
      }
      const available = getPropertiesByHold(player.holdId).filter(p => !p.ownerId && !p.pendingRequestBy);
      if (available.length === 0) {
        sendFeedback(mp, playerId, 'No available properties in this hold.');
        return;
      }
      sendFeedback(mp, playerId, available.map(p => `${p.id} (${p.type})`).join('\n'));
    } else if (sub === 'request') {
      const propertyId = args[1];
      if (!propertyId) {
        sendFeedback(mp, playerId, 'Usage: /property request [id]', false);
        return;
      }
      // stewardId is 0 until hold leadership resolution is built in Plan 9
      const ok = requestProperty(mp, store, bus, playerId, propertyId, 0);
      sendFeedback(mp, playerId, ok ? 'Request submitted. The Steward has been notified.' : 'That property is unavailable.', ok);
    } else {
      sendFeedback(mp, playerId, 'Usage: /property list | /property request [id]', false);
    }
  });
}
```

- [ ] **Step 1: Write `gamemode/tests/playerCommands.test.ts`**

```typescript
import { initPlayerCommands } from '../src/playerCommands';
import { dispatchCommand, _clearRegistry } from '../src/commands';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';
import * as college from '../src/college';
import * as training from '../src/training';
import * as skills from '../src/skills';
import * as economy from '../src/economy';
import * as bounty from '../src/bounty';
import * as captivity from '../src/captivity';
import * as housing from '../src/housing';
import { _resetLectures } from '../src/college';
import { _resetTrainingSessions } from '../src/training';

function makeMp(positions: Record<number, { x: number; y: number; z: number }> = {}): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((actorId: number, key: string) => {
      if (key === 'pos') return positions[actorId] ?? null;
      return storage[`${actorId}:${key}`];
    }),
    set: jest.fn((actorId: number, key: string, value: unknown) => { storage[`${actorId}:${key}`] = value; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

function setup() {
  const mp = makeMp({ [0xff000001]: { x: 0, y: 0, z: 0 }, [0xff000002]: { x: 10, y: 0, z: 0 } });
  const store = new PlayerStore();
  const bus = new EventBus();
  store.registerPlayer(1, 0xff000001, 'Lydia');
  store.registerPlayer(2, 0xff000002, 'Farengar');
  initPlayerCommands(mp, store, bus);
  return { mp, store, bus };
}

beforeEach(() => {
  _clearRegistry();
  _resetLectures();
  _resetTrainingSessions();
});

// ---------------------------------------------------------------------------
// /lecture
// ---------------------------------------------------------------------------

describe('/lecture start', () => {
  it('calls startLecture and sends success feedback', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(college, 'startLecture');
    dispatchCommand(mp, store, bus, 1, '/lecture start');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('Lecture started'));
  });

  it('sends error if already has lecture', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/lecture start');
    mp.sendCustomPacket.mockClear();
    dispatchCommand(mp, store, bus, 1, '/lecture start');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('already'));
  });
});

describe('/lecture join', () => {
  it('calls joinLecture with resolved lecturerId', () => {
    const { mp, store, bus } = setup();
    college.startLecture(mp, store, bus, 1);
    const spy = jest.spyOn(college, 'joinLecture');
    dispatchCommand(mp, store, bus, 2, '/lecture join Lydia');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2, 1);
  });

  it('sends error for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/lecture join Nobody');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000002, expect.stringContaining('not found'));
  });
});

describe('/lecture end', () => {
  it('calls endLecture', () => {
    const { mp, store, bus } = setup();
    college.startLecture(mp, store, bus, 1);
    const spy = jest.spyOn(college, 'endLecture');
    dispatchCommand(mp, store, bus, 1, '/lecture end');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1);
  });

  it('sends error when no active lecture', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/lecture end');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('No active'));
  });
});

// ---------------------------------------------------------------------------
// /train
// ---------------------------------------------------------------------------

describe('/train start', () => {
  it('calls startTraining with skill', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(training, 'startTraining');
    dispatchCommand(mp, store, bus, 1, '/train start destruction');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1, 'destruction');
  });

  it('sends error for unknown skill', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/train start juggling');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('Unknown skill'));
  });
});

describe('/train join', () => {
  it('calls joinTraining with resolved trainerId', () => {
    const { mp, store, bus } = setup();
    training.startTraining(mp, store, bus, 1, 'smithing');
    const spy = jest.spyOn(training, 'joinTraining');
    dispatchCommand(mp, store, bus, 2, '/train join Lydia');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2, 1);
  });
});

describe('/train end', () => {
  it('calls endTraining', () => {
    const { mp, store, bus } = setup();
    training.startTraining(mp, store, bus, 1, 'alchemy');
    const spy = jest.spyOn(training, 'endTraining');
    dispatchCommand(mp, store, bus, 1, '/train end');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1);
  });
});

// ---------------------------------------------------------------------------
// /skill
// ---------------------------------------------------------------------------

describe('/skill', () => {
  it('sends skill summary for all skills', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/skill');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('destruction'));
  });

  it('sends single skill info when skill specified', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/skill smithing');
    const call = (mp.sendCustomPacket as jest.Mock).mock.calls[0];
    const msg = call[1] as string;
    expect(msg).toContain('smithing');
    expect(msg).not.toContain('destruction');
  });

  it('sends error for unknown skill', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/skill juggling');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('Unknown skill'));
  });
});

// ---------------------------------------------------------------------------
// /pay
// ---------------------------------------------------------------------------

describe('/pay', () => {
  it('calls transferGold and sends feedback', () => {
    const { mp, store, bus } = setup();
    store.update(1, { septims: 500 });
    const spy = jest.spyOn(economy, 'transferGold');
    dispatchCommand(mp, store, bus, 1, '/pay 100 Farengar');
    expect(spy).toHaveBeenCalledWith(mp, store, 1, 2, 100);
  });

  it('sends error for invalid amount', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/pay abc Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('Usage'));
  });

  it('sends error when paying self', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/pay 10 Lydia');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('yourself'));
  });

  it('sends error for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/pay 10 Nobody');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('not found'));
  });
});

// ---------------------------------------------------------------------------
// /bounty
// ---------------------------------------------------------------------------

describe('/bounty', () => {
  it('reports no active bounties for clean player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/bounty');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('no active'));
  });
});

// ---------------------------------------------------------------------------
// /capture and /release
// ---------------------------------------------------------------------------

describe('/capture', () => {
  it('sends error when target is not downed', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/capture Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('downed'));
  });

  it('calls capturePlayer when target is downed', () => {
    const { mp, store, bus } = setup();
    store.update(2, { isDown: true });
    const spy = jest.spyOn(captivity, 'capturePlayer');
    dispatchCommand(mp, store, bus, 1, '/capture Farengar');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2, 1);
  });
});

describe('/release', () => {
  it('sends error when target is not captive', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/release Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('not captive'));
  });

  it('calls releasePlayer when target is captive', () => {
    const { mp, store, bus } = setup();
    store.update(2, { isCaptive: true });
    const spy = jest.spyOn(captivity, 'releasePlayer');
    dispatchCommand(mp, store, bus, 1, '/release Farengar');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2);
  });
});

// ---------------------------------------------------------------------------
// /property
// ---------------------------------------------------------------------------

describe('/property list', () => {
  it('sends error when holdId is null', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/property list');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('not assigned'));
  });

  it('lists available properties when hold is set', () => {
    const { mp, store, bus } = setup();
    store.update(1, { holdId: 'whiterun' });
    dispatchCommand(mp, store, bus, 1, '/property list');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('whiterun'));
  });
});

describe('/property request', () => {
  it('sends error when no propertyId given', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/property request');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(0xff000001, expect.stringContaining('Usage'));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd gamemode && npm test -- --testPathPattern="playerCommands"
```

Expected: FAIL — import errors.

- [ ] **Step 3: Write `gamemode/src/playerCommands.ts`** with the implementation above.

- [ ] **Step 4: Run to confirm all pass**

```
cd gamemode && npm test -- --testPathPattern="playerCommands"
```

Expected: all green.

- [ ] **Step 5: Run full suite**

```
cd gamemode && npm test
```

Expected: all suites green.

- [ ] **Step 6: Commit**

```
git add gamemode/src/playerCommands.ts gamemode/tests/playerCommands.test.ts
git commit -m "feat: player command handlers (lecture, train, skill, pay, bounty, capture, property)"
```

---

## Task 4 — Wire index.ts and CHANGELOG

**Files:**
- Modify: `gamemode/src/index.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add imports to `gamemode/src/index.ts`**

```typescript
import { dispatchCommand } from './commands';
import { initPlayerCommands } from './playerCommands';
```

- [ ] **Step 2: Add init call after `initTraining`**

```typescript
initPlayerCommands(mp, store, bus);
```

- [ ] **Step 3: Wire the `customPacket` handler in `index.ts`**

Find the `customPacket` handler (it currently logs and does nothing). Replace with:

```typescript
mp.on('customPacket', (userId: number, packetBody: string) => {
  const player = store.getAll().find(p => p.id === userId);
  if (!player) return;

  let packet: { type?: string; message?: string };
  try {
    packet = JSON.parse(packetBody);
  } catch {
    return;
  }

  if (packet.type === 'chatMessage' && typeof packet.message === 'string') {
    dispatchCommand(mp, store, bus, userId, packet.message);
  }
});
```

- [ ] **Step 4: Add CHANGELOG entry**

Under a new `[0.8.0]` heading:

```markdown
## [0.8.0] — 2026-04-17

### Added
- `permissions.ts` — player role storage (`player | leader | staff`) via `ff_role` in `mp.set`. `hasPermission()` numeric level check. Default role is `player`.
- `commands.ts` — command registry, chat message parser, player name resolver, feedback sender, dispatcher with permission gate. Unknown commands and permission failures send `commandFeedback` packets to the caller.
- `playerCommands.ts` — registers all player-accessible commands at init:
  - `/lecture start|join [name]|end` — wraps college lecture session functions
  - `/train start [skill]|join [name]|end` — wraps training session functions
  - `/skill (skillId)` — shows XP, level, and cap per skill
  - `/pay [amount] [name]` — gold transfer
  - `/bounty` — self-check bounties across all holds
  - `/capture [name]` — takes a downed player captive
  - `/release [name]` — releases a captive
  - `/property list|request [id]` — list available properties, submit purchase request

### Architecture notes
- All command handlers are thin wrappers — no business logic lives in the command layer
- `stewardId` in `/property request` is temporarily `0` pending hold leadership resolution (Plan 9)
- Leader and staff commands (arrest, sentence, faction management, staff utilities) are in Plan 9
```

- [ ] **Step 5: Run full suite and build**

```
cd gamemode && npm test && npm run build
```

Expected: all tests passing, clean compile.

- [ ] **Step 6: Final commit**

```
git add gamemode/src/index.ts gamemode/src/permissions.ts gamemode/src/commands.ts \
        gamemode/src/playerCommands.ts CHANGELOG.md
git commit -m "feat: Plan 8 — command interface and player commands"
```

---

## Verification

1. `npm test` — all suites green
2. `npm run build` — no compile errors
3. Manually verify: `parseMessage('/pay 100 Lydia')` → `{ command: 'pay', args: ['100', 'Lydia'] }`
4. Manually verify: `parseMessage('just talking')` → `null`
5. Regression: `hasKoidPermission('thalmor', 'stormcloakUnderground')` → `true`

---

## Out of Scope (Plan 9)

- Leader commands: `/bounty add|clear|check`, `/arrest`, `/sentence`, `/property approve|deny|revoke`, `/faction join|leave|rank|bbb`
- Staff commands: `/down`, `/rise`, `/nvfl clear`, `/sober`, `/feed`, `/role set`
- Hold steward resolution for `/property request`
- Staff seed list from `server-settings.json` on startup
