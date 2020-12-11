import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export type ActionHandler<T extends Record<string, any>, R> = (args?: T) => R;
export type EventHandler<T extends Record<string, any>> = (payload: T) => void;
export type ActionHandlerRecord = Record<string, ActionHandler<any, any>>;
export type EventHandlerRecord = Record<string, EventHandler<any>>;

const actions = new Map<string, ActionHandler<any, any>>();
const listeners = new Map<string, {event: string; handler: EventHandler<any> }>();

const ee = new EventEmitter();

export function registerActionHandler<T, R>(
  action: string,
  handler: ActionHandler<T, R>
) {
  if (actions.has(action)) {
    throw new Error(`A handler for ${action} has already been registered`);
  }
  actions.set(action, handler);
}

export function registerActionHandlers(handlers: ActionHandlerRecord) {
  Object.keys(handlers).forEach((action) => {
    registerActionHandler(action, handlers[action]);
  });
}

export function unregisterActionHandler(action: string) {
  actions.delete(action);
}

export function unregisterActionHandlers(actionNames: string[]) {
  actionNames.forEach((action) => unregisterActionHandler(action));
}

export function resetActionHandlers() {
  actions.clear();
}

export function call<T, R>(action: string, params?: T): R {
  const handler = actions.get(action) as ActionHandler<T, R>;
  if (!handler) {
    throw new Error(`A handler for ${action} has not been registered`);
  }
  return handler(params);
}

export function publish<T>(event: string, payload: T): void {
  ee.emit(event, payload);
}

export function subscribe<T>(event: string, handler: EventHandler<T>): string {
  const subId = uuidv4();
  listeners.set(subId, { event, handler });
  ee.on(event, handler);
  return subId;
}

export function subscribeToEvents(events: EventHandlerRecord): string[] {
  const subscriptionIds: string[] = [];
  Object.keys(events).forEach((event) => {
    subscriptionIds.push(subscribe(event, events[event]));
  });
  return subscriptionIds;
}

export function unsubscribe(subId: string) {
  const subscription = listeners.get(subId);
  if (subscription) {
    ee.off(subscription.event, subscription.handler);
  }
  listeners.delete(subId);
}

export function unsubscribeFromEvents(subscriptionIds: string[]): void {
  subscriptionIds.forEach((subId) => unsubscribe(subId));
}

export function resetSubscriptions() {
  [...listeners.keys()].forEach((subId) => unsubscribe(subId));
  listeners.clear();
}
