import {
  parseMessage,
  resolvePlayer,
  sendFeedback,
  dispatchCommand,
  registerCommand,
  _clearRegistry,
} from '../src/commands';
import { setPlayerRole } from '../src/permissions';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

function makeMp(): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((id: number, key: string) => storage[`${id}:${key}`]),
    set: jest.fn((id: number, key: string, val: unknown) => { storage[`${id}:${key}`] = val; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

function setup() {
  const mp = makeMp();
  const store = new PlayerStore();
  const bus = new EventBus();
  store.registerPlayer(1, 1, 'Lydia');
  store.registerPlayer(2, 0xff000002, 'Farengar');
  return { mp, store, bus };
}

beforeEach(() => _clearRegistry());

// ---------------------------------------------------------------------------
// parseMessage
// ---------------------------------------------------------------------------

describe('parseMessage', () => {
  it('returns null for non-command messages', () => {
    expect(parseMessage('hello there')).toBeNull();
    expect(parseMessage('')).toBeNull();
  });
  it('parses command with no args', () => {
    expect(parseMessage('/bounty')).toEqual({ command: 'bounty', args: [] });
  });
  it('parses command with args', () => {
    expect(parseMessage('/pay 100 Farengar')).toEqual({ command: 'pay', args: ['100', 'Farengar'] });
  });
  it('lowercases the command', () => {
    expect(parseMessage('/BOUNTY')).toEqual({ command: 'bounty', args: [] });
  });
  it('handles extra whitespace', () => {
    expect(parseMessage('/pay  100  Farengar')).toEqual({ command: 'pay', args: ['100', 'Farengar'] });
  });
});

// ---------------------------------------------------------------------------
// resolvePlayer
// ---------------------------------------------------------------------------

describe('resolvePlayer', () => {
  it('returns null for unknown name', () => {
    const { store } = setup();
    expect(resolvePlayer(store, 'Nobody')).toBeNull();
  });
  it('returns playerId for matching name', () => {
    const { store } = setup();
    expect(resolvePlayer(store, 'Lydia')).toBe(1);
  });
  it('is case-insensitive', () => {
    const { store } = setup();
    expect(resolvePlayer(store, 'lydia')).toBe(1);
  });
  it('returns null for empty string', () => {
    const { store } = setup();
    expect(resolvePlayer(store, '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — routing
// ---------------------------------------------------------------------------

describe('dispatchCommand', () => {
  it('does nothing for non-command message', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('test', 'player', handler);
    dispatchCommand(mp, store, bus, 1, 'just talking');
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler for registered command', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('greet', 'player', handler);
    dispatchCommand(mp, store, bus, 1, '/greet');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ playerId: 1, args: [] }));
  });

  it('sends feedback for unknown command', () => {
    const { mp, store, bus } = setup();
    dispatchCommand(mp, store, bus, 1, '/unknown');
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(
      1,
      expect.stringContaining('Unknown command'),
    );
  });

  it('sends permission-denied feedback when role insufficient', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('staffcmd', 'staff', handler);
    dispatchCommand(mp, store, bus, 1, '/staffcmd');
    expect(handler).not.toHaveBeenCalled();
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(
      1,
      expect.stringContaining('permission'),
    );
  });

  it('passes through for sufficient role', () => {
    const { mp, store, bus } = setup();
    setPlayerRole(mp, 1, 'staff');
    const handler = jest.fn();
    registerCommand('staffcmd', 'staff', handler);
    dispatchCommand(mp, store, bus, 1, '/staffcmd');
    expect(handler).toHaveBeenCalled();
  });

  it('passes args to handler', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    registerCommand('echo', 'player', handler);
    dispatchCommand(mp, store, bus, 1, '/echo hello world');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ args: ['hello', 'world'] }));
  });
});
