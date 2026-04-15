import {
  createNotification,
  filterExpired,
  getUnread,
  getPendingNotifications,
  markRead,
  sendNotification,
} from '../src/courier';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';
import type { CourierNotification } from '../src/courier';

function makeMp() {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((actorId: number, key: string) => storage[`${actorId}:${key}`]),
    set: jest.fn((actorId: number, key: string, value: unknown) => { storage[`${actorId}:${key}`] = value; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  } as unknown as import('../src/skymp').Mp;
}

const NOW = Date.now();
const FUTURE = NOW + 1_000_000;
const PAST = NOW - 1;

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------

describe('createNotification', () => {
  it('creates a notification with correct fields', () => {
    const n = createNotification('propertyRequest', 1, 2, 'whiterun', { propertyId: 'whiterun-breezehome' }, NOW);
    expect(n.type).toBe('propertyRequest');
    expect(n.fromPlayerId).toBe(1);
    expect(n.toPlayerId).toBe(2);
    expect(n.holdId).toBe('whiterun');
    expect(n.read).toBe(false);
    expect(n.expiresAt).toBeGreaterThan(NOW);
  });

  it('generates a unique id per call', () => {
    const a = createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW);
    const b = createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW + 1);
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// filterExpired
// ---------------------------------------------------------------------------

describe('filterExpired', () => {
  it('removes expired notifications', () => {
    const notifications: CourierNotification[] = [
      createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW - 8 * 24 * 60 * 60 * 1000),
      createNotification('holdMessage',     1, 2, 'whiterun', {}, NOW),
    ];
    const result = filterExpired(notifications, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('holdMessage');
  });

  it('keeps notifications with null expiresAt', () => {
    const n = { ...createNotification('holdMessage', 1, 2, 'whiterun', {}, NOW), expiresAt: null };
    expect(filterExpired([n], NOW)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getUnread
// ---------------------------------------------------------------------------

describe('getUnread', () => {
  it('returns only unread notifications', () => {
    const a = createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW);
    const b = { ...createNotification('holdMessage', 1, 2, 'whiterun', {}, NOW), read: true };
    expect(getUnread([a, b])).toHaveLength(1);
    expect(getUnread([a, b])[0].type).toBe('propertyRequest');
  });
});

// ---------------------------------------------------------------------------
// sendNotification + markRead + getPendingNotifications
// ---------------------------------------------------------------------------

describe('sendNotification and markRead', () => {
  let store: PlayerStore;
  let bus: EventBus;
  let mp: ReturnType<typeof makeMp>;

  beforeEach(() => {
    store = new PlayerStore();
    bus = new EventBus();
    mp = makeMp();
    store.registerPlayer(2, 0xff000002, 'Steward');
  });

  it('persists notification to mp storage', () => {
    const n = createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW);
    sendNotification(mp, store, n);
    expect(mp.set).toHaveBeenCalled();
  });

  it('sends customPacket to online recipient', () => {
    const n = createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW);
    sendNotification(mp, store, n);
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(2, expect.any(String));
  });

  it('markRead marks the notification as read', () => {
    const n = createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW);
    sendNotification(mp, store, n);
    markRead(mp, store, 2, n.id);
    const pending = getPendingNotifications(mp, store, 2);
    expect(pending).toHaveLength(0);
  });

  it('getPendingNotifications returns unread unexpired notifications', () => {
    const n = createNotification('propertyRequest', 1, 2, 'whiterun', {}, NOW);
    sendNotification(mp, store, n);
    const pending = getPendingNotifications(mp, store, 2);
    expect(pending).toHaveLength(1);
  });
});
