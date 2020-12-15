// 'Draft' is a type, and import/named apparently doesn't like it when you
// import a type: https://github.com/benmosher/eslint-plugin-import/issues/1699
// eslint-disable-next-line import/named
import { Draft, produce } from 'immer';
import { ActionHandler, ActionHandlerRecord, EventHandler, EventHandlerRecord, publish, registerActionHandler, registerActionHandlers, subscribe, subscribeToEvents, unregisterActionHandlers, unsubscribe, unsubscribeFromEvents } from './controller-messaging-system';

/**
 * State change callbacks
 */
export type Listener<T> = (state: T) => void;

type Anonymizer<T> = (value: T) => T;

export type Schema<T> = {
  [P in keyof T]: {
    persist: boolean;
    anonymous: boolean | Anonymizer<T[P]>;
  };
};

/**
 * Controller class that provides state management and subscriptions
 */
export class BaseController<S extends Record<string, any>> {
  private internalState: S;

  private subscriptions: string[] = [];

  private actions?: ActionHandlerRecord;

  private stateUpdateEventName = 'BaseController.state-changed';

  public readonly schema: Schema<S>;

  /**
   * Creates a BaseController instance.
   *
   * @param state - Initial controller state
   * @param schema - State schema, describing how to "anonymize" the state,
   *   and which parts should be persisted.
   */
  constructor(state: S, stateUpdateEventName: string, schema: Schema<S>) {
    this.internalState = state;
    this.schema = schema;
    this.stateUpdateEventName = stateUpdateEventName;
  }

  /**
   * Retrieves current controller state
   *
   * @returns - Current state
   */
  get state() {
    return this.internalState;
  }

  registerActions(actions: ActionHandlerRecord) {
    this.actions = actions;
    registerActionHandlers(actions);
  }

  registerAction<T, R>(action: string, handler: ActionHandler<T, R>) {
    if (!this.actions?.[action]) {
      registerActionHandler(action, handler);
      this.actions = {
        ...this.actions,
        [action]: handler,
      };
    }

  }

  unregisterActions() {
    if (this.actions) {
      unregisterActionHandlers(Object.keys(this.actions));
    }
  }

  /**
   * Adds new listener to be notified of state changes
   *
   * @param listener - Callback triggered when state changes
   */
  subscribe<T>(event: string, eventHandler: EventHandler<T>): string {
    const subId = subscribe(event, eventHandler);
    this.subscriptions.push(subId);
    return subId;
  }

  subscribeToEvents(events: EventHandlerRecord) {
    this.subscriptions = [...this.subscriptions, ...subscribeToEvents(events)];
  }

  /**
   * Removes existing listener from receiving state changes
   *
   * @param listener - Callback to remove
   * @returns - True if a listener is found and unsubscribed
   */
  unsubscribe(subId: string) {
    unsubscribe(subId);
    this.subscriptions = this.subscriptions.filter((activeSubId) => activeSubId !== subId);
  }

  /**
   * Updates controller state. Accepts a callback that is passed a draft copy
   * of the controller state. If a value is returned, it is set as the new
   * state. Otherwise, any changes made within that callback to the draft are
   * applied to the controller state.
   *
   * @param callback - Callback for updating state, passed a draft state
   *   object. Return a new state object or mutate the draft to update state.
   */
  protected update(callback: (state: Draft<S>) => void | S) {
    this.internalState = produce(this.internalState, callback) as S;
    publish(this.stateUpdateEventName, this.state);
  }

  /**
   * Prepares the controller for garbage collection. This should be extended
   * by any subclasses to clean up any additional connections or events.
   *
   * The only cleanup performed here is to remove listeners. While technically
   * this is not required for garbage collection, it at least ensures this
   * instance won't be responsible for keeping the listeners in memory.
   */
  destroy() {
    if (this.subscriptions) {
      unsubscribeFromEvents(this.subscriptions);
    }
    this.subscriptions = [];
    if (this.actions) {
      unregisterActionHandlers(Object.keys(this.actions));
    }
    this.actions = undefined;
  }
}

export default BaseController;
