import {
  getHoldResources,
  getResourceHold,
  isHoldExclusive,
  HOLD_RESOURCES,
} from '../src/resources';
import { ALL_HOLDS } from '../src/types';

describe('HOLD_RESOURCES', () => {
  it('every resource has a valid holdId', () => {
    for (const r of HOLD_RESOURCES) {
      expect(ALL_HOLDS).toContain(r.holdId);
    }
  });

  it('every hold has at least one resource', () => {
    for (const hold of ALL_HOLDS) {
      expect(getHoldResources(hold).length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate base IDs', () => {
    const ids = HOLD_RESOURCES.map((r) => r.baseId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getHoldResources', () => {
  it('returns only resources for the given hold', () => {
    const resources = getHoldResources('pale');
    expect(resources.length).toBeGreaterThan(0);
    expect(resources.every((r) => r.holdId === 'pale')).toBe(true);
  });
});

describe('getResourceHold', () => {
  it('returns the correct hold for a known resource', () => {
    const pale = HOLD_RESOURCES.find((r) => r.holdId === 'pale')!;
    expect(getResourceHold(pale.baseId)).toBe('pale');
  });

  it('returns null for a non-exclusive item', () => {
    expect(getResourceHold(0x0000000f)).toBeNull(); // gold
  });
});

describe('isHoldExclusive', () => {
  it('returns true for hold-exclusive items', () => {
    const resource = HOLD_RESOURCES[0];
    expect(isHoldExclusive(resource.baseId)).toBe(true);
  });

  it('returns false for non-exclusive items', () => {
    expect(isHoldExclusive(0x0000000f)).toBe(false); // gold
    expect(isHoldExclusive(0x00013926)).toBe(false); // iron sword
  });
});
