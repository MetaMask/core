import type { AccountId, Caip19AssetId, ChainId } from '../types.js';

/**
 * What kicked off a balance write. Every internal handler sets an explicit
 * trigger; the `getAssets` messenger action defaults to `'action'`.
 */
export type DebugLogTrigger =
  | 'startup'
  | 'account-group-change'
  | 'account-added'
  | 'networks-changed'
  | 'network-added'
  | 'network-removed'
  | 'network-changed'
  | 'transaction-submitted'
  | 'transaction-confirmed'
  | 'custom-asset-added'
  | 'subscription'
  | 'action';

/** Which pipeline produced the write. */
export type DebugLogLane = 'fast' | 'slow' | 'subscription';

/** A single changed (account, asset) balance. */
export type DebugLogChange = {
  accountId: AccountId;
  assetId: Caip19AssetId;
  previousAmount?: string;
  newAmount: string;
};

/**
 * Ambient, cross-cutting context describing *why* the current work is running.
 * Set at a call site via {@link DebugLogStore.runWithContext} and stamped onto
 * every event published from within that (synchronous) scope, so decorated
 * methods never have to receive it as a parameter.
 */
export type DebugLogContext = {
  trigger?: DebugLogTrigger;
  lane?: DebugLogLane;
  /** e.g. ['AccountsApiDataSource'] */
  sources?: string[];
  chainIds?: ChainId[];
  sourceDurationsMs?: Record<string, number>;
  /** chain errors still unresolved at write time */
  errors?: Record<ChainId, string>;
  /** chains where upstream errored and RPC fallback recovered a balance */
  fallbackChains?: ChainId[];
  /** middlewares that threw */
  failedSources?: string[];
};

/**
 * A single event published to the store by the {@link debugLog} decorator.
 * `data` carries the decorated method's return value (kept small/curated).
 */
export type DebugLogEvent = {
  className: string;
  methodName: string;
  /** Epoch ms (UTC, universal) — used for TTL / coalescing math. */
  timestampMs: number;
  /** ISO-8601 UTC string — human- and agent-readable rendering of the same instant. */
  timestamp: string;
  durationMs?: number;
  error?: string;
  context: DebugLogContext;
  data?: unknown;
};

/** What the decorator supplies; the store stamps timestamps + context. */
type PublishInput = Omit<DebugLogEvent, 'timestampMs' | 'timestamp' | 'context'> & {
  context?: DebugLogContext;
};

type DebugLogListener = (event: DebugLogEvent) => void;

/**
 * Orthogonal, module-scoped debug-log store. It imports nothing from the
 * controller or any domain class, so it can never take part in a circular
 * dependency: decorated methods (and the controller) depend on it, never the
 * reverse.
 *
 * The {@link debugLog} decorator publishes events here; the controller
 * subscribes and folds them into persisted state. Inert until {@link enable}
 * is called, so it costs nothing in production unless a client opts in.
 */
class DebugLogStore {
  #enabled = false;

  readonly #contextStack: DebugLogContext[] = [];

  readonly #listeners = new Set<DebugLogListener>();

  /** Whether publishing is active. */
  get enabled(): boolean {
    return this.#enabled;
  }

  /** Turn publishing on. */
  enable(): void {
    this.#enabled = true;
  }

  /** Turn publishing off and drop any dangling context frames. */
  disable(): void {
    this.#enabled = false;
    this.#contextStack.length = 0;
  }

  /**
   * Run `fn` with `context` merged onto the ambient context for the duration
   * of the synchronous call. Events published while `fn` runs (or captured
   * synchronously by a decorated async method it invokes) inherit this
   * context without any parameter drilling.
   *
   * @param context - Context to layer on for this scope.
   * @param fn - The work to run.
   * @returns Whatever `fn` returns.
   */
  runWithContext<Result>(context: DebugLogContext, fn: () => Result): Result {
    this.#contextStack.push({ ...this.currentContext(), ...context });
    try {
      return fn();
    } finally {
      this.#contextStack.pop();
    }
  }

  /** The context at the top of the stack (empty when none is active). */
  currentContext(): DebugLogContext {
    return this.#contextStack[this.#contextStack.length - 1] ?? {};
  }

  /**
   * Publish an event to all subscribers. No-op when disabled. Never throws —
   * debug logging must never break the work it observes.
   *
   * @param input - The event minus the stamped fields; `context` defaults to
   * the current ambient context.
   */
  publish(input: PublishInput): void {
    if (!this.#enabled) {
      return;
    }
    const timestampMs = Date.now();
    const event: DebugLogEvent = {
      ...input,
      context: input.context ?? this.currentContext(),
      timestampMs,
      timestamp: new Date(timestampMs).toISOString(),
    };
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // A faulty subscriber must not break other subscribers or the caller.
      }
    }
  }

  /**
   * Subscribe to published events.
   *
   * @param listener - Called for every published event. Keep it pure (e.g.
   * append to a buffer); never call a `@debugLog`-decorated method from here
   * or you will cause infinite recursion.
   * @returns An unsubscribe function.
   */
  subscribe(listener: DebugLogListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

/** The shared debug-log store singleton. */
export const debugLogStore = new DebugLogStore();

/**
 * Stage-3 method decorator that publishes a {@link DebugLogEvent} to the
 * {@link debugLogStore} when the method completes.
 *
 * Captures the ambient context synchronously at call time (so it stays correct
 * even for async methods whose `runWithContext` scope has already popped by the
 * time they resolve), records duration + error, and stores the return value as
 * `data`. Completely inert when the store is disabled.
 *
 * @returns A method decorator.
 */
export function debugLog<
  This,
  Args extends unknown[],
  Return,
>(): (
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<
    This,
    (this: This, ...args: Args) => Return
  >,
) => (this: This, ...args: Args) => Return {
  return function decorate(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
      This,
      (this: This, ...args: Args) => Return
    >,
  ) {
    const methodName = String(context.name);

    return function wrapped(this: This, ...args: Args): Return {
      if (!debugLogStore.enabled) {
        return target.apply(this, args);
      }

      const className =
        (this as { constructor?: { name?: string } })?.constructor?.name ??
        'unknown';
      // Snapshot context now — an async method's scope pops before it resolves.
      const capturedContext = { ...debugLogStore.currentContext() };
      const start = performance.now();

      const emit = (data: unknown, error?: unknown): void => {
        debugLogStore.publish({
          className,
          methodName,
          durationMs: performance.now() - start,
          context: capturedContext,
          data,
          ...(error === undefined
            ? {}
            : { error: error instanceof Error ? error.message : String(error) }),
        });
      };

      let result: Return;
      try {
        result = target.apply(this, args);
      } catch (error) {
        emit(undefined, error);
        throw error;
      }

      if (result instanceof Promise) {
        return result.then(
          (value) => {
            emit(value);
            return value;
          },
          (error) => {
            emit(undefined, error);
            throw error;
          },
        ) as Return;
      }

      emit(result);
      return result;
    };
  };
}
