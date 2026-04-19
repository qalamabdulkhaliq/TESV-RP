import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, ActorId, HoldId } from './types';
import { sendPacket, getInventory, setInventory, getGold } from './skymp';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LOOT_CAP_GOLD  = 500;
export const LOOT_CAP_ITEMS = 3;
const BLEED_OUT_MS    = 3 * 60 * 1000;  // 3 minutes downed before auto-bleed-out
const LOOT_SESSION_MS = 60 * 1000;      // 60 seconds to select loot

// ---------------------------------------------------------------------------
// Temple spawn points per hold (placeholders — fill from CK coordinates)
// ---------------------------------------------------------------------------

interface SpawnPoint {
  pos: [number, number, number];
  cellOrWorldDesc: string | null;
  label: string;
}

export const HOLD_TEMPLE_SPAWNS: Record<HoldId, SpawnPoint> = {
  whiterun:   { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Temple of Kynareth' },
  eastmarch:  { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Temple of Talos' },
  rift:       { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Temple of Mara' },
  haafingar:  { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Temple of the Divines' },
  reach:      { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Temple of Dibella' },
  pale:       { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Hall of the Dead, Dawnstar' },
  falkreath:  { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Hall of the Dead, Falkreath' },
  hjaalmarch: { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Morthal Shrine' },
  winterhold: { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'College of Winterhold Courtyard' },
};

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const _bleedTimers: Map<PlayerId, ReturnType<typeof setTimeout>> = new Map();

interface LootSession {
  looterPlayerId: PlayerId;
  victimPlayerId: PlayerId;
  items: { baseId: number; count: number }[];
  expiresAt: number;
}
const _lootSessions: Map<string, LootSession> = new Map();

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function isDowned(store: PlayerStore, playerId: PlayerId): boolean {
  return store.get(playerId)?.isDown ?? false;
}

function _clearBleedTimer(victimId: PlayerId): void {
  const id = _bleedTimers.get(victimId);
  if (id !== undefined) {
    clearTimeout(id);
    _bleedTimers.delete(victimId);
  }
}

function _getSpawnForPlayer(store: PlayerStore, playerId: PlayerId): SpawnPoint {
  const player = store.get(playerId);
  if (player?.holdId && HOLD_TEMPLE_SPAWNS[player.holdId]) {
    return HOLD_TEMPLE_SPAWNS[player.holdId];
  }
  return HOLD_TEMPLE_SPAWNS.whiterun;
}

function _teleportToSpawn(mp: Mp, actorId: ActorId, spawn: SpawnPoint): void {
  if (!spawn.cellOrWorldDesc) return;
  mp.set(actorId, 'locationalData', {
    pos: spawn.pos,
    cellOrWorldDesc: spawn.cellOrWorldDesc,
    rot: [0, 0, 0],
  });
}

function _startBleedTimer(
  mp: Mp, store: PlayerStore, bus: EventBus, victimId: PlayerId,
): void {
  _clearBleedTimer(victimId);
  const timerId = setTimeout(() => {
    _bleedTimers.delete(victimId);
    const player = store.get(victimId);
    if (!player || !player.isDown) return;
    store.update(victimId, { isDown: false });
    sendPacket(mp, victimId, 'playerBledOut', {});
    bus.dispatch({ type: 'playerBledOut', payload: { victimId }, timestamp: Date.now() });
    console.log(`[Combat] ${player.name} bled out`);
    // Revive in place, then teleport to hold temple
    mp.set(player.actorId, 'isDead', false);
    const spawn = _getSpawnForPlayer(store, victimId);
    if (spawn.cellOrWorldDesc) {
      setTimeout(() => _teleportToSpawn(mp, player.actorId, spawn), 500);
    }
  }, BLEED_OUT_MS);
  _bleedTimers.set(victimId, timerId);
}

// ---------------------------------------------------------------------------
// Public API — combat actions
// ---------------------------------------------------------------------------

export function downPlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  victimId: PlayerId,
  attackerId: PlayerId,
): boolean {
  const victim = store.get(victimId);
  if (!victim) return false;
  if (victim.isDown) return false;

  store.update(victimId, { isDown: true, downedAt: Date.now() });

  const payload = {
    victimId,
    attackerId,
    lootCapGold:  LOOT_CAP_GOLD,
    lootCapItems: LOOT_CAP_ITEMS,
  };
  sendPacket(mp, victimId,   'playerDowned', payload);
  sendPacket(mp, attackerId, 'playerDowned', payload);

  bus.dispatch({
    type: 'playerDowned',
    payload: { victimId, attackerId, holdId: victim.holdId },
    timestamp: Date.now(),
  });

  _startBleedTimer(mp, store, bus, victimId);
  console.log(`[Combat] ${victim.name} downed by ${attackerId}`);
  return true;
}

export function risePlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;
  if (!player.isDown) return false;

  _clearBleedTimer(playerId);
  store.update(playerId, { isDown: false });
  sendPacket(mp, playerId, 'playerRisen', { playerId });

  bus.dispatch({ type: 'playerRisen', payload: { playerId }, timestamp: Date.now() });
  console.log(`[Combat] ${player.name} has risen`);
  return true;
}

export function revivePlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  reviverId: PlayerId,
  victimId: PlayerId,
): boolean {
  const victim  = store.get(victimId);
  const reviver = store.get(reviverId);
  if (!victim || !victim.isDown) return false;

  risePlayer(mp, store, bus, victimId);
  mp.set(victim.actorId, 'isDead', false);

  sendPacket(mp, victimId,  'playerRevived', { reviverName: reviver?.name ?? 'Unknown' });
  if (reviver) sendPacket(mp, reviverId, 'revivedTarget', { targetName: victim.name });

  bus.dispatch({ type: 'playerRevived', payload: { victimId, reviverId }, timestamp: Date.now() });
  return true;
}

export function executePlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  executorId: PlayerId,
  victimId: PlayerId,
): boolean {
  const victim   = store.get(victimId);
  const executor = store.get(executorId);
  if (!victim || !victim.isDown) return false;

  _clearBleedTimer(victimId);
  store.update(victimId, { isDown: false });

  const spawn = _getSpawnForPlayer(store, victimId);
  mp.set(victim.actorId, 'isDead', false);
  if (spawn.cellOrWorldDesc) {
    setTimeout(() => _teleportToSpawn(mp, victim.actorId, spawn), 500);
  }

  sendPacket(mp, victimId, 'playerExecuted', {
    executorName: executor?.name ?? 'Unknown',
    spawnLabel:   spawn.label,
  });
  if (executor) sendPacket(mp, executorId, 'executedTarget', { targetName: victim.name });

  bus.dispatch({ type: 'playerExecuted', payload: { victimId, executorId }, timestamp: Date.now() });
  console.log(`[Combat] ${victim.name} executed by ${executor?.name ?? executorId}`);
  return true;
}

// ---------------------------------------------------------------------------
// Loot sessions
// ---------------------------------------------------------------------------

export function openLootSession(
  mp: Mp,
  store: PlayerStore,
  _bus: EventBus,
  looterPlayerId: PlayerId,
  victimPlayerId: PlayerId,
): boolean {
  const victim = store.get(victimPlayerId);
  const looter = store.get(looterPlayerId);
  if (!victim || !victim.isDown || !looter) return false;

  const victimInv = getInventory(mp, victim.actorId);
  const gold = Math.min(getGold(mp, victim.actorId), LOOT_CAP_GOLD);
  const items: { baseId: number; count: number }[] = [];
  if (gold > 0) items.push({ baseId: 0xf, count: gold });
  for (const e of victimInv.entries) {
    if (e.baseId !== 0xf) items.push({ baseId: e.baseId, count: e.count });
  }

  const sessionId = `loot_${Date.now()}_${looterPlayerId}`;
  _lootSessions.set(sessionId, {
    looterPlayerId,
    victimPlayerId,
    items,
    expiresAt: Date.now() + LOOT_SESSION_MS,
  });

  sendPacket(mp, looterPlayerId, 'openLootMenu', {
    sessionId,
    victimName: victim.name,
    items,
    maxItems: LOOT_CAP_ITEMS,
  });
  return true;
}

export function completeLootSession(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  looterPlayerId: PlayerId,
  packet: { sessionId: string; selectedItems: { baseId: number; count: number }[] },
): void {
  const { sessionId, selectedItems } = packet;
  const session = _lootSessions.get(sessionId);
  if (!session || session.looterPlayerId !== looterPlayerId) return;
  if (Date.now() > session.expiresAt) {
    _lootSessions.delete(sessionId);
    return;
  }
  _lootSessions.delete(sessionId);

  const victim = store.get(session.victimPlayerId);
  const looter = store.get(looterPlayerId);
  if (!victim || !victim.isDown || !looter) return;

  const validIds = new Set(session.items.map(e => e.baseId));
  const toTake = (Array.isArray(selectedItems) ? selectedItems : [])
    .filter(e => validIds.has(e.baseId))
    .slice(0, LOOT_CAP_ITEMS);

  const victimInv = getInventory(mp, victim.actorId);
  const looterInv = getInventory(mp, looter.actorId);

  for (const item of toTake) {
    const fromEntry = victimInv.entries.find(e => e.baseId === item.baseId);
    if (!fromEntry) continue;
    const amount = Math.min(item.count, fromEntry.count);
    fromEntry.count -= amount;
    const toEntry = looterInv.entries.find(e => e.baseId === item.baseId);
    if (toEntry) toEntry.count += amount;
    else looterInv.entries.push({ baseId: item.baseId, count: amount });
  }

  setInventory(mp, victim.actorId, { entries: victimInv.entries.filter(e => e.count > 0) });
  setInventory(mp, looter.actorId, looterInv);

  bus.dispatch({
    type: 'playerLooted',
    payload: { victimId: session.victimPlayerId, looterPlayerId, itemCount: toTake.length },
    timestamp: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initCombat(mp: Mp, store: PlayerStore, bus: EventBus): void {
  console.log('[Combat] Initializing');

  // Property assignment — verified against ScampServerListener.cpp and test_isdead.js.
  // Return false to block auto-respawn; bleed-out timer manages revival.
  mp.onDeath = (actorId: number, killerId: number) => {
    const victimId = mp.getUserByActor(actorId);
    if (!victimId || !store.get(victimId)) return true; // NPC — allow normal respawn

    const attackerActorId = killerId ?? 0;
    const attackerId = attackerActorId ? mp.getUserByActor(attackerActorId) : 0;
    downPlayer(mp, store, bus, victimId, attackerId ?? 0);
    return false;
  };

  console.log('[Combat] Ready');
}
