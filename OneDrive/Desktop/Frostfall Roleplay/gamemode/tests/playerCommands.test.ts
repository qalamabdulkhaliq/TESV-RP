import { initPlayerCommands } from '../src/playerCommands';
import { dispatchCommand, _clearRegistry } from '../src/commands';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';
import * as college from '../src/college';
import * as training from '../src/training';
import * as economy from '../src/economy';
import * as captivity from '../src/captivity';
import * as factions from '../src/factions';
import * as bountyMod from '../src/bounty';
import { setPlayerRole } from '../src/permissions';

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

function setup() {
  const mp = makeMp({ [0xff000001]: { x: 0, y: 0, z: 0 }, [0xff000002]: { x: 10, y: 0, z: 0 } });
  const store = new PlayerStore();
  const bus = new EventBus();
  store.registerPlayer(1, 0xff000001, 'Lydia');
  store.registerPlayer(2, 0xff000002, 'Farengar');
  initPlayerCommands(mp, store, bus);
  return { mp, store, bus };
}

beforeEach(() => {
  _clearRegistry();
  college._resetLectures();
  training._resetTrainingSessions();
});

// ---------------------------------------------------------------------------
// /lecture
// ---------------------------------------------------------------------------

describe('/lecture start', () => {
  it('calls startLecture and sends success feedback', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(college, 'startLecture');
    dispatchCommand(mp, store, bus, 1, '/lecture start');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Lecture started'));
  });

  it('sends error if already has lecture', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/lecture start');
    mp.sendCustomPacket.mockClear();
    dispatchCommand(mp, store, bus, 1, '/lecture start');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('already'));
  });
});

describe('/lecture join', () => {
  it('calls joinLecture with resolved lecturerId', () => {
    const { mp, store, bus } = setup();
    college.startLecture(mp, store, bus, 1);
    const spy = jest.spyOn(college, 'joinLecture');
    dispatchCommand(mp, store, bus, 2, '/lecture join Lydia');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2, 1);
  });

  it('sends error for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 2, '/lecture join Nobody');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.stringContaining('not found'));
  });
});

describe('/lecture end', () => {
  it('calls endLecture', () => {
    const { mp, store, bus } = setup();
    college.startLecture(mp, store, bus, 1);
    const spy = jest.spyOn(college, 'endLecture');
    dispatchCommand(mp, store, bus, 1, '/lecture end');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1);
  });

  it('sends error when no active lecture', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/lecture end');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('No active'));
  });
});

// ---------------------------------------------------------------------------
// /train
// ---------------------------------------------------------------------------

describe('/train start', () => {
  it('calls startTraining with skill', () => {
    const { mp, store, bus } = setup();
    const spy = jest.spyOn(training, 'startTraining');
    dispatchCommand(mp, store, bus, 1, '/train start destruction');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1, 'destruction');
  });

  it('sends error for unknown skill', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/train start juggling');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Unknown skill'));
  });
});

describe('/train join', () => {
  it('calls joinTraining with resolved trainerId', () => {
    const { mp, store, bus } = setup();
    training.startTraining(mp, store, bus, 1, 'smithing');
    const spy = jest.spyOn(training, 'joinTraining');
    dispatchCommand(mp, store, bus, 2, '/train join Lydia');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2, 1);
  });
});

describe('/train end', () => {
  it('calls endTraining', () => {
    const { mp, store, bus } = setup();
    training.startTraining(mp, store, bus, 1, 'alchemy');
    const spy = jest.spyOn(training, 'endTraining');
    dispatchCommand(mp, store, bus, 1, '/train end');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 1);
  });
});

// ---------------------------------------------------------------------------
// /skill
// ---------------------------------------------------------------------------

describe('/skill', () => {
  it('sends skill summary for all skills', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/skill');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('destruction'));
  });

  it('sends single skill info when skill specified', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/skill smithing');
    const call = (mp.sendCustomPacket as jest.Mock).mock.calls[0];
    const msg = call[1] as string;
    expect(msg).toContain('smithing');
    expect(msg).not.toContain('destruction');
  });

  it('sends error for unknown skill', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/skill juggling');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Unknown skill'));
  });
});

// ---------------------------------------------------------------------------
// /pay
// ---------------------------------------------------------------------------

describe('/pay', () => {
  it('calls transferGold and sends feedback', () => {
    const { mp, store, bus } = setup();
    store.update(1, { septims: 500 });
    const spy = jest.spyOn(economy, 'transferGold');
    dispatchCommand(mp, store, bus, 1, '/pay 100 Farengar');
    expect(spy).toHaveBeenCalledWith(mp, store, 1, 2, 100);
  });

  it('sends error for invalid amount', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/pay abc Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Usage'));
  });

  it('sends error when paying self', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/pay 10 Lydia');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('yourself'));
  });

  it('sends error for unknown player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/pay 10 Nobody');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('not found'));
  });
});

// ---------------------------------------------------------------------------
// /bounty
// ---------------------------------------------------------------------------

describe('/bounty', () => {
  it('reports no active bounties for clean player', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/bounty');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('no active'));
  });
});

// ---------------------------------------------------------------------------
// /capture and /release
// ---------------------------------------------------------------------------

describe('/capture', () => {
  it('sends error when target is not downed', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/capture Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('downed'));
  });

  it('calls capturePlayer when target is downed', () => {
    const { mp, store, bus } = setup();
    store.update(2, { isDown: true });
    const spy = jest.spyOn(captivity, 'capturePlayer');
    dispatchCommand(mp, store, bus, 1, '/capture Farengar');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2, 1);
  });
});

describe('/release', () => {
  it('sends error when target is not captive', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/release Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('not captive'));
  });

  it('calls releasePlayer when target is captive', () => {
    const { mp, store, bus } = setup();
    store.update(2, { isCaptive: true });
    const spy = jest.spyOn(captivity, 'releasePlayer');
    dispatchCommand(mp, store, bus, 1, '/release Farengar');
    expect(spy).toHaveBeenCalledWith(mp, store, bus, 2);
  });
});

// ---------------------------------------------------------------------------
// /property
// ---------------------------------------------------------------------------

describe('/property list', () => {
  it('sends error when holdId is null', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/property list');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('not assigned'));
  });

  it('lists available properties when hold is set', () => {
    const { mp, store, bus } = setup();
    store.update(1, { holdId: 'whiterun' });
    dispatchCommand(mp, store, bus, 1, '/property list');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('whiterun'));
  });
});

describe('/property request', () => {
  it('sends error when no propertyId given', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/property request');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Usage'));
  });
});

// ---------------------------------------------------------------------------
// /hold
// ---------------------------------------------------------------------------

describe('/hold (status)', () => {
  it('reports none when no hold assigned', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/hold');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('none'));
  });

  it('reports current hold when assigned', () => {
    const { mp, store, bus } = setup();
    store.update(1, { holdId: 'whiterun' });
    dispatchCommand(mp, store, bus, 1, '/hold');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('whiterun'));
  });
});

describe('/hold join', () => {
  it('assigns hold and persists it', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/hold join whiterun');
    expect(store.get(1)?.holdId).toBe('whiterun');
    expect(mp.set).toHaveBeenCalledWith(1, 'ff_holdId', 'whiterun');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('whiterun'));
  });

  it('rejects unknown holdId', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/hold join gondor');
    expect(store.get(1)?.holdId).toBeNull();
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });

  it('dispatches holdAssigned event', () => {
    const { mp, store, bus } = setup();
    let fired = false;
    bus.on('holdAssigned', () => { fired = true; });
    dispatchCommand(mp, store, bus, 1, '/hold join eastmarch');
    expect(fired).toBe(true);
  });
});

describe('/hold leave', () => {
  it('clears hold and persists null', () => {
    const { mp, store, bus } = setup();
    store.update(1, { holdId: 'whiterun' });
    dispatchCommand(mp, store, bus, 1, '/hold leave');
    expect(store.get(1)?.holdId).toBeNull();
    expect(mp.set).toHaveBeenCalledWith(1, 'ff_holdId', null);
  });

  it('sends error when not in a hold', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/hold leave');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});

// ---------------------------------------------------------------------------
// /status
// ---------------------------------------------------------------------------

describe('/status', () => {
  it('shows hold as none when unassigned', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/status');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Hold: none'));
  });

  it('shows assigned hold', () => {
    const { mp, store, bus } = setup();
    store.update(1, { holdId: 'whiterun' });
    dispatchCommand(mp, store, bus, 1, '/status');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Hold: whiterun'));
  });

  it('shows hunger and drunk levels', () => {
    const { mp, store, bus } = setup();
    store.update(1, { hungerLevel: 7, drunkLevel: 3 });
    dispatchCommand(mp, store, bus, 1, '/status');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('7/10'));
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('3/10'));
  });

  it('shows faction memberships', () => {
    const { mp, store, bus } = setup();
    factions.joinFaction(mp, store, bus, 1, 'companions');
    dispatchCommand(mp, store, bus, 1, '/status');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('companions'));
  });

  it('shows bounties when present', () => {
    const { mp, store, bus } = setup();
    store.update(1, { bounty: { whiterun: 250 } });
    dispatchCommand(mp, store, bus, 1, '/status');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('whiterun: 250'));
  });

  it('shows none for bounties when clear', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/status');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Bounties: none'));
  });
});

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------

describe('/help', () => {
  it('returns a list of commands the player can use', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/help');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('/status'));
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('/help'));
  });

  it('lists multiple known commands', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/help');
    const msg = (mp.sendCustomPacket as jest.Mock).mock.calls
      .filter((c: unknown[]) => c[0] === 1).map((c: unknown[]) => c[1] as string).join('');
    expect(msg).toContain('/skill');
    expect(msg).toContain('/pay');
    expect(msg).toContain('/examine');
  });
});

// ---------------------------------------------------------------------------
// /examine
// ---------------------------------------------------------------------------

describe('/examine', () => {
  it('shows target name and hold', () => {
    const { mp, store, bus } = setup();
    store.update(2, { holdId: 'rift' });
    dispatchCommand(mp, store, bus, 1, '/examine Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('Farengar'));
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('rift'));
  });

  it('shows target faction memberships', () => {
    const { mp, store, bus } = setup();
    factions.joinFaction(mp, store, bus, 2, 'bardsCollege');
    dispatchCommand(mp, store, bus, 1, '/examine Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('bardsCollege'));
  });

  it('shows target active bounties', () => {
    const { mp, store, bus } = setup();
    store.update(2, { bounty: { haafingar: 400 } });
    dispatchCommand(mp, store, bus, 1, '/examine Farengar');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('haafingar: 400'));
  });

  it('sends error for unknown player name', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/examine Ulfric');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.stringContaining('"success":false'));
  });
});
