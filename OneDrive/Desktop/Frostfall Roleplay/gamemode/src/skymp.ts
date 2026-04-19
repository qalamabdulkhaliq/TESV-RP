import type { Inventory } from './types';

/**
 * The SkyMP ScampServer interface — sourced directly from
 * skymp-reference/skymp5-server/ts/scampNative.ts.
 *
 * This is the ONLY file that references the SkyMP runtime.
 * Everything else goes through getMp() / getServer().
 */
export interface ScampServer {
  on(event: 'connect', handler: (userId: number) => void): void;
  on(event: 'disconnect', handler: (userId: number) => void): void;
  on(event: 'customPacket', handler: (userId: number, content: string) => void): void;

  tick(): void;
  clear(): void;
  attachSaveStorage(): void;

  createActor(formId: number, pos: number[], angleZ: number, cellOrWorld: number, userProfileId?: number): number;
  destroyActor(formId: number): void;

  setUserActor(userId: number, actorFormId: number): void;
  getUserActor(userId: number): number;
  getUserByActor(formId: number): number;
  getUserGuid(userId: number): string;
  getUserIp(userId: number): string;

  isConnected(userId: number): boolean;
  getActorName(actorId: number): string;
  getActorPos(actorId: number): number[];
  getActorCellOrWorld(actorId: number): number;
  getActorsByProfileId(profileId: number): number[];

  setEnabled(actorId: number, enabled: boolean): void;
  setRaceMenuOpen(formId: number, open: boolean): void;
  sendCustomPacket(userId: number, jsonContent: string): void;
  kick(userId: number): void;

  writeLogs(logLevel: string, message: string): void;
}

/**
 * The mp global object — ScampServer extended with Papyrus-style
 * get/set/makeProperty/makeEventSource for actor state management.
 *
 * SkyMP sets `globalThis.mp = server` before loading the gamemode,
 * so we declare it as a global and expose it via getMp().
 */
export interface Mp extends ScampServer {
  /** Read a built-in or custom property from an actor */
  get(formId: number, propertyName: string): unknown;
  /** Write a built-in or custom property to an actor */
  set(formId: number, propertyName: string, value: unknown): void;
  /** Define a custom persistent property synced to clients */
  makeProperty(name: string, options: MakePropertyOptions): void;
  /** Define a custom client-side event source */
  makeEventSource(name: string, functionBody: string): void;
  /** Find actors by a custom indexed property value */
  findFormsByPropertyValue(propertyName: string, value: unknown): number[];
  /**
   * SkyMP death hook. Assign a function to intercept actor death events.
   * Return false to block the default auto-respawn (RespawnWithDelay).
   * Verified against ScampServerListener.cpp and test_isdead.js.
   */
  onDeath: ((actorId: number, killerId: number) => boolean | void) | undefined;
}

export interface MakePropertyOptions {
  isVisibleByOwner: boolean;
  isVisibleByNeighbors: boolean;
  updateOwner: string;
  updateNeighbor: string;
}

// ---------------------------------------------------------------------------
// Typed helpers — keep inventory/gold manipulation in one place
// ---------------------------------------------------------------------------

export function getInventory(mp: Mp, actorId: number): Inventory {
  const inv = mp.get(actorId, 'inventory') as Inventory | undefined;
  return inv ?? { entries: [] };
}

export function setInventory(mp: Mp, actorId: number, inventory: Inventory): void {
  mp.set(actorId, 'inventory', inventory);
}

/** Returns the current gold count for an actor. */
export function getGold(mp: Mp, actorId: number): number {
  const inv = getInventory(mp, actorId);
  const entry = inv.entries.find((e) => e.baseId === 0xf);
  return entry?.count ?? 0;
}

/** Sets the actor's gold to an exact amount (replaces existing gold entry). */
export function setGold(mp: Mp, actorId: number, amount: number): void {
  const inv = getInventory(mp, actorId);
  const filtered = inv.entries.filter((e) => e.baseId !== 0xf);
  if (amount > 0) {
    filtered.push({ baseId: 0xf, count: amount });
  }
  setInventory(mp, actorId, { entries: filtered });
}

/** Adds gold to an actor. Returns new total. */
export function addGold(mp: Mp, actorId: number, amount: number): number {
  const current = getGold(mp, actorId);
  const next = current + amount;
  setGold(mp, actorId, next);
  return next;
}

/** Removes gold from an actor. Clamps to 0. Returns new total. */
export function removeGold(mp: Mp, actorId: number, amount: number): number {
  const current = getGold(mp, actorId);
  const next = Math.max(0, current - amount);
  setGold(mp, actorId, next);
  return next;
}

/** Send a JSON message to a player's client via customPacket. */
export function sendPacket(mp: Mp, userId: number, type: string, payload: Record<string, unknown>): void {
  mp.sendCustomPacket(userId, JSON.stringify({ customPacketType: type, ...payload }));
}
