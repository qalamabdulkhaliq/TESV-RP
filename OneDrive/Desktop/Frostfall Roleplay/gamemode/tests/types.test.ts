import type { HoldId, PlayerState, Property, Inventory } from '../src/types';
import { ALL_HOLDS, GOLD_BASE_ID } from '../src/types';

describe('shared types', () => {
  it('ALL_HOLDS covers all nine holds', () => {
    const expected: HoldId[] = [
      'whiterun', 'eastmarch', 'rift', 'reach', 'haafingar',
      'pale', 'falkreath', 'hjaalmarch', 'winterhold',
    ];
    expect(ALL_HOLDS).toEqual(expected);
    expect(ALL_HOLDS).toHaveLength(9);
  });

  it('GOLD_BASE_ID matches Skyrim gold form ID', () => {
    expect(GOLD_BASE_ID).toBe(0xf);
  });

  it('PlayerState type has required fields', () => {
    const state: PlayerState = {
      id: 1,
      actorId: 0xff000001,
      name: 'Thorald',
      holdId: 'whiterun',
      factions: [],
      bounty: {},
      isDown: false,
      isCaptive: false,
      downedAt: null,
      captiveAt: null,
      properties: [],
      hungerLevel: 10,
      drunkLevel: 0,
      septims: 0,
      stipendPaidHours: 0,
      minutesOnline: 0,
    };
    expect(state.holdId).toBe('whiterun');
    expect(state.hungerLevel).toBe(10);
  });

  it('Property type has required fields', () => {
    const prop: Property = {
      id: 'whiterun-breezehome',
      holdId: 'whiterun',
      ownerId: null,
      type: 'home',
      pendingRequestBy: null,
      pendingRequestAt: null,
    };
    expect(prop.type).toBe('home');
  });

  it('Inventory matches SkyMP built-in format', () => {
    const inv: Inventory = {
      entries: [
        { baseId: GOLD_BASE_ID, count: 500 },
        { baseId: 0x12eb7, count: 1, worn: true },
      ],
    };
    expect(inv.entries[0].baseId).toBe(GOLD_BASE_ID);
    expect(inv.entries[0].count).toBe(500);
  });
});
