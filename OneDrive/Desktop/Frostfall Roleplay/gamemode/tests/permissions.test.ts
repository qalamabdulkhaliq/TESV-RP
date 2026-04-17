import { getPlayerRole, setPlayerRole, hasPermission } from '../src/permissions';

function makeMp(): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((id: number, key: string) => storage[`${id}:${key}`]),
    set: jest.fn((id: number, key: string, val: unknown) => { storage[`${id}:${key}`] = val; }),
  };
}

describe('getPlayerRole', () => {
  it('returns player by default when no role set', () => {
    const mp = makeMp();
    expect(getPlayerRole(mp, 1)).toBe('player');
  });
  it('returns stored role', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'staff');
    expect(getPlayerRole(mp, 1)).toBe('staff');
  });
});

describe('setPlayerRole', () => {
  it('persists role via mp.set', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'leader');
    expect(mp.set).toHaveBeenCalledWith(1, 'ff_role', 'leader');
  });
});

describe('hasPermission', () => {
  it('player passes player-level check', () => {
    const mp = makeMp();
    expect(hasPermission(mp, 1, 'player')).toBe(true);
  });
  it('player fails leader-level check', () => {
    const mp = makeMp();
    expect(hasPermission(mp, 1, 'leader')).toBe(false);
  });
  it('leader passes leader-level check', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'leader');
    expect(hasPermission(mp, 1, 'leader')).toBe(true);
  });
  it('leader fails staff-level check', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'leader');
    expect(hasPermission(mp, 1, 'staff')).toBe(false);
  });
  it('staff passes all levels', () => {
    const mp = makeMp();
    setPlayerRole(mp, 1, 'staff');
    expect(hasPermission(mp, 1, 'player')).toBe(true);
    expect(hasPermission(mp, 1, 'leader')).toBe(true);
    expect(hasPermission(mp, 1, 'staff')).toBe(true);
  });
});
