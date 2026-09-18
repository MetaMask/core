import {
  AllowedQuoteStatusStateTransitions,
  QuoteStatusState,
} from './constants.js';
import type {
  QuoteStatusStateUpdateEvent,
  QuoteStatusStateUpdateListener,
} from './types.js';

/**
 * Finite state machine that enforces forward-only quote status transitions.
 */
export class QuoteStatusStateFsm {
  #state: QuoteStatusState;

  readonly #listeners = new Set<QuoteStatusStateUpdateListener>();

  /**
   * Creates a state machine with a default {@link QuoteStatusState.Submitted}
   * state.
   *
   * @param initialState - Optional initial state.
   */
  constructor(initialState: QuoteStatusState = QuoteStatusState.Submitted) {
    this.#state = initialState;
  }

  /**
   * Current lifecycle state.
   *
   * @returns The current quote status lifecycle state.
   */
  get state(): QuoteStatusState {
    return this.#state;
  }

  /**
   * Returns whether the current state can transition to the provided next state.
   *
   * @param nextState - Desired next state.
   * @returns `true` if the transition is valid.
   */
  canTransitionTo(nextState: QuoteStatusState): boolean {
    // Seeded persisted state may contain an unknown/legacy value that is not a
    // key in the transition map. Treat any such state as terminal (no allowed
    // transitions) instead of throwing on `undefined.includes(...)`.
    return (
      AllowedQuoteStatusStateTransitions[this.#state]?.includes(nextState) ??
      false
    );
  }

  /**
   * Transitions to the provided state if allowed.
   *
   * Emits a state update event when the transition succeeds.
   *
   * @param nextState - Desired next state.
   * @returns `true` if the transition was applied, otherwise `false`.
   */
  transitionTo(nextState: QuoteStatusState): boolean {
    if (!this.canTransitionTo(nextState)) {
      return false;
    }

    const previousState = this.#state;
    this.#state = nextState;
    this.#emitStateUpdate({ previousState, nextState });
    return true;
  }

  /**
   * Subscribes to state update events.
   *
   * @param listener - Callback invoked on each successful state transition.
   * @returns Unsubscribe function.
   */
  onStateUpdate(listener: QuoteStatusStateUpdateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Removes every subscribed state update listener.
   */
  removeAllListeners(): void {
    this.#listeners.clear();
  }

  #emitStateUpdate(event: QuoteStatusStateUpdateEvent): void {
    // Iterate over a snapshot so that a listener subscribing or unsubscribing
    // (including unsubscribing itself) during emission does not affect the
    // current notification pass.
    for (const listener of [...this.#listeners]) {
      listener(event);
    }
  }

  /**
   * Serializes the machine to a plain, persistable object.
   *
   * @returns The current lifecycle state wrapped in a plain object.
   */
  toJson(): { state: QuoteStatusState } {
    return {
      state: this.state,
    };
  }
}
