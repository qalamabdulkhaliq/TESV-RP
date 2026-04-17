import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, HoldId, Property, PropertyId } from './types';
import { sendNotification, createNotification } from './courier';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Property registry — all purchasable properties in Skyrim
// Expand as cell swaps are implemented hold by hold.
// ---------------------------------------------------------------------------

export const PROPERTY_REGISTRY: Property[] = [
  // Whiterun
  { id: 'whiterun-breezehome',       holdId: 'whiterun',   type: 'home',     ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: 'whiterun-drunken-huntsman', holdId: 'whiterun',   type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: 'whiterun-belethor-general', holdId: 'whiterun',   type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Windhelm
  { id: 'eastmarch-hjerim',          holdId: 'eastmarch',  type: 'home',     ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: 'eastmarch-candlehearth',    holdId: 'eastmarch',  type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Riften
  { id: 'rift-honeyside',            holdId: 'rift',       type: 'home',     ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: 'rift-pawned-prawn',         holdId: 'rift',       type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Markarth
  { id: 'reach-vlindrel-hall',       holdId: 'reach',      type: 'home',     ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: 'reach-silver-blood-inn',    holdId: 'reach',      type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Solitude
  { id: 'haafingar-proudspire',      holdId: 'haafingar',  type: 'home',     ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: 'haafingar-winking-skeever', holdId: 'haafingar',  type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Dawnstar
  { id: 'pale-windpeak-inn',         holdId: 'pale',       type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Falkreath
  { id: 'falkreath-lakeview-manor',  holdId: 'falkreath',  type: 'home',     ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  { id: 'falkreath-dead-mans-drink', holdId: 'falkreath',  type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Morthal
  { id: 'hjaalmarch-highmoon-hall',  holdId: 'hjaalmarch', type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
  // Winterhold
  { id: 'winterhold-frozen-hearth',  holdId: 'winterhold', type: 'business', ownerId: null, pendingRequestBy: null, pendingRequestAt: null },
];

// ---------------------------------------------------------------------------
// In-memory property state (loaded/persisted via mp)
// ---------------------------------------------------------------------------

const PROP_KEY = 'ff_properties';
let properties: Map<PropertyId, Property> = new Map(
  PROPERTY_REGISTRY.map((p) => [p.id, { ...p }]),
);

function loadProperties(mp: Mp): void {
  const saved = mp.get(0, PROP_KEY) as Property[] | undefined;
  if (saved && Array.isArray(saved)) {
    for (const p of saved) {
      if (properties.has(p.id)) {
        properties.set(p.id, p);
      }
    }
  }
}

function saveProperties(mp: Mp): void {
  mp.set(0, PROP_KEY, Array.from(properties.values()));
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function getProperty(id: PropertyId): Property | null {
  return properties.get(id) ?? null;
}

export function getPropertiesByHold(holdId: HoldId): Property[] {
  return Array.from(properties.values()).filter((p) => p.holdId === holdId);
}

export function getOwnedProperties(playerId: PlayerId): Property[] {
  return Array.from(properties.values()).filter((p) => p.ownerId === playerId);
}

export function isAvailable(propertyId: PropertyId): boolean {
  const p = properties.get(propertyId);
  if (!p) return false;
  return p.ownerId === null && p.pendingRequestBy === null;
}

// ---------------------------------------------------------------------------
// System init
// ---------------------------------------------------------------------------

export function initHousing(mp: Mp, store: PlayerStore, bus: EventBus): void {
  loadProperties(mp);

  // Restore owned properties into player state on join
  bus.on('playerJoined', (event) => {
    const { playerId } = event.payload as { playerId: PlayerId };
    const owned = getOwnedProperties(playerId).map((p) => p.id);
    store.update(playerId, { properties: owned });

    // Send available properties list for this player's current hold
    const player = store.get(playerId);
    if (player?.holdId) {
      const available = getPropertiesByHold(player.holdId).filter((p) => isAvailable(p.id));
      sendPacket(mp, playerId, 'propertyList', { properties: available });
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Player submits a property purchase request.
 * Queues a courier notification to the Hold Steward (or Jarl if no Steward online).
 * Returns false if: property not found, not available, or player already has a pending request.
 */
export function requestProperty(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  propertyId: PropertyId,
  stewardId: PlayerId,
): boolean {
  const property = properties.get(propertyId);
  if (!property) return false;
  if (!isAvailable(propertyId)) return false;

  const player = store.get(playerId);
  if (!player) return false;

  // Mark pending
  property.pendingRequestBy = playerId;
  property.pendingRequestAt = Date.now();
  properties.set(propertyId, property);
  saveProperties(mp);

  // Dispatch internal event
  bus.dispatch({
    type: 'propertyRequested',
    payload: { playerId, propertyId },
    timestamp: Date.now(),
  });

  // Send courier notification to the Steward
  const notification = createNotification(
    'propertyRequest',
    playerId,
    stewardId,
    property.holdId,
    {
      propertyId,
      propertyType: property.type,
      requesterName: player.name,
    },
  );

  sendNotification(mp, store, notification);

  console.log(`[Housing] ${player.name} requested ${propertyId} — notification sent to ${stewardId}`);
  return true;
}

/**
 * Steward or Jarl approves a property request.
 * Transfers ownership to the requesting player.
 * Returns false if: property not found, no pending request, or approver lacks authority.
 */
export function approveProperty(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  propertyId: PropertyId,
  approverId: PlayerId,
): boolean {
  const property = properties.get(propertyId);
  if (!property || property.pendingRequestBy === null) return false;

  const newOwnerId = property.pendingRequestBy;

  property.ownerId = newOwnerId;
  property.pendingRequestBy = null;
  property.pendingRequestAt = null;
  properties.set(propertyId, property);
  saveProperties(mp);

  // Update new owner's property list in store
  const ownerState = store.get(newOwnerId);
  if (ownerState) {
    store.update(newOwnerId, {
      properties: [...ownerState.properties, propertyId],
    });

    // Notify the new owner
    sendPacket(mp, newOwnerId, 'propertyApproved', {
      propertyId,
      holdId: property.holdId,
      type: property.type,
    });
  }

  bus.dispatch({
    type: 'propertyApproved',
    payload: { propertyId, newOwnerId, approvedBy: approverId },
    timestamp: Date.now(),
  });

  console.log(`[Housing] ${propertyId} approved by ${approverId} → owner: ${newOwnerId}`);
  return true;
}

/**
 * Deny a property request — clears the pending state without transferring ownership.
 */
export function denyProperty(
  mp: Mp,
  propertyId: PropertyId,
): boolean {
  const property = properties.get(propertyId);
  if (!property || property.pendingRequestBy === null) return false;

  property.pendingRequestBy = null;
  property.pendingRequestAt = null;
  properties.set(propertyId, property);
  saveProperties(mp);

  console.log(`[Housing] Request for ${propertyId} denied`);
  return true;
}

/**
 * Revoke ownership — used by Jarl for unpaid taxes, abandonment, etc.
 */
export function revokeProperty(
  mp: Mp,
  store: PlayerStore,
  propertyId: PropertyId,
): boolean {
  const property = properties.get(propertyId);
  if (!property || property.ownerId === null) return false;

  const previousOwner = property.ownerId;
  property.ownerId = null;
  properties.set(propertyId, property);
  saveProperties(mp);

  const ownerState = store.get(previousOwner);
  if (ownerState) {
    store.update(previousOwner, {
      properties: ownerState.properties.filter((id) => id !== propertyId),
    });
  }

  console.log(`[Housing] ${propertyId} revoked from ${previousOwner}`);
  return true;
}

/**
 * Summon a player to a property hearing.
 * Sends a `propertySummon` packet to the requesting player and dispatches
 * `propertySummoned`. Returns false if property not found or no pending request.
 */
export function summonProperty(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  propertyId: PropertyId,
  summonerId: PlayerId,
): boolean {
  const property = properties.get(propertyId);
  if (!property || property.pendingRequestBy === null) return false;

  const requesterId = property.pendingRequestBy;
  sendPacket(mp, requesterId, 'propertySummon', { propertyId, holdId: property.holdId });

  bus.dispatch({
    type: 'propertySummoned',
    payload: { propertyId, requesterId, summonedBy: summonerId },
    timestamp: Date.now(),
  });

  console.log(`[Housing] ${propertyId} — player ${requesterId} summoned for hearing by ${summonerId}`);
  return true;
}

/**
 * Set or update the asking price for a property.
 * Sends an updated `propertyList` packet to the owner/requester if online.
 * Returns false if property not found.
 */
export function setPropertyPrice(
  mp: Mp,
  propertyId: PropertyId,
  price: number,
): boolean {
  const property = properties.get(propertyId);
  if (!property) return false;

  property.price = price;
  properties.set(propertyId, property);
  saveProperties(mp);

  // Notify owner and/or requester so their UI reflects the new price
  const interested = [property.ownerId, property.pendingRequestBy].filter(
    (id): id is PlayerId => id !== null,
  );
  const holdProps = getPropertiesByHold(property.holdId);
  for (const id of interested) {
    sendPacket(mp, id, 'propertyList', { properties: holdProps });
  }

  console.log(`[Housing] ${propertyId} price set to ${price}`);
  return true;
}

/** Expose properties map for testing */
export function _getPropertiesMap(): Map<PropertyId, Property> {
  return properties;
}

/** Reset state for testing */
export function _resetProperties(): void {
  properties = new Map(PROPERTY_REGISTRY.map((p) => [p.id, { ...p }]));
}
