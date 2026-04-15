import type { FactionId, HoldId } from './types';

// ---------------------------------------------------------------------------
// KOID — Kill on ID
// Defines which faction pairs have mutual lethal-force permissions.
// ---------------------------------------------------------------------------

export type KoidPair = {
  a: FactionId | 'guard';
  b: FactionId | 'highBounty';
  description: string;
};

/**
 * Lore-driven KOID pairs. Both sides may kill the other without requiring
 * a prior RP confrontation.
 *
 * 'guard' = any Hold Guard acting in their Hold.
 * 'highBounty' = player who meets/exceeds GUARD_KOID_THRESHOLD in that Hold.
 */
export const KOID_PAIRS: KoidPair[] = [
  {
    a: 'thalmor',
    b: 'stormcloakUnderground',
    description: 'Thalmor Justiciars have standing orders to eliminate Stormcloak agents.',
  },
  {
    a: 'imperialGarrison',
    b: 'stormcloakUnderground',
    description: 'Imperial forces and Stormcloaks are in open conflict.',
  },
  {
    a: 'guard',
    b: 'highBounty',
    description: 'Hold Guards may kill wanted criminals on sight once bounty exceeds the threshold.',
  },
];

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Returns true if factionA has KOID permission against factionB.
 * Relationship is symmetric — if A can kill B, B can kill A.
 */
export function hasKoidPermission(
  factionA: FactionId | 'guard' | 'highBounty',
  factionB: FactionId | 'guard' | 'highBounty',
): boolean {
  return KOID_PAIRS.some(
    (pair) =>
      (pair.a === factionA && pair.b === factionB) ||
      (pair.a === factionB && pair.b === factionA),
  );
}

/**
 * Returns the KOID pair entry for two factions, or null if none exists.
 */
export function getKoidPair(
  factionA: FactionId | 'guard' | 'highBounty',
  factionB: FactionId | 'guard' | 'highBounty',
): KoidPair | null {
  return (
    KOID_PAIRS.find(
      (pair) =>
        (pair.a === factionA && pair.b === factionB) ||
        (pair.a === factionB && pair.b === factionA),
    ) ?? null
  );
}

/**
 * Returns all faction/role identifiers that have KOID permission against a given faction.
 */
export function getKoidTargeters(
  faction: FactionId | 'guard' | 'highBounty',
): Array<FactionId | 'guard' | 'highBounty'> {
  const result: Array<FactionId | 'guard' | 'highBounty'> = [];
  for (const pair of KOID_PAIRS) {
    if (pair.b === faction) result.push(pair.a);
    if (pair.a === faction) result.push(pair.b);
  }
  return result;
}
