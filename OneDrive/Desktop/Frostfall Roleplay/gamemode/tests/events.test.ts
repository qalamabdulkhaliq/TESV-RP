import { EventBus } from '../src/events';

describe('EventBus', () => {
  it('calls a registered listener when event is dispatched', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerJoined', handler);
    bus.dispatch({ type: 'playerJoined', payload: { playerId: 1, actorId: 0xff000001, name: 'Thorald' }, timestamp: 1000 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes the full event object to the listener', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerDowned', handler);
    const event = {
      type: 'playerDowned' as const,
      payload: { victimId: 2, attackerId: 1, holdId: 'whiterun' as const },
      timestamp: 1000,
    };
    bus.dispatch(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not call listeners registered for other event types', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerJoined', handler);
    bus.dispatch({
      type: 'bountyChanged',
      payload: { playerId: 1, holdId: 'whiterun', amount: 500, previousAmount: 0 },
      timestamp: 1000,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls multiple listeners registered for the same event type', () => {
    const bus = new EventBus();
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.on('playerJoined', h1);
    bus.on('playerJoined', h2);
    bus.dispatch({ type: 'playerJoined', payload: { playerId: 1, actorId: 0xff000001, name: 'Thorald' }, timestamp: 1000 });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('stops calling a listener after off()', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('playerJoined', handler);
    bus.off('playerJoined', handler);
    bus.dispatch({ type: 'playerJoined', payload: { playerId: 1, actorId: 0xff000001, name: 'Thorald' }, timestamp: 1000 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles dispatch with no registered listeners gracefully', () => {
    const bus = new EventBus();
    expect(() => {
      bus.dispatch({ type: 'hungerTick', payload: {}, timestamp: 1000 });
    }).not.toThrow();
  });
});
