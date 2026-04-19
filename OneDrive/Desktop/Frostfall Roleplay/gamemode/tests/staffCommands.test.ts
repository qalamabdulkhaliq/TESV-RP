import { initPlayerCommands } from '../src/playerCommands';
import { initStaffCommands } from '../src/staffCommands';
import { dispatchCommand, _clearRegistry } from '../src/commands';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';
import { setPlayerRole } from '../src/permissions';
import * as prison from '../src/prison';
import * as combat from '../src/combat';
import * as factions from '../src/factions';
import * as housing from '../src/housing';
import * as treasury from '../src/treasury';
import * as bountyMod from '../src/bounty';
import * as college from '../src/college';
import * as training from '../src/training';

function makeMp(positions: Record<number, { x: number; y: number; z: number }> = {}): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((actorId: number, key: string) => {
      if (key === 'pos') return positions[actorId] ?? null;
      return storage[`${actorId}:${key}`];
    }),
    set: jest.fn((actorId: number, key: string, value: unknown) => { storage[`${actorId}:${key}`] = value; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

// playerId 1 = leader, 2 = staff, 3 = target player
function setup() {
  const mp = makeMp({
    [0xff000001]: { x: 0, y: 0, z: 0 },
    [0xff000002]: { x: 0, y: 0, z: 0 },
    [0xff000003]: { x: 0, y: 0, z: 0 },
  });
  const store = new PlayerStore();
  const bus = new EventBus();
  store.registerPlayer(1, 0xff000001, 'Jorrvaskr');
  store.registerPlayer(2, 0xff000002, 'Arcadia');
  store.registerPlayer(3, 0xff000003, 'Hadvar');
  setPlayerRole(mp, 1, 'leader');
  setPlayerRole(mp, 2, 'staff');
  initPlayerCommands(mp, store, bus);
  initStaffCommands(mp, store, bus);
  return { mp, store, bus };
}

beforeEach(() => {
  _clearRegistry();
  college._resetLectures();
  training._resetTrainingSessions();
  housing._resetProperties();
});

// ---------------------------------------------------------------------------
// /arrest
// ---------------------------------------------------------------------------

describe('/arrest', () => {
  it('queues target for sentencing', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(prison, 'queueForSentencing');
    dispatchCommand(mp, store, bus, 1, '/arrest Hadvar whiterun');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 'whiterun', 1, 1);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('queued'));
  });

  it('sends failure feedback for unknown player name', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/arrest Ulfric whiterun');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });

  it('sends failure feedback for unknown holdId', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/arrest Hadvar gondor');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /sentence
// ---------------------------------------------------------------------------

describe('/sentence', () => {
  function arrestHadvar(mp: any, store: PlayerStore, bus: EventBus) {
    prison.queueForSentencing(mp, store, bus, 3, 'whiterun', 1, 1);
  }

  it('sentences with fine', () => {
    const { mp, store, bus } = setup();
    arrestHadvar(mp, store, bus);
    const spy = jest.spyOn(prison, 'sentencePlayer');
    dispatchCommand(mp, store, bus, 1, '/sentence Hadvar fine 500');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 1, { type: 'fine', fineAmount: 500 });
  });

  it('sentences with release', () => {
    const { mp, store, bus } = setup();
    arrestHadvar(mp, store, bus);
    const spy = jest.spyOn(prison, 'sentencePlayer');
    dispatchCommand(mp, store, bus, 1, '/sentence Hadvar release');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 1, { type: 'release', fineAmount: undefined });
  });

  it('sentences with banish', () => {
    const { mp, store, bus } = setup();
    arrestHadvar(mp, store, bus);
    const spy = jest.spyOn(prison, 'sentencePlayer');
    dispatchCommand(mp, store, bus, 1, '/sentence Hadvar banish');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 1, { type: 'banish', fineAmount: undefined });
  });

  it('sends failure when player not in queue', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/sentence Hadvar release');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });

  it('sends failure for invalid sentence type', () => {
    const { mp, store, bus } = setup();
    arrestHadvar(mp, store, bus);
    dispatchCommand(mp, store, bus, 1, '/sentence Hadvar execute');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });

  it('requires amount for fine type', () => {
    const { mp, store, bus } = setup();
    arrestHadvar(mp, store, bus);
    dispatchCommand(mp, store, bus, 1, '/sentence Hadvar fine');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /down and /rise
// ---------------------------------------------------------------------------

describe('/down', () => {
  it('downs the target player', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(combat, 'downPlayer');
    dispatchCommand(mp, store, bus, 1, '/down Hadvar');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 1);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('downed'));
  });

  it('sends failure if target is already downed', () => {
    const { mp, store, bus } = setup();
    combat.downPlayer(mp, store, bus, 3, 1);
    dispatchCommand(mp, store, bus, 1, '/down Hadvar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });

  it('sends failure for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/down Ulfric');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

describe('/rise', () => {
  it('rises a downed player', () => {
    const { mp, store, bus } = setup();
    combat.downPlayer(mp, store, bus, 3, 1);
    const spy = jest.spyOn(combat, 'risePlayer');
    dispatchCommand(mp, store, bus, 1, '/rise Hadvar');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('risen'));
  });

  it('sends failure if target is not downed', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/rise Hadvar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /role set
// ---------------------------------------------------------------------------

describe('/role set', () => {
  it('sets target role to leader', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/role set Hadvar leader');
    expect(mp.set).toHaveBeenCalledWith(3, 'ff_role', 'leader');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('leader'));
  });

  it('sends failure for invalid role string', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/role set Hadvar emperor');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });

  it('sends failure for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/role set Ulfric staff');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /bounty add and /bounty clear (staff sub-commands, handled in playerCommands)
// ---------------------------------------------------------------------------

describe('/bounty add', () => {
  it('adds bounty for a player', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(bountyMod, 'addBounty');
    dispatchCommand(mp, store, bus, 2, '/bounty add Hadvar whiterun 500');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 'whiterun', 500);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure for non-numeric amount', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/bounty add Hadvar whiterun gold');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });

  it('sends failure for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/bounty add Ulfric whiterun 500');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });

  it('rejects if caller is a plain player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 3, '/bounty add Jorrvaskr whiterun 500');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(3, expect.stringContaining('"success":false'));
  });
});

describe('/bounty clear', () => {
  it('clears bounty', () => {
    const { mp, store, bus } = setup();
    bountyMod.addBounty(mp, store, bus, 3, 'rift', 200);
    const spy = jest.spyOn(bountyMod, 'clearBounty');
    dispatchCommand(mp, store, bus, 2, '/bounty clear Hadvar rift');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 'rift');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/bounty clear Ulfric rift');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /property staff sub-commands
// ---------------------------------------------------------------------------

describe('/property approve', () => {
  it('approves a pending property request', () => {
    const { mp, store, bus } = setup();
    // Manually create a pending request
    housing.requestProperty(mp, store, bus, 3, 'whiterun-breezehome', 0);
    const spy = jest.spyOn(housing, 'approveProperty');
    dispatchCommand(mp, store, bus, 2, '/property approve whiterun-breezehome');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 'whiterun-breezehome', 2);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure when no pending request', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/property approve whiterun-breezehome');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

describe('/property deny', () => {
  it('denies a pending property request', () => {
    const { mp, store, bus } = setup();
    housing.requestProperty(mp, store, bus, 3, 'whiterun-breezehome', 0);
    const spy = jest.spyOn(housing, 'denyProperty');
    dispatchCommand(mp, store, bus, 2, '/property deny whiterun-breezehome');
    expect(spy).toHaveBeenCalledWith(mp, 'whiterun-breezehome');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure when no pending request', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/property deny whiterun-breezehome');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

describe('/property summon', () => {
  it('summons the requesting player for a hearing', () => {
    const { mp, store, bus } = setup();
    housing.requestProperty(mp, store, bus, 3, 'whiterun-breezehome', 0);
    const spy = jest.spyOn(housing, 'summonProperty');
    dispatchCommand(mp, store, bus, 2, '/property summon whiterun-breezehome');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 'whiterun-breezehome', 2);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure when no pending request', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/property summon whiterun-breezehome');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

describe('/property setprice', () => {
  it('sets property price', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(housing, 'setPropertyPrice');
    dispatchCommand(mp, store, bus, 2, '/property setprice whiterun-breezehome 5000');
    expect(spy).toHaveBeenCalledWith(mp, 'whiterun-breezehome', 5000);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure for non-numeric price', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/property setprice whiterun-breezehome gold');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /faction
// ---------------------------------------------------------------------------

describe('/faction add', () => {
  it('adds player to faction', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(factions, 'joinFaction');
    dispatchCommand(mp, store, bus, 2, '/faction add Hadvar companions');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 'companions');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure if already a member', () => {
    const { mp, store, bus } = setup();
    factions.joinFaction(mp, store, bus, 3, 'companions');
    dispatchCommand(mp, store, bus, 2, '/faction add Hadvar companions');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });

  it('sends failure for unknown faction', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/faction add Hadvar darkBrotherhood');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

describe('/faction remove', () => {
  it('removes player from faction', () => {
    const { mp, store, bus } = setup();
    factions.joinFaction(mp, store, bus, 3, 'companions');
    const spy = jest.spyOn(factions, 'leaveFaction');
    dispatchCommand(mp, store, bus, 2, '/faction remove Hadvar companions');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 'companions');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure if not a member', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/faction remove Hadvar companions');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

describe('/faction rank', () => {
  it('updates rank for faction member', () => {
    const { mp, store, bus } = setup();
    factions.joinFaction(mp, store, bus, 3, 'companions');
    const spy = jest.spyOn(factions, 'setFactionRank');
    dispatchCommand(mp, store, bus, 2, '/faction rank Hadvar companions 3');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 3, 'companions', 3);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":true'));
  });

  it('sends failure if not a member', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/faction rank Hadvar companions 3');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });

  it('sends failure for non-numeric rank', () => {
    const { mp, store, bus } = setup();
    factions.joinFaction(mp, store, bus, 3, 'companions');
    dispatchCommand(mp, store, bus, 2, '/faction rank Hadvar companions high');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /treasury
// ---------------------------------------------------------------------------

describe('/treasury view', () => {
  it('shows balance for a specified hold', () => {
    const { mp, store, bus } = setup();
    treasury.depositToTreasury(mp, bus, 'whiterun', 1500);
    dispatchCommand(mp, store, bus, 1, '/treasury view whiterun');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('1500'));
  });

  it('shows all balances when no hold specified', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/treasury view');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('whiterun'));
  });

  it('sends failure for unknown hold', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/treasury view gondor');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

describe('/treasury deposit', () => {
  it('deposits into hold treasury', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(treasury, 'depositToTreasury');
    dispatchCommand(mp, store, bus, 1, '/treasury deposit eastmarch 800');
    expect(spy).toHaveBeenCalledWith(mp, bus, 'eastmarch', 800);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Deposited'));
  });

  it('sends failure for non-numeric amount', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/treasury deposit eastmarch many');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

describe('/treasury withdraw', () => {
  it('withdraws from hold treasury when funds are sufficient', () => {
    const { mp, store, bus } = setup();
    treasury.depositToTreasury(mp, bus, 'rift', 1000);
    const spy = jest.spyOn(treasury, 'withdrawFromTreasury');
    dispatchCommand(mp, store, bus, 1, '/treasury withdraw rift 300');
    expect(spy).toHaveBeenCalledWith(mp, bus, 'rift', 300);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Withdrew'));
  });

  it('sends failure when insufficient funds', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/treasury withdraw rift 9999');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /help role filtering (staff setup has both player and staff commands registered)
// ---------------------------------------------------------------------------

describe('/help role filtering', () => {
  it('staff sees more commands than a plain player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/help'); // staff (player 2)
    dispatchCommand(mp, store, bus, 3, '/help'); // plain player (player 3)
    const staffMsg = (mp.sendCustomPacket as jest.Mock).mock.calls
      .filter((c: unknown[]) => c[0] === 2).map((c: unknown[]) => c[1] as string).join('');
    const playerMsg = (mp.sendCustomPacket as jest.Mock).mock.calls
      .filter((c: unknown[]) => c[0] === 3).map((c: unknown[]) => c[1] as string).join('');
    expect(staffMsg.length).toBeGreaterThan(playerMsg.length);
  });
});

// ---------------------------------------------------------------------------
// /hold set (staff-gated sub-command of /hold)
// ---------------------------------------------------------------------------

describe('/hold set', () => {
  it('assigns target player to a hold and persists', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/hold set Hadvar whiterun');
    expect(store.get(3)?.holdId).toBe('whiterun');
    expect(mp.set).toHaveBeenCalledWith(3, 'ff_holdId', 'whiterun');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('whiterun'));
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(3, expect.stringContaining('whiterun'));
  });

  it('dispatches holdAssigned event', () => {
    const { mp, store, bus } = setup();
    let fired = false;
    bus.on('holdAssigned', () => { fired = true; });
    dispatchCommand(mp, store, bus, 2, '/hold set Hadvar rift');
    expect(fired).toBe(true);
  });

  it('sends failure for unknown hold', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/hold set Hadvar gondor');
    expect(store.get(3)?.holdId).toBeNull();
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });

  it('sends failure for unknown player name', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/hold set Ulfric whiterun');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('"success":false'));
  });

  it('rejects if caller is a plain player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 3, '/hold set Jorrvaskr whiterun');
    expect(store.get(1)?.holdId).toBeNull();
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(3, expect.stringContaining('"success":false'));
  });
});
