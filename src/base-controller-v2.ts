// 'Draft' is a type, and import/named apparently doesn't like it when you
// import a type: https://github.com/benmosher/eslint-plugin-import/issues/1699
// eslint-disable-next-line import/named
import { Draft, produce } from 'immer';
import { EventHandler, Actions, EventHandlerRecord, ControllerMessagingSystem } from './controller-messaging-system';

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
export class BaseController<S extends Record<string, any>, A extends Partial<Actions>> {
  private internalState: S;

  private messagingSystem: ControllerMessagingSystem;

  private subscriptions: string[] = [];

  private actions?: A;

  private stateUpdateEventName = 'BaseController.state-changed';

  public readonly schema: Schema<S>;

  /**
   * Creates a BaseController instance.
   *
   * @param state - Initial controller state
   * @param schema - State schema, describing how to "anonymize" the state,
   *   and which parts should be persisted.
   */
  constructor(messagingSystem: ControllerMessagingSystem, state: S, stateUpdateEventName: string, schema: Schema<S>) {
    this.internalState = state;
    this.schema = schema;
    this.stateUpdateEventName = stateUpdateEventName;
    this.messagingSystem = messagingSystem;
  }

  /**
   * Retrieves current controller state
   *
   * @returns - Current state
   */
  get state() {
    return this.internalState;
  }

  registerActions(actions: A) {
    this.actions = actions;
    this.messagingSystem.registerActionHandlers(actions);
  }

  registerAction<N extends keyof A>(action: N, handler: Actions[N]) {
    if (!this.actions?.[action]) {
      this.messagingSystem.registerActionHandler(action, handler);
      this.actions = {
        ...this.actions,
        [action]: handler,
      };
    }
  }

  unregisterActions() {
    if (this.actions) {
      this.messagingSystem.unregisterActionHandlers(Object.keys(this.actions));
    }
  }

  /**
   * Adds new listener to be notified of state changes
   *
   * @param listener - Callback triggered when state changes
   */
  subscribe<T>(event: string, eventHandler: EventHandler<T>): string {
    const subId = this.messagingSystem.subscribe(event, eventHandler);
    this.subscriptions.push(subId);
    return subId;
  }

  subscribeToEvents(events: EventHandlerRecord) {
    this.subscriptions = [
      ...this.subscriptions,
      ...this.messagingSystem.subscribeToEvents(events),
    ];
  }

  /**
   * Removes existing listener from receiving state changes
   *
   * @param listener - Callback to remove
   * @returns - True if a listener is found and unsubscribed
   */
  unsubscribe(subId: string) {
    this.unsubscribe(subId);
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
    this.messagingSystem.publish(this.stateUpdateEventName, this.state);
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
      this.messagingSystem.unsubscribeFromEvents(this.subscriptions);
    }
    this.subscriptions = [];
    if (this.actions) {
      this.unregisterActions();
    }
    this.actions = undefined;
  }
}

export default BaseController;
