import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, FactionId } from './types';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactionDocument {
  factionId: FactionId;
  /** What membership grants — mechanical advantages, social standing, access */
  benefits: string;
  /** What it costs — restrictions, obligations, required RP commitments */
  burdens: string;
  /** Conduct rules keeping the faction recognizable within lore bounds */
  bylaws: string;
  updatedAt: number;
  /** PlayerId of the staff member who last updated this document */
  updatedBy: PlayerId;
}

export interface FactionMembership {
  factionId: FactionId;
  /** Rank within the faction. 0 = initiate/lowest. Higher = more senior. */
  rank: number;
  joinedAt: number;
}

// ---------------------------------------------------------------------------
// Persistence keys
// ---------------------------------------------------------------------------

/** World-keyed — shared across all players, staff-mutable at runtime */
const DOCS_KEY = 'ff_faction_docs';
/** Per-player — stores the player's memberships with rank */
const MEMBERS_KEY = 'ff_memberships';

// ---------------------------------------------------------------------------
// Internal persistence helpers
// ---------------------------------------------------------------------------

function loadDocs(mp: Mp): Partial<Record<FactionId, FactionDocument>> {
  return (mp.get(0, DOCS_KEY) as Partial<Record<FactionId, FactionDocument>>) ?? {};
}

function saveDocs(mp: Mp, docs: Partial<Record<FactionId, FactionDocument>>): void {
  mp.set(0, DOCS_KEY, docs);
}

function loadMemberships(mp: Mp, actorId: number): FactionMembership[] {
  return (mp.get(actorId, MEMBERS_KEY) as FactionMembership[]) ?? [];
}

function saveMemberships(mp: Mp, actorId: number, memberships: FactionMembership[]): void {
  mp.set(actorId, MEMBERS_KEY, memberships);
}

// ---------------------------------------------------------------------------
// System init
// ---------------------------------------------------------------------------

export function initFactions(mp: Mp, store: PlayerStore, bus: EventBus): void {
  bus.on('playerJoined', (event) => {
    const { playerId } = event.payload as { playerId: PlayerId };
    const player = store.get(playerId);
    if (!player) return;

    const memberships = loadMemberships(mp, player.actorId);
    const factionIds = memberships.map((m) => m.factionId);
    store.update(playerId, { factions: factionIds });

    if (memberships.length > 0) {
      sendPacket(mp, playerId, 'factionSync', { memberships });
    }
  });
}

// ---------------------------------------------------------------------------
// BBB document API (staff-facing)
// ---------------------------------------------------------------------------

/**
 * Returns the BBB document for a faction, or null if none has been authored.
 */
export function getFactionDocument(mp: Mp, factionId: FactionId): FactionDocument | null {
  const docs = loadDocs(mp);
  return docs[factionId] ?? null;
}

/**
 * Create or update the BBB document for a faction.
 * Only called by staff via command. Always persists.
 */
export function setFactionDocument(mp: Mp, doc: FactionDocument): void {
  const docs = loadDocs(mp);
  docs[doc.factionId] = { ...doc, updatedAt: doc.updatedAt ?? Date.now() };
  saveDocs(mp, docs);
  console.log(`[Factions] BBB document updated for ${doc.factionId} by staff ${doc.updatedBy}`);
}

// ---------------------------------------------------------------------------
// Membership API (game-facing)
// ---------------------------------------------------------------------------

/**
 * Add a player to a faction at the given rank (default 0 = initiate).
 * Updates store.factions[], persists FactionMembership, dispatches factionJoined.
 * Returns false if player is unknown or already a member.
 */
export function joinFaction(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  factionId: FactionId,
  rank = 0,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;

  const memberships = loadMemberships(mp, player.actorId);
  if (memberships.some((m) => m.factionId === factionId)) return false;

  const entry: FactionMembership = { factionId, rank, joinedAt: Date.now() };
  memberships.push(entry);
  saveMemberships(mp, player.actorId, memberships);

  store.update(playerId, { factions: memberships.map((m) => m.factionId) });

  bus.dispatch({
    type: 'factionJoined',
    payload: { playerId, factionId, rank },
    timestamp: Date.now(),
  });

  sendPacket(mp, playerId, 'factionJoined', { factionId, rank });

  console.log(`[Factions] ${player.name} joined ${factionId} at rank ${rank}`);
  return true;
}

/**
 * Remove a player from a faction.
 * Updates store.factions[], persists change, dispatches factionLeft.
 * Returns false if player is unknown or not a member.
 */
export function leaveFaction(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  factionId: FactionId,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;

  const memberships = loadMemberships(mp, player.actorId);
  const before = memberships.length;
  const updated = memberships.filter((m) => m.factionId !== factionId);
  if (updated.length === before) return false;

  saveMemberships(mp, player.actorId, updated);
  store.update(playerId, { factions: updated.map((m) => m.factionId) });

  bus.dispatch({
    type: 'factionLeft',
    payload: { playerId, factionId },
    timestamp: Date.now(),
  });

  sendPacket(mp, playerId, 'factionLeft', { factionId });

  console.log(`[Factions] ${player.name} left ${factionId}`);
  return true;
}

/**
 * Returns true if the player is currently a member of the faction.
 */
export function isFactionMember(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
  factionId: FactionId,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;
  return loadMemberships(mp, player.actorId).some((m) => m.factionId === factionId);
}

/**
 * Returns the player's rank in a faction, or null if not a member.
 */
export function getPlayerFactionRank(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
  factionId: FactionId,
): number | null {
  const player = store.get(playerId);
  if (!player) return null;
  return loadMemberships(mp, player.actorId).find((m) => m.factionId === factionId)?.rank ?? null;
}

/**
 * Update a player's rank within a faction they already belong to.
 * Returns false if player unknown or not a member of factionId.
 * Reuses the factionJoined event so the client can treat it as a rank update.
 */
export function setFactionRank(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  factionId: FactionId,
  rank: number,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;

  const memberships = loadMemberships(mp, player.actorId);
  const entry = memberships.find((m) => m.factionId === factionId);
  if (!entry) return false;

  entry.rank = rank;
  saveMemberships(mp, player.actorId, memberships);

  bus.dispatch({
    type: 'factionJoined',
    payload: { playerId, factionId, rank },
    timestamp: Date.now(),
  });

  sendPacket(mp, playerId, 'factionSync', { memberships });

  console.log(`[Factions] ${player.name} rank in ${factionId} set to ${rank}`);
  return true;
}

/**
 * Returns all faction memberships for a player (with rank and join timestamp).
 */
export function getPlayerMemberships(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
): FactionMembership[] {
  const player = store.get(playerId);
  if (!player) return [];
  return loadMemberships(mp, player.actorId);
}
