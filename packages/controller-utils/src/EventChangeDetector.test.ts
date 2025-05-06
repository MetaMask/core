import type { EventName, Handlers } from './EventChangeDetector';
import { EventChangeDetector, EventStats } from './EventChangeDetector';

type EventHandler = (...payload: unknown[]) => void;

class MockMessenger<Event extends EventName> {
  readonly #handlers: Map<Event, EventHandler>;

  constructor() {
    this.#handlers = new Map();
  }

  subscribe(event: Event, handler: EventHandler) {
    if (!this.#handlers.has(event)) {
      this.#handlers.set(event, handler);
    }
  }

  unsubscribe(event: Event, _handler: EventHandler) {
    const registered = this.#handlers.get(event);

    if (!registered) {
      throw new Error('Not registered');
    }
    this.#handlers.delete(event);
  }

  publish(event: Event, ...payload: unknown[]) {
    const handler = this.#handlers.get(event);

    if (!handler) {
      throw new Error(`No event handlers for: "${event}"`);
    }
    handler(...payload);
  }
}

function setup<Event extends EventName>(opts: {
  events: readonly Event[];
  handlers?: Handlers;
}) {
  const messenger = new MockMessenger<Event>();
  const handlers = opts.handlers ?? {
    onSameEventValues: jest.fn(),
  };
  const detector = EventChangeDetector.from({
    messenger,
    handlers,
    events: opts.events,
  });

  return { messenger, handlers, detector };
}

describe('EventChangeDetector', () => {
  const events = ['0:event', '1:event'] as const;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('does not call the handler if events values are different', () => {
    const { messenger, handlers } = setup({ events });

    messenger.publish(events[0], { foobar: true });
    messenger.publish(events[0], { foobar: false });

    expect(handlers.onSameEventValues).not.toHaveBeenCalled();
  });

  it('does not call the handler if events values are being re-used', () => {
    const { messenger, handlers } = setup({ events });

    messenger.publish(events[0], { foobar: true });
    messenger.publish(events[0], { foobar: false });
    messenger.publish(events[0], { foobar: true });

    expect(handlers.onSameEventValues).not.toHaveBeenCalled();
  });

  it('detects event sent with the same values', () => {
    const { messenger, detector, handlers } = setup({ events });

    const payload = { foobar: true };
    messenger.publish(events[0], payload);
    messenger.publish(events[0], payload);

    expect(handlers.onSameEventValues).toHaveBeenCalledWith(
      detector,
      events[0],
      payload,
    );
  });

  it('detects event sent with the same values (default handler)', () => {
    const messenger = new MockMessenger<(typeof events)[number]>();
    const detector = EventChangeDetector.from({
      messenger,
      events,
    });
    detector.subscribe(events[0]);

    const consoleSpy = jest.spyOn(global.console, 'log');

    const payload = { foobar: true };
    messenger.publish(events[0], payload);
    messenger.publish(events[0], payload);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`! ${events[0]} (no-diff)`),
    );
  });

  it('subscribe and unsubscribe events', () => {
    const { messenger, detector } = setup<(typeof events)[0]>({
      events: [],
    });

    detector.subscribe(events[0]);
    detector.unsubscribe(events[0]);

    expect(() => messenger.publish(events[0], { foobar: true })).toThrow(
      `No event handlers for: "${events[0]}"`,
    );
  });

  it('tracks stats', () => {
    const { messenger, detector } = setup({
      events,
    });

    const event = events[0];
    messenger.publish(event, { foobar: 1 });
    messenger.publish(event, { foobar: 2 });
    messenger.publish(event, { foobar: 3 });
    messenger.publish(event, { foobar: 3 }); // Same.

    const stats = detector.getStats(events[0]);
    expect(stats).toBeDefined();
    expect(stats?.total).toBe(4);
    expect(stats?.same).toBe(1);
    expect(stats?.rate).toBe(0.25);
  });

  it('cannot get stats for an unknown event', () => {
    const { detector } = setup({
      events: [events[0]],
    });

    const badEvent = events[1];
    // @ts-expect-error - Testing error case that's not type-safe.
    expect(() => detector.getStats(badEvent)).toThrow(
      `Unknown event: "${badEvent}"`,
    );
  });

  it('gets registered events', () => {
    const { detector } = setup({
      events,
    });

    expect(detector.getEvents()).toStrictEqual(events);
  });

  it('gets registered events and use it to get event stats', () => {
    const { detector } = setup({
      events,
    });

    for (const event of detector.getEvents()) {
      const stats = detector.getStats(event);

      expect(stats).toBeDefined();
    }
  });
});

describe('EventStats', () => {
  it('updates the total', () => {
    const stats = new EventStats();

    stats.update();
    stats.update();

    expect(stats.same).toBe(0);
    expect(stats.total).toBe(2);
  });

  it('updates the total and same', () => {
    const stats = new EventStats();

    stats.update();
    stats.update({ isSame: true });

    expect(stats.same).toBe(1);
    expect(stats.total).toBe(2);
  });
});
