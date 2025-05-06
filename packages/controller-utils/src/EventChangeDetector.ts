import deepEqual from 'fast-deep-equal';

export type EventName = `${string}:${string}`;

export type EventHandler = (...payload: unknown[]) => void;

export type EventMessenger<Event extends EventName> = {
  subscribe: (event: Event, callback: EventHandler) => void;
  unsubscribe: (event: Event, callback: EventHandler) => void;
};

export type Handlers = {
  onSameEventValues: (
    event: EventName,
    stats: EventStats,
    ...values: unknown[]
  ) => void;
};

/**
 * Pretty-print values as JSON.
 *
 * @param values - Values to be pretty-printed.
 * @returns A pretty-printed JSON string.
 */
function pprint(values: unknown) {
  return JSON.stringify(values, null, 2);
}

export class EventStats {
  #total: number = 0;

  #same: number = 0;

  get total(): number {
    return this.#total;
  }

  get same(): number {
    return this.#same;
  }

  get rate(): number {
    return this.#same / this.#total;
  }

  update({ isSame }: { isSame: boolean } = { isSame: false }) {
    if (isSame) {
      this.#same += 1;
    }
    this.#total += 1;
  }

  pprint() {
    return `[${this.#same}/${this.#total} (${(this.rate * 100).toFixed(2)}%)]`;
  }
}

/**
 * Default handlers for `onSameEventValues`.
 *
 * @param event - Event name.
 * @param stats - Event stats.
 * @param values - Event values (or payload).
 */
export const onSameEventValuesLogHandler: Handlers['onSameEventValues'] = (
  event: EventName,
  stats: EventStats,
  ...values: unknown[]
) => {
  console.log(`! ${event} (no-diff) ${stats.pprint()}:\n${pprint(values)}`);
};

// TODO: Change name.
export const DEFAULT_HANDLERS: Handlers = {
  onSameEventValues: onSameEventValuesLogHandler,
};

export class EventChangeDetector<Event extends EventName> {
  readonly #events: Map<Event, EventHandler>;

  readonly #values: Map<Event, unknown[]>;

  readonly #stats: Map<Event, EventStats>;

  readonly #handlers: Handlers;

  readonly #messenger: EventMessenger<Event>;

  constructor({
    messenger,
    handlers = DEFAULT_HANDLERS,
  }: {
    messenger: EventMessenger<Event>;
    handlers?: Handlers;
  }) {
    this.#messenger = messenger;
    this.#handlers = handlers;
    this.#events = new Map();
    this.#values = new Map();
    this.#stats = new Map();
  }

  static from<Event extends EventName>({
    events,
    messenger,
    handlers = DEFAULT_HANDLERS,
  }: {
    events: readonly Event[];
    messenger: EventMessenger<Event>;
    handlers?: Handlers;
  }) {
    const detector = new EventChangeDetector<Event>({ messenger, handlers });

    for (const event of events) {
      detector.subscribe(event);
    }
    return detector;
  }

  subscribe(event: Event) {
    if (!this.#events.has(event)) {
      const handler: EventHandler = (...payload) => {
        this.#handleEvent(event, ...payload);
      };

      this.#messenger.subscribe(event, handler);
      this.#events.set(event, handler);
      this.#stats.set(event, new EventStats());
    }
  }

  unsubscribe(event: Event) {
    const handler = this.#events.get(event);

    if (handler) {
      this.#messenger.unsubscribe(event, handler);
      this.#events.delete(event);
      this.#stats.delete(event);
    }
  }

  getEvents(): Event[] {
    return Array.from(this.#events.keys());
  }

  getStats(event: Event): EventStats {
    const stats = this.#stats.get(event);

    if (!stats) {
      throw new Error(`Missing stats for: "${event}"`);
    }
    return stats;
  }

  #isSameEventValues(event: Event, ...newValues: unknown[]) {
    if (this.#values.has(event)) {
      const oldValues = this.#values.get(event);

      return deepEqual(oldValues, newValues);
    }
    return false;
  }

  #handleEvent(event: Event, ...newValues: unknown[]) {
    const stats = this.getStats(event);
    const isSame = this.#isSameEventValues(event, ...newValues);

    stats.update({ isSame });
    if (isSame) {
      this.#handlers.onSameEventValues(event, stats, ...newValues);
    }

    // Keep track of the new event values.
    this.#values.set(event, newValues);
  }
}
