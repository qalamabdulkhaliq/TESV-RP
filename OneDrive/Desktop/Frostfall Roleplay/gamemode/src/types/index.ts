// ============================================================
// Frostfall Roleplay — Shared Types
// All systems import from here. Never define domain types inline.
// ============================================================

export type PlayerId = number; // SkyMP userId (not actorId)
export type ActorId = number;  // SkyMP actorFormId

// -----------------------------------------------------------
// World geography
// -----------------------------------------------------------

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

export const ALL_HOLDS: HoldId[] = [
  'whiterun', 'eastmarch', 'rift', 'reach', 'haafingar',
  'pale', 'falkreath', 'hjaalmarch', 'winterhold',
];

// -----------------------------------------------------------
// Factions
// -----------------------------------------------------------

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

// -----------------------------------------------------------
// Inventory (matches SkyMP's built-in inventory property)
// -----------------------------------------------------------

export interface InventoryEntry {
  baseId: number;
  count: number;
  // Optional enchantment/extra data — we don't write these, just preserve them
  health?: number;
  enchantmentId?: number;
  name?: string;
  worn?: boolean;
  wornLeft?: boolean;
}

export interface Inventory {
  entries: InventoryEntry[];
}

/** Skyrim form ID for gold (Septims) */
export const GOLD_BASE_ID = 0x0000000f;

// -----------------------------------------------------------
// Player state
// -----------------------------------------------------------

export type PropertyType = 'home' | 'business';
export type PropertyId = string;

export interface PlayerState {
  id: PlayerId;
  actorId: ActorId;
  name: string;
  holdId: HoldId | null;
  factions: FactionId[];
  /** Bounty per hold. Missing key = 0 septims. */
  bounty: Partial<Record<HoldId, number>>;
  isDown: boolean;
  isCaptive: boolean;
  /** Unix ms timestamp when downed this in-game day, null if not downed */
  downedAt: number | null;
  /** Unix ms timestamp when captivity began, null if not captive */
  captiveAt: number | null;
  properties: PropertyId[];
  /**
   * 0 = starving (debuffs apply), 10 = full (buffs apply).
   * Drops 1 level every 30 IRL minutes of playtime.
   */
  hungerLevel: number;
  /**
   * 0 = sober, 10 = blackout.
   * Rises on alcohol consumption, falls passively over time.
   */
  drunkLevel: number;
  septims: number;
  /** Stipend payments received so far. Max 24 (one per hour, first 24h). */
  stipendPaidHours: number;
  /** Total IRL minutes spent online this session, for hunger tick tracking */
  minutesOnline: number;
}

// -----------------------------------------------------------
// Properties
// -----------------------------------------------------------

export interface Property {
  id: PropertyId;
  holdId: HoldId;
  ownerId: PlayerId | null;
  type: PropertyType;
  pendingRequestBy: PlayerId | null;
  /** Unix ms timestamp of purchase request, null if none pending */
  pendingRequestAt: number | null;
}

// -----------------------------------------------------------
// Internal event bus
// -----------------------------------------------------------

export type GameEventType =
  | 'playerJoined'
  | 'playerLeft'
  | 'playerDowned'
  | 'playerRisen'
  | 'playerCaptured'
  | 'playerReleased'
  | 'playerArrested'
  | 'playerSentenced'
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

// Payload shapes

export interface PlayerJoinedPayload {
  playerId: PlayerId;
  actorId: ActorId;
  name: string;
}

export interface PlayerLeftPayload {
  playerId: PlayerId;
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
