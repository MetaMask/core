import deepEqual from 'fast-deep-equal';

export type EventName = `${string}:${string}`;

export type EventHandler = (...payload: unknown[]) => void;

export type EventMessenger<Event extends EventName> = {
  subscribe: (event: Event, callback: EventHandler) => void;
  unsubscribe: (event: Event, callback: EventHandler) => void;
};

export type Handlers = {
  onSameEventValues: <Event extends EventName>(
    data: EventAnalyzedData<Event>,
    event: EventName,
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

export type EventInfo = {
  handler: EventHandler;
  value?: unknown[];
  stats: EventStats;
};

export type EventAnalyzedData<Event extends EventName> = {
  getStats(event: Event): EventStats;
  getEvents(): Event[];
};

/**
 * Default handlers for `onSameEventValues`.
 *
 * @param data - Analyzed data.
 * @param event - Event name.
 * @param values - Event values (or payload).
 */
export const onSameEventValuesLogHandler: Handlers['onSameEventValues'] = <
  Event extends EventName,
>(
  data: EventAnalyzedData<Event>,
  event: Event,
  ...values: unknown[]
) => {
  const stats = data.getStats(event);

  console.log(`! ${event} (no-diff) ${stats.pprint()}:\n${pprint(values)}`);
};

// TODO: Change name.
export const DEFAULT_HANDLERS: Handlers = {
  onSameEventValues: onSameEventValuesLogHandler,
};

export class EventAnalyzer<Event extends EventName>
  implements EventAnalyzedData<Event>
{
  readonly #events: Map<Event, EventInfo>;

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
    const analyzer = new EventAnalyzer<Event>({ messenger, handlers });

    for (const event of events) {
      analyzer.subscribe(event);
    }
    return analyzer;
  }

  subscribe(event: Event) {
    if (!this.#events.has(event)) {
      const handler: EventHandler = (...payload) => {
        this.#handleEvent(event, ...payload);
      };

      this.#messenger.subscribe(event, handler);
      this.#events.set(event, {
        handler,
        stats: new EventStats(),
      });
    }
  }

  unsubscribe(event: Event) {
    const info = this.#events.get(event);

    if (info) {
      const { handler } = info;

      this.#messenger.unsubscribe(event, handler);
      this.#events.delete(event);
    }
  }

  #get(event: Event): EventInfo {
    const info = this.#events.get(event);

    if (!info) {
      throw new Error(`Unknown event: "${event}"`);
    }
    return info;
  }

  getEvents(): Event[] {
    return Array.from(this.#events.keys());
  }

  getStats(event: Event): EventStats {
    return this.#get(event).stats;
  }

  #handleEvent(event: Event, ...newValues: unknown[]) {
    const info = this.#get(event);
    const { stats, value } = info;

    const isSame = value !== undefined && deepEqual(value, newValues);

    stats.update({ isSame });
    if (isSame) {
      this.#handlers.onSameEventValues(this, event, ...newValues);
    }

    // Keep track of the new event values.
    info.value = newValues;
  }
}
