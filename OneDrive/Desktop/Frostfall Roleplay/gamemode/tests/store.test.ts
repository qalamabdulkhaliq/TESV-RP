import { PlayerStore } from '../src/store';

describe('PlayerStore', () => {
  let store: PlayerStore;

  beforeEach(() => {
    store = new PlayerStore();
  });

  it('creates a fresh default state on registerPlayer', () => {
    const state = store.registerPlayer(1, 0xff000001, 'Thorald');
    expect(state.name).toBe('Thorald');
    expect(state.actorId).toBe(0xff000001);
    expect(state.hungerLevel).toBe(10);
    expect(state.drunkLevel).toBe(0);
    expect(state.isDown).toBe(false);
    expect(state.factions).toEqual([]);
    expect(state.bounty).toEqual({});
  });

  it('returns null for an unknown player', () => {
    expect(store.get(99)).toBeNull();
  });

  it('returns the registered player', () => {
    store.registerPlayer(1, 0xff000001, 'Thorald');
    expect(store.get(1)).not.toBeNull();
    expect(store.get(1)!.name).toBe('Thorald');
  });

  it('updates only the patched fields', () => {
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.update(1, { hungerLevel: 7 });
    const state = store.get(1)!;
    expect(state.hungerLevel).toBe(7);
    expect(state.name).toBe('Thorald'); // unchanged
  });

  it('returns the updated state from update()', () => {
    store.registerPlayer(1, 0xff000001, 'Thorald');
    const updated = store.update(1, { septims: 200 });
    expect(updated.septims).toBe(200);
  });

  it('throws when updating an unknown player', () => {
    expect(() => store.update(99, { hungerLevel: 5 })).toThrow('not in store');
  });

  it('removes the player on deregister', () => {
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.deregisterPlayer(1);
    expect(store.get(1)).toBeNull();
  });

  it('returns all registered players', () => {
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.registerPlayer(2, 0xff000002, 'Valdis');
    expect(store.getAll()).toHaveLength(2);
  });
});
