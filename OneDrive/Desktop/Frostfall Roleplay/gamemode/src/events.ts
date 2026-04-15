import type { GameEvent, GameEventType } from './types';

type EventHandler = (event: GameEvent<unknown>) => void;

/**
 * Internal typed event bus.
 * Systems communicate exclusively through this — never by calling each other directly.
 * One bus instance is created in index.ts and passed to every system's init().
 */
export class EventBus {
  private listeners: Map<GameEventType, Set<EventHandler>> = new Map();

  on(type: GameEventType, handler: EventHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  off(type: GameEventType, handler: EventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(event: GameEvent<unknown>): void {
    const handlers = this.listeners.get(event.type);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(event);
    }
  }
}
