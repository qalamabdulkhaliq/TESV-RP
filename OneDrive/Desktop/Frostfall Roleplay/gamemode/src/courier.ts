import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, HoldId } from './types';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'propertyRequest'
  | 'prisonRequest'
  | 'bountyReport'
  | 'holdMessage';

export interface CourierNotification {
  id: string;
  type: NotificationType;
  fromPlayerId: PlayerId;
  /** The Steward or Jarl this notification is addressed to */
  toPlayerId: PlayerId;
  holdId: HoldId;
  payload: Record<string, unknown>;
  createdAt: number;
  /** null = never expires */
  expiresAt: number | null;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Notifications expire after 7 IRL days if unread */
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function createNotification(
  type: NotificationType,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  holdId: HoldId,
  payload: Record<string, unknown>,
  now = Date.now(),
): CourierNotification {
  return {
    id: `${now}-${fromPlayerId}-${type}`,
    type,
    fromPlayerId,
    toPlayerId,
    holdId,
    payload,
    createdAt: now,
    expiresAt: now + DEFAULT_EXPIRY_MS,
    read: false,
  };
}

export function filterExpired(
  notifications: CourierNotification[],
  now = Date.now(),
): CourierNotification[] {
  return notifications.filter(
    (n) => n.expiresAt === null || n.expiresAt > now,
  );
}

export function getUnread(notifications: CourierNotification[]): CourierNotification[] {
  return notifications.filter((n) => !n.read);
}

// ---------------------------------------------------------------------------
// Courier store — in-memory, persisted to mp.set per player
// ---------------------------------------------------------------------------

const PROP_KEY = 'ff_courier';

function loadNotifications(mp: Mp, actorId: number): CourierNotification[] {
  const raw = mp.get(actorId, PROP_KEY) as CourierNotification[] | undefined;
  return raw ?? [];
}

function saveNotifications(mp: Mp, actorId: number, notifications: CourierNotification[]): void {
  const clean = filterExpired(notifications);
  mp.set(actorId, PROP_KEY, clean);
}

// ---------------------------------------------------------------------------
// System init
// ---------------------------------------------------------------------------

export function initCourier(mp: Mp, store: PlayerStore, bus: EventBus): void {
  // On join: deliver any pending notifications to the player
  bus.on('playerJoined', (event) => {
    const { playerId, actorId } = event.payload as { playerId: PlayerId; actorId: number };
    const notifications = loadNotifications(mp, actorId);
    const unread = getUnread(filterExpired(notifications));

    if (unread.length > 0) {
      sendPacket(mp, playerId, 'courierDelivery', {
        count: unread.length,
        notifications: unread,
      });
      console.log(`[Courier] Delivered ${unread.length} notification(s) to ${store.get(playerId)?.name ?? playerId}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a notification to a player (Steward, Jarl, or any recipient).
 * If they are online, delivers immediately via customPacket.
 * Always persists to mp storage so offline players receive it on next login.
 */
export function sendNotification(
  mp: Mp,
  store: PlayerStore,
  notification: CourierNotification,
): void {
  const recipient = store.get(notification.toPlayerId);

  // Persist regardless of online status
  if (recipient) {
    const existing = loadNotifications(mp, recipient.actorId);
    saveNotifications(mp, recipient.actorId, [...existing, notification]);

    // Deliver immediately if online
    sendPacket(mp, notification.toPlayerId, 'courierNotification', {
      notification,
    });
  }

  console.log(`[Courier] Notification ${notification.id} queued for player ${notification.toPlayerId}`);
}

/**
 * Mark a notification as read for a player.
 */
export function markRead(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
  notificationId: string,
): void {
  const player = store.get(playerId);
  if (!player) return;

  const notifications = loadNotifications(mp, player.actorId);
  const updated = notifications.map((n) =>
    n.id === notificationId ? { ...n, read: true } : n,
  );
  saveNotifications(mp, player.actorId, updated);
}

/**
 * Get all pending (unread, unexpired) notifications for a player.
 */
export function getPendingNotifications(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
): CourierNotification[] {
  const player = store.get(playerId);
  if (!player) return [];
  const notifications = loadNotifications(mp, player.actorId);
  return getUnread(filterExpired(notifications));
}
