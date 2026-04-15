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
import { EventBus } from './events';
import { PlayerStore } from './store';

import { initHunger }   from './hunger';
import { initDrunkBar } from './drunkBar';
import { initEconomy }  from './economy';
import { initCourier }  from './courier';
import { initHousing }  from './housing';
import { initBounty }   from './bounty';
// Future system imports (uncomment as each plan is executed):
// import { initResources } from './resources';
// import { initFactions }  from './factions';
// import { initCollege }   from './college';
// import { initKoid }      from './koid';
// import { initCombat }    from './combat';
// import { initNvfl }      from './nvfl';
// import { initCaptivity } from './captivity';
// import { initPrison }    from './prison';
// import { initFactions }  from './factions';
// import { initCollege }   from './college';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

declare const mp: Mp;

const bus = new EventBus();
const store = new PlayerStore();

// ---------------------------------------------------------------------------
// SYSTEMS
// ---------------------------------------------------------------------------

initHunger(mp, store, bus);
initDrunkBar(mp, store, bus);
initEconomy(mp, store, bus);
initCourier(mp, store, bus);
initHousing(mp, store, bus);
initBounty(mp, store, bus);

// ---------------------------------------------------------------------------
// SkyMP event hooks
// ---------------------------------------------------------------------------

mp.on('connect', (userId: number) => {
  const actorId = mp.getUserActor(userId);
  const name = mp.getActorName(actorId);

  const state = store.registerPlayer(userId, actorId, name);

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

mp.on('customPacket', (userId: number, rawContent: string) => {
  // Custom packets from the client are handled by individual systems.
  // Systems register their own mp.on('customPacket') listeners or
  // subscribe to bus events dispatched here. Currently a no-op.
  try {
    const content = JSON.parse(rawContent) as Record<string, unknown>;
    const type = content['customPacketType'];
    if (typeof type === 'string') {
      console.log(`[Frostfall] customPacket from userId=${userId} type=${type}`);
    }
  } catch {
    // malformed packet — ignore
  }
});

console.log('[Frostfall] Game mode loaded.');
