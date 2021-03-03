import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { CurrencyRateActions, CurrencyRateEvents } from './assets/CurrencyRateController';
import { PreferencesActions, PreferencesEvents } from './user/PreferencesController';

type ReturnTypeOfMethod<T> = T extends (...args: any[]) => any ? ReturnType<T> : any;
type ReturnTypeOfMethodIfExists<T, S> = S extends keyof T ? ReturnTypeOfMethod<T[S]> : any;
type MethodParams<T> = T extends (...args: infer P) => any ? P[0] : T;
type MethodParamsIfExists<T, S> = S extends keyof T ? MethodParams<T[S]> : S;

interface ControllerRegistryEntry<A, E> {
  actions: A;
  events: E;
  subscriptionsIds?: string[];
}

interface ControllerRegister {
  PreferencesController: ControllerRegistryEntry<PreferencesActions, PreferencesEvents>;
  CurrencyRateController: ControllerRegistryEntry<CurrencyRateActions, CurrencyRateEvents>;
}

type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

type RegisteredControllers = keyof ControllerRegister;
type RegisteredActions = UnionToIntersection<ControllerRegister[keyof ControllerRegister]['actions']>;
type RegisteredEvents = UnionToIntersection<ControllerRegister[keyof ControllerRegister]['events']>;
type RegisteredActionNames = keyof RegisteredActions;
type RegisteredEventNames = keyof RegisteredEvents;

interface SubscribeRequest<C extends RegisteredControllers, E extends RegisteredEventNames> {
  event: E;
  controller: C;
  callback: (args: RegisteredEvents[E]) => void;
}

interface CallRequest<C extends RegisteredControllers, M extends RegisteredActionNames> {
  method: M;
  controller: C;
  params?: MethodParamsIfExists<ControllerRegister[C]['actions'], M>;
}

interface PublishPayload<C extends RegisteredControllers, E extends RegisteredEventNames> {
  event: Error;
  controller: C;
  payload: MethodParamsIfExists<RegisteredEvents, E>;
}

export default class MessagingSystem {
  private controllers: {
    [P in RegisteredControllers]?: {
      subscriptionIds: string[];
    }
  } = {};

  private actions: Partial<RegisteredActions> = {};

  private subscriptionHandlers = new Map<string, any>();

  private subscriptionsByEvent = new Map<string, string[]>();

  private ee: EventEmitter = new EventEmitter();

  registerController<N extends RegisteredControllers>(controllerName: N, config: Omit<ControllerRegister[N], 'subscriptionIds'>): void {
    this.controllers[controllerName] = { subscriptionIds: [] };
    this.actions = {
      ...this.actions,
      ...config.actions,
    };
  }

  // registerEvents(controllerName: string, events) {
  //   if (this.registry[controllerName]) {
  //     throw new Error(`Action handlers have already been declared for ${controllerName}.`);
  //   }
  //   this.registry[controllerName].actions = actionHandlers;
  // }

  call<C extends RegisteredControllers, M extends RegisteredActionNames>(req: CallRequest<C, M>): ReturnTypeOfMethodIfExists<RegisteredActions, M> {
    const controller = this.controllers[req.controller];
    if (!controller) {
      throw new Error(`Controller ${controller} has not been registered in the messaging system`);
    }
    const action = this.actions[req.method];
    if (!action) {
      throw new Error(`A handler has not been registered for ${req.method}`);
    }

    // Type safety is ensured at call site. It will be impossible to call this method
    // with an invalid CallRequest.
    return action(req.params as any) as any;
  }

  subscribe<C extends RegisteredControllers, E extends RegisteredEventNames>(controllerName: C, req: SubscribeRequest<C, E>): string {
    const controller = this.controllers[controllerName];
    if (!controller) {
      throw new Error('you may not subscribe to events if you do not first register the controller');
    }
    const uuid = uuidv4();
    this.subscriptionHandlers.set(uuid, req.callback);
    const previousIds = this.subscriptionsByEvent.get(req.event);
    controller.subscriptionIds = [
      ...controller.subscriptionIds,
      uuid,
    ];
    this.subscriptionsByEvent.set(req.event, [...previousIds ?? [], uuid]);
    return uuid;
  }

  publish<C extends RegisteredControllers, E extends RegisteredEventNames>(publish): void {

  }

  teardownController<C extends RegisteredControllers>(controller: C): void {
  }
}

const t = new MessagingSystem();

t.call({ controller: 'PreferencesController', method: 'PreferencesController.setSelectedAddress', params: 'address' });
const y = t.call({ controller: 'CurrencyRateController', method: 'PreferencesController.getState' });

t.subscribe('CurrencyRateController', {
 controller: 'CurrencyRateController',
 event: 'PreferencesController.state-changed',
 callback: (state) => {
   console.log('identities', state.identities);
 },
});
