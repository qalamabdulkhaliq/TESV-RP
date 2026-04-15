import {
  KOID_PAIRS,
  hasKoidPermission,
  getKoidPair,
  getKoidTargeters,
} from '../src/koid';

describe('KOID_PAIRS registry', () => {
  it('has at least 3 entries', () => {
    expect(KOID_PAIRS.length).toBeGreaterThanOrEqual(3);
  });

  it('every pair has a non-empty description', () => {
    for (const pair of KOID_PAIRS) {
      expect(pair.description.length).toBeGreaterThan(0);
    }
  });
});

describe('hasKoidPermission', () => {
  it('thalmor can kill stormcloakUnderground', () => {
    expect(hasKoidPermission('thalmor', 'stormcloakUnderground')).toBe(true);
  });

  it('stormcloakUnderground can kill thalmor (symmetric)', () => {
    expect(hasKoidPermission('stormcloakUnderground', 'thalmor')).toBe(true);
  });

  it('imperialGarrison can kill stormcloakUnderground', () => {
    expect(hasKoidPermission('imperialGarrison', 'stormcloakUnderground')).toBe(true);
  });

  it('guard can kill highBounty', () => {
    expect(hasKoidPermission('guard', 'highBounty')).toBe(true);
  });

  it('returns false for unrelated factions', () => {
    expect(hasKoidPermission('companions', 'thievesGuild')).toBe(false);
  });

  it('returns false for faction against itself', () => {
    expect(hasKoidPermission('thalmor', 'thalmor')).toBe(false);
  });
});

describe('getKoidPair', () => {
  it('returns pair for valid combination', () => {
    const pair = getKoidPair('thalmor', 'stormcloakUnderground');
    expect(pair).not.toBeNull();
    expect(pair!.description.length).toBeGreaterThan(0);
  });

  it('returns pair in reverse order', () => {
    const pair = getKoidPair('stormcloakUnderground', 'thalmor');
    expect(pair).not.toBeNull();
  });

  it('returns null for non-KOID factions', () => {
    expect(getKoidPair('companions', 'bardsCollege')).toBeNull();
  });
});

describe('getKoidTargeters', () => {
  it('returns factions that can target stormcloakUnderground', () => {
    const targeters = getKoidTargeters('stormcloakUnderground');
    expect(targeters).toContain('thalmor');
    expect(targeters).toContain('imperialGarrison');
  });

  it('returns empty for faction with no KOID relationships', () => {
    expect(getKoidTargeters('companions')).toHaveLength(0);
  });
});
