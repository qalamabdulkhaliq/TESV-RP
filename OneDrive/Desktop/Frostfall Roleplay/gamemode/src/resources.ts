import type { HoldId } from './types';

// ---------------------------------------------------------------------------
// Hold resource definitions
// Unique items only available in specific holds — drives inter-hold trade.
// Base IDs are Skyrim form IDs (hex). Expand as cell swaps are implemented.
// ---------------------------------------------------------------------------

export interface HoldResource {
  /** Skyrim form ID of the item */
  baseId: number;
  /** Human-readable name for logging/UI */
  name: string;
  /** The hold this resource is exclusive to */
  holdId: HoldId;
  /** Rough description of where it comes from */
  source: string;
}

export const HOLD_RESOURCES: HoldResource[] = [
  // Whiterun — grain, livestock, trade hub
  { baseId: 0x000640B5, name: 'Wheat',           holdId: 'whiterun',   source: 'Farms on the plains' },
  { baseId: 0x00065C39, name: 'Snowberry',        holdId: 'whiterun',   source: 'Whiterun plains' },

  // Eastmarch — furs, harbor
  { baseId: 0x0003AD52, name: 'Bear Pelt',        holdId: 'eastmarch',  source: 'Eastmarch hunters' },
  { baseId: 0x00034CDD, name: 'Mammoth Tusk',     holdId: 'eastmarch',  source: 'Tundra herds' },

  // The Rift — fish, mead, timber
  { baseId: 0x00106E1B, name: 'Salmon',           holdId: 'rift',       source: 'Rift rivers' },
  { baseId: 0x034C5E,   name: 'Black-Briar Mead', holdId: 'rift',       source: 'Black-Briar Meadery' },

  // The Reach — silver, Dwemer salvage
  { baseId: 0x0005AD93, name: 'Silver Ingot',     holdId: 'reach',      source: 'Markarth mines' },
  { baseId: 0x000DB8A2, name: 'Dwemer Metal Scrap', holdId: 'reach',    source: 'Dwemer ruins' },

  // Haafingar — imports, fine goods
  { baseId: 0x000340,   name: 'Alto Wine',        holdId: 'haafingar',  source: 'Solitude docks imports' },
  { baseId: 0x00063B5F, name: 'Tundra Cotton',    holdId: 'haafingar',  source: 'Capital trade' },

  // The Pale — iron, corundum
  { baseId: 0x0005AD99, name: 'Iron Ingot',       holdId: 'pale',       source: 'Dawnstar mines' },
  { baseId: 0x0005AD9D, name: 'Corundum Ingot',   holdId: 'pale',       source: 'Dawnstar mines' },

  // Falkreath — timber, pelts, game
  { baseId: 0x000800E4, name: 'Firewood',         holdId: 'falkreath',  source: 'Falkreath forests' },
  { baseId: 0x0003AD57, name: 'Wolf Pelt',        holdId: 'falkreath',  source: 'Falkreath hunters' },

  // Hjaalmarch — alchemy ingredients
  { baseId: 0x0004DA73, name: 'Swamp Fungal Pod', holdId: 'hjaalmarch', source: 'Morthal marshes' },
  { baseId: 0x00077E1C, name: 'Deathbell',        holdId: 'hjaalmarch', source: 'Morthal marshes' },

  // Winterhold — arcane components
  { baseId: 0x0006BC02, name: 'Soul Gem (Lesser)',holdId: 'winterhold', source: 'College vaults' },
  { baseId: 0x0002E4E2, name: 'Frost Salts',      holdId: 'winterhold', source: 'College procurement' },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Returns all resources exclusive to a given hold */
export function getHoldResources(holdId: HoldId): HoldResource[] {
  return HOLD_RESOURCES.filter((r) => r.holdId === holdId);
}

/** Returns the hold that produces a given item, or null if not hold-exclusive */
export function getResourceHold(baseId: number): HoldId | null {
  return HOLD_RESOURCES.find((r) => r.baseId === baseId)?.holdId ?? null;
}

/** Returns true if an item is exclusive to a specific hold */
export function isHoldExclusive(baseId: number): boolean {
  return getResourceHold(baseId) !== null;
}
