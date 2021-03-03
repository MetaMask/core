import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { CurrencyRateActions } from './assets/CurrencyRateController';
import { PreferencesActions } from './user/PreferencesController';

export type EventHandler<T extends Record<string, any>> = (payload: T) => void;
export type EventHandlerRecord = Record<string, EventHandler<any>>;
type ReturnTypeOfMethod<T> = T extends (...args: any[]) => any ? ReturnType<T> : any;
type ReturnTypeOfMethodIfExists<T, S> = S extends keyof T ? ReturnTypeOfMethod<T[S]> : any;
type MethodParams<T> = T extends (...args: infer P) => any ? P[0] : T;
type MethodParamsIfExists<T, S> = S extends keyof T ? MethodParams<T[S]> : S;

export type Actions = PreferencesActions & CurrencyRateActions;

export class ControllerMessagingSystem {
  private ee: EventEmitter = new EventEmitter();

  private actions = new Map<keyof Actions, Actions[keyof Actions]>();

  private listeners = new Map<string, {event: string; handler: EventHandler<any> }>();

  public registerActionHandler<T extends keyof Actions>(
    action: T,
    handler: Actions[T],
  ): void {
    if (this.actions.has(action)) {
      throw new Error(`A handler for ${action} has already been registered`);
    }
    this.actions.set(action, handler);
  }

  public registerActionHandlers(handlers: Partial<Actions>): void {
    // eslint-disable-next-line @typescript-eslint/array-type
    const actionKeys = Object.keys(handlers) as Array<keyof typeof handlers>;
    actionKeys.forEach((action) => {
      const handler = handlers[action];
      if (handler) {
        this.registerActionHandler(action, handler);
      }
    });
  }

  public unregisterActionHandler(action: keyof Actions): void {
    this.actions.delete(action);
  }

  public unregisterActionHandlers(actionNames: (keyof Actions)[]): void {
    actionNames.forEach((action) => this.unregisterActionHandler(action));
  }

  public resetActionHandlers(): void {
    this.actions.clear();
  }

  public call<N extends keyof Actions>(
    action: N,
    params: MethodParamsIfExists<Actions, N>
  ): ReturnTypeOfMethodIfExists<Actions, N> {
    const handler = this.actions.get(action);
    if (!handler) {
      throw new Error(`A handler for ${action} has not been registered`);
    }
    return handler(params as any) as any;
  }

  public publish<T>(event: string, payload: T): void {
    this.ee.emit(event, payload);
  }

  public subscribe<T>(event: string, handler: EventHandler<T>): string {
    const subId = uuidv4();
    this.listeners.set(subId, { event, handler });
    this.ee.on(event, handler);
    return subId;
  }

  public subscribeToEvents(events: EventHandlerRecord): string[] {
    const subscriptionIds: string[] = [];
    Object.keys(events).forEach((event) => {
      subscriptionIds.push(this.subscribe(event, events[event]));
    });
    return subscriptionIds;
  }

  public unsubscribe(subId: string) {
    const subscription = this.listeners.get(subId);
    if (subscription) {
      this.ee.off(subscription.event, subscription.handler);
    }
    this.listeners.delete(subId);
  }

  public unsubscribeFromEvents(subscriptionIds: string[]): void {
    subscriptionIds.forEach((subId) => this.unsubscribe(subId));
  }

  public resetSubscriptions() {
    [...this.listeners.keys()].forEach((subId) => this.unsubscribe(subId));
    this.listeners.clear();
  }

  public destroy() {
    this.resetActionHandlers();
    this.resetSubscriptions();
  }
}
