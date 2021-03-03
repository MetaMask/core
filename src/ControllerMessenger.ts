export type ActionHandler<Action, ActionType> = (
  ...args: ExtractActionParameters<Action, ActionType>
) => ExtractActionResponse<Action, ActionType>;
export type ExtractActionParameters<Action, T> = Action extends { type: T; handler: (...args: infer H) => any }
  ? H
  : never;
export type ExtractActionResponse<Action, T> = Action extends { type: T; handler: (...args: any) => infer H }
  ? H
  : never;

export type ExtractEvenHandler<Event, T> = Event extends { type: T; payload: infer P }
  ? P extends any[]
    ? (...payload: P) => void
    : never
  : never;
export type ExtractEventPayload<Event, T> = Event extends { type: T; payload: infer P } ? P : never;

type ActionConstraint = { type: string; handler: (...args: any) => unknown };
type EventConstraint = { type: string; payload: unknown[] };

export class ControllerMessenger<Action extends ActionConstraint, Event extends EventConstraint> {
  private actions = new Map<Action['type'], unknown>();

  private events = new Map<Event['type'], Set<unknown>>();

  registerActionHandler<T extends Action['type']>(action: T, handler: ActionHandler<Action, T>) {
    if (this.actions.has(action)) {
      throw new Error(`A handler for ${action} has already been registered`);
    }
    this.actions.set(action, handler);
  }

  unregisterActionHandler<T extends Action['type']>(action: T) {
    this.actions.delete(action);
  }

  clearActions() {
    this.actions.clear();
  }

  call<T extends Action['type']>(
    action: T,
    ...params: ExtractActionParameters<Action, T>
  ): ExtractActionResponse<Action, T> {
    const handler = this.actions.get(action) as ActionHandler<Action, T>;
    if (!handler) {
      throw new Error(`A handler for ${action} has not been registered`);
    }
    return handler(...params);
  }

  publish<E extends Event['type']>(event: E, ...payload: ExtractEventPayload<Event, E>) {
    const subscribers = this.events.get(event) as Set<ExtractEvenHandler<Event, E>>;

    if (subscribers) {
      for (const eventHandler of subscribers) {
        eventHandler(...payload);
      }
    }
  }

  subscribe<E extends Event['type']>(event: E, handler: ExtractEvenHandler<Event, E>) {
    let subscribers = this.events.get(event);
    if (!subscribers) {
      subscribers = new Set();
    }
    subscribers.add(handler);
    this.events.set(event, subscribers);
  }

  unsubscribe<E extends Event['type']>(event: E, handler: ExtractEvenHandler<Event, E>) {
    const subscribers = this.events.get(event);

    if (!subscribers || !subscribers.has(handler)) {
      throw new Error(`Subscription not found for event: '${event}'`);
    }

    subscribers.delete(handler);
    this.events.set(event, subscribers);
  }

  clearEventSubscriptions<E extends Event['type']>(event: E) {
    this.events.delete(event);
  }

  clearSubscriptions() {
    this.events.clear();
  }
}
