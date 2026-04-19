/**
 * Frostfall Roleplay — Game Mode Entry Point
 *
 * SkyMP loads this file via require() after setting:
 *   globalThis.mp = server  (the ScampServer / Mp instance)
 *
 * There is no exported main() — this module runs at load time.
 * Hot-reload is supported: SkyMP calls server.clear() then re-requires this file.
 *
 * Adding a new system:
 *   1. Create src/yourSystem.ts exporting init(mp, store, bus)
 *   2. Import and call it below, in the SYSTEMS section
 */

import type { Mp } from './skymp';
import type { HoldId } from './types';
import { ALL_HOLDS } from './types';
import { EventBus } from './events';
import { PlayerStore } from './store';

import { initChat, broadcastToHold, sendChatMessage } from './chat';
import { initHunger }   from './hunger';
import { initDrunkBar } from './drunkBar';
import { initEconomy }  from './economy';
import { initCourier }  from './courier';
import { initHousing }  from './housing';
import { initBounty }    from './bounty';
import { initFactions }  from './factions';
import { initCollege }   from './college';
import { initSkills }         from './skills';
import { initTraining }        from './training';
import { dispatchCommand }     from './commands';
import { initPlayerCommands }  from './playerCommands';
import { initTreasury }        from './treasury';
import { initStaffCommands }   from './staffCommands';
import { initCombat }          from './combat';
import { initMagic }           from './magic';
import { initCaptivity }       from './captivity';
// koid, nvfl, resources, prison are pure-logic modules — no init required;
// they are imported directly by the command handlers that use them.

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

declare const mp: Mp;

const bus = new EventBus();
const store = new PlayerStore();

// ---------------------------------------------------------------------------
// SYSTEMS
// ---------------------------------------------------------------------------

initChat(mp, store, bus);
initHunger(mp, store, bus);
initDrunkBar(mp, store, bus);
initEconomy(mp, store, bus);
initCourier(mp, store, bus);
initHousing(mp, store, bus);
initBounty(mp, store, bus);
initFactions(mp, store, bus);
initCollege(mp, store, bus);
initSkills(mp, store, bus);
initTraining(mp, store, bus);
initCombat(mp, store, bus);
initMagic(mp, store, bus);
initCaptivity(mp, store, bus);
initPlayerCommands(mp, store, bus);
initTreasury(mp);
initStaffCommands(mp, store, bus);

// ---------------------------------------------------------------------------
// SkyMP event hooks
// ---------------------------------------------------------------------------

mp.on('connect', (userId: number) => {
  const actorId = mp.getUserActor(userId);
  const name = mp.getActorName(actorId);

  store.registerPlayer(userId, actorId, name);

  const savedHoldId = mp.get(userId, 'ff_holdId');
  if (typeof savedHoldId === 'string' && ALL_HOLDS.includes(savedHoldId as HoldId)) {
    store.update(userId, { holdId: savedHoldId as HoldId });
  }

  bus.dispatch({
    type: 'playerJoined',
    payload: { playerId: userId, actorId, name },
    timestamp: Date.now(),
  });

  console.log(`[Frostfall] + ${name} (userId=${userId} actorId=${actorId.toString(16)})`);
});

mp.on('disconnect', (userId: number) => {
  const state = store.get(userId);
  const name = state?.name ?? `unknown(${userId})`;

  store.deregisterPlayer(userId);

  bus.dispatch({
    type: 'playerLeft',
    payload: { playerId: userId },
    timestamp: Date.now(),
  });

  console.log(`[Frostfall] - ${name} disconnected`);
});

// ---------------------------------------------------------------------------
// Chat + command bridge
// ---------------------------------------------------------------------------

// _ff_chat fires when a player sends text via the browser chat widget.
// Event name starts with '_' — required by ActionListener::OnCustomEvent.
// refrId is the actor formId; text is the trimmed message or /command.
(mp as unknown as Record<string, unknown>)['_ff_chat'] = (refrId: number, text: string) => {
  try {
    const userId = mp.getUserByActor(refrId);
    const player = store.get(userId);
    if (!player || typeof text !== 'string' || !text.trim()) return;
    const trimmed = text.trim();
    if (trimmed.startsWith('/')) {
      dispatchCommand(mp, store, bus, userId, trimmed);
    } else {
      broadcastToHold(mp, store, userId, `[${player.name}]: ${trimmed}`);
    }
  } catch (err) {
    console.error('[Frostfall] _ff_chat error:', err);
  }
};

// Fallback: some clients may send a customPacket directly.
mp.on('customPacket', (userId: number, rawContent: string) => {
  const player = store.get(userId);
  if (!player) return;

  let packet: { customPacketType?: string; message?: string };
  try {
    packet = JSON.parse(rawContent);
  } catch {
    return;
  }

  if (packet.customPacketType === 'chatMessage' && typeof packet.message === 'string') {
    dispatchCommand(mp, store, bus, userId, packet.message);
  }
});

console.log('[Frostfall] Game mode loaded.');
