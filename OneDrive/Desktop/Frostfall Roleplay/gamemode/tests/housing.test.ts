import {
  getProperty,
  getPropertiesByHold,
  getOwnedProperties,
  isAvailable,
  requestProperty,
  approveProperty,
  denyProperty,
  revokeProperty,
  PROPERTY_REGISTRY,
  _resetProperties,
} from '../src/housing';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

function makeMp(): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((actorId: number, key: string) => storage[`${actorId}:${key}`]),
    set: jest.fn((actorId: number, key: string, value: unknown) => { storage[`${actorId}:${key}`] = value; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

beforeEach(() => _resetProperties());

// ---------------------------------------------------------------------------
// Registry integrity
// ---------------------------------------------------------------------------

describe('PROPERTY_REGISTRY', () => {
  it('has no duplicate property IDs', () => {
    const ids = PROPERTY_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all properties start unowned with no pending requests', () => {
    for (const p of PROPERTY_REGISTRY) {
      expect(p.ownerId).toBeNull();
      expect(p.pendingRequestBy).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

describe('getProperty', () => {
  it('returns property by id', () => {
    const p = getProperty('whiterun-breezehome');
    expect(p).not.toBeNull();
    expect(p!.holdId).toBe('whiterun');
  });

  it('returns null for unknown id', () => {
    expect(getProperty('fake-property')).toBeNull();
  });
});

describe('getPropertiesByHold', () => {
  it('returns only properties for the given hold', () => {
    const props = getPropertiesByHold('whiterun');
    expect(props.length).toBeGreaterThan(0);
    expect(props.every((p) => p.holdId === 'whiterun')).toBe(true);
  });
});

describe('isAvailable', () => {
  it('returns true for unowned properties with no pending request', () => {
    expect(isAvailable('whiterun-breezehome')).toBe(true);
  });

  it('returns false for unknown properties', () => {
    expect(isAvailable('fake-id')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requestProperty
// ---------------------------------------------------------------------------

describe('requestProperty', () => {
  let store: PlayerStore;
  let bus: EventBus;
  let mp: any;

  beforeEach(() => {
    store = new PlayerStore();
    bus = new EventBus();
    mp = makeMp();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.registerPlayer(10, 0xff00000a, 'Steward');
  });

  it('returns true and marks property as pending', () => {
    const result = requestProperty(mp, store, bus, 1, 'whiterun-breezehome', 10);
    expect(result).toBe(true);
    expect(isAvailable('whiterun-breezehome')).toBe(false);
    expect(getProperty('whiterun-breezehome')!.pendingRequestBy).toBe(1);
  });

  it('dispatches propertyRequested event', () => {
    const handler = jest.fn();
    bus.on('propertyRequested', handler);
    requestProperty(mp, store, bus, 1, 'whiterun-breezehome', 10);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sends courier notification to steward', () => {
    requestProperty(mp, store, bus, 1, 'whiterun-breezehome', 10);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(10, expect.any(String));
  });

  it('returns false for unknown property', () => {
    expect(requestProperty(mp, store, bus, 1, 'fake-id', 10)).toBe(false);
  });

  it('returns false when property already has pending request', () => {
    requestProperty(mp, store, bus, 1, 'whiterun-breezehome', 10);
    store.registerPlayer(2, 0xff000002, 'Valdis');
    expect(requestProperty(mp, store, bus, 2, 'whiterun-breezehome', 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// approveProperty
// ---------------------------------------------------------------------------

describe('approveProperty', () => {
  let store: PlayerStore;
  let bus: EventBus;
  let mp: any;

  beforeEach(() => {
    store = new PlayerStore();
    bus = new EventBus();
    mp = makeMp();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.registerPlayer(10, 0xff00000a, 'Steward');
    requestProperty(mp, store, bus, 1, 'whiterun-breezehome', 10);
  });

  it('transfers ownership to requesting player', () => {
    approveProperty(mp, store, bus, 'whiterun-breezehome', 10);
    expect(getProperty('whiterun-breezehome')!.ownerId).toBe(1);
    expect(getProperty('whiterun-breezehome')!.pendingRequestBy).toBeNull();
  });

  it('adds property to owner state', () => {
    approveProperty(mp, store, bus, 'whiterun-breezehome', 10);
    expect(store.get(1)!.properties).toContain('whiterun-breezehome');
  });

  it('dispatches propertyApproved event', () => {
    const handler = jest.fn();
    bus.on('propertyApproved', handler);
    approveProperty(mp, store, bus, 'whiterun-breezehome', 10);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.newOwnerId).toBe(1);
  });

  it('returns false with no pending request', () => {
    approveProperty(mp, store, bus, 'whiterun-breezehome', 10);
    expect(approveProperty(mp, store, bus, 'whiterun-breezehome', 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// denyProperty + revokeProperty
// ---------------------------------------------------------------------------

describe('denyProperty', () => {
  it('clears pending request without assigning ownership', () => {
    const store = new PlayerStore();
    const bus = new EventBus();
    const mp = makeMp();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.registerPlayer(10, 0xff00000a, 'Steward');
    requestProperty(mp, store, bus, 1, 'whiterun-breezehome', 10);
    denyProperty(mp, 'whiterun-breezehome');
    expect(getProperty('whiterun-breezehome')!.ownerId).toBeNull();
    expect(isAvailable('whiterun-breezehome')).toBe(true);
  });
});

describe('revokeProperty', () => {
  it('removes ownership and clears from player state', () => {
    const store = new PlayerStore();
    const bus = new EventBus();
    const mp = makeMp();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.registerPlayer(10, 0xff00000a, 'Steward');
    requestProperty(mp, store, bus, 1, 'whiterun-breezehome', 10);
    approveProperty(mp, store, bus, 'whiterun-breezehome', 10);
    revokeProperty(mp, store, 'whiterun-breezehome');
    expect(getProperty('whiterun-breezehome')!.ownerId).toBeNull();
    expect(store.get(1)!.properties).not.toContain('whiterun-breezehome');
  });
});
