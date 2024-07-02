import type {
  ActionConstraint,
  BaseConfig,
  BaseState,
  EventConstraint,
  RestrictedControllerMessenger,
  StateConstraint,
  StateMetadata,
  ControllerStateChangeEvent,
  Listener,
} from '@metamask/base-controller';
import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type { Patch } from 'immer';

export const controllerName = 'ComposableController';

type MessengerConsumerInstance = {
  name: string;
  messagingSystem: RestrictedControllerMessengerConstraint;
};

/**
 * A universal subtype of all controller instances that extend from `BaseControllerV1`.
 * Any `BaseControllerV1` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseControllerV1` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 */
export type BaseControllerV1Instance = {
  name: string;
  config: BaseConfig & object;
  defaultConfig: BaseConfig & object;
  state: BaseState & object;
  defaultState: BaseState & object;
  subscribe: (listener: Listener<BaseState & object>) => void;
  disabled: boolean;
} & Partial<Pick<MessengerConsumerInstance, 'messagingSystem'>>;

/**
 * A universal subtype of all controller instances that extend from `BaseController` (formerly `BaseControllerV2`).
 * Any `BaseController` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseController` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 *
 * For this reason, we only look for `BaseController` properties that we use in the ComposableController (name and state).
 */
export type BaseControllerInstance<
  State extends StateConstraint = StateConstraint,
> = {
  name: string;
  state: State;
  metadata: Record<string, unknown>;
};

/**
 * A universal subtype of all controller instances that extend from `BaseController` (formerly `BaseControllerV2`) or `BaseControllerV1`.
 * Any `BaseController` or `BaseControllerV1` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseController` and `BaseControllerV1` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 */
export type WalletComponentInstance =
  | BaseControllerV1Instance
  | BaseControllerInstance
  | MessengerConsumerInstance;

export type ControllerInstance = Exclude<
  WalletComponentInstance,
  MessengerConsumerInstance
>;

/**
 * The narrowest supertype of all `RestrictedControllerMessenger` instances.
 */
export type RestrictedControllerMessengerConstraint<
  ControllerName extends string = string,
> = RestrictedControllerMessenger<
  ControllerName,
  ActionConstraint,
  EventConstraint,
  string,
  string
>;

/**
 * Determines if the given class has a messaging system.
 * @param component - Component instance to check
 * @returns True if the component is an instance of `MessengerConsumerInstance`
 */
export function isMessengerConsumer(
  component: WalletComponentInstance,
): component is MessengerConsumerInstance {
  return 'name' in component && 'messagingSystem' in component;
}

/**
 * Determines if the given controller is an instance of `BaseControllerV1`
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of `BaseControllerV1`
 */
export function isBaseControllerV1(
  controller: WalletComponentInstance,
): controller is BaseControllerV1Instance {
  return (
    'name' in controller &&
    typeof controller.name === 'string' &&
    'config' in controller &&
    typeof controller.config === 'object' &&
    'defaultConfig' in controller &&
    typeof controller.defaultConfig === 'object' &&
    'state' in controller &&
    typeof controller.state === 'object' &&
    'defaultState' in controller &&
    typeof controller.defaultState === 'object' &&
    'disabled' in controller &&
    typeof controller.disabled === 'boolean' &&
    'subscribe' in controller &&
    typeof controller.subscribe === 'function' &&
    controller instanceof BaseControllerV1
  );
}

/**
 * Determines if the given controller is an instance of `BaseController`
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of `BaseController`
 */
export function isBaseController(
  controller: WalletComponentInstance,
): controller is BaseControllerInstance {
  return (
    'name' in controller &&
    typeof controller.name === 'string' &&
    'state' in controller &&
    typeof controller.state === 'object' &&
    'metadata' in controller &&
    typeof controller.metadata === 'object' &&
    controller instanceof BaseController
  );
}

/**
 * A universal supertype for the controller state object, encompassing both `BaseControllerV1` and `BaseControllerV2` state.
 */
export type LegacyControllerStateConstraint = BaseState | StateConstraint;

/**
 * A universal supertype for the composable controller state object.
 *
 * This type is only intended to be used for disabling the generic constraint on the `ControllerState` type argument in the `BaseController` type as a temporary solution for ensuring compatibility with BaseControllerV1 child controllers.
 * Note that it is unsuitable for general use as a type constraint.
 */
// TODO: Replace with `ComposableControllerStateConstraint` once BaseControllerV2 migrations are completed for all controllers.
type LegacyComposableControllerStateConstraint = {
  // `any` is used here to disable the generic constraint on the `ControllerState` type argument in the `BaseController` type,
  // enabling composable controller state types with BaseControllerV1 state objects to be.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [name: string]: Record<string, any>;
};

/**
 * The narrowest supertype for the composable controller state object.
 * This is also a widest subtype of the 'LegacyComposableControllerStateConstraint' type.
 */
// TODO: Replace with `{ [name: string]: StateConstraint }` once BaseControllerV2 migrations are completed for all controllers.
export type ComposableControllerStateConstraint = {
  [name: string]: LegacyControllerStateConstraint;
};

/**
 * A controller state change event for any controller instance that extends from either `BaseControllerV1` or `BaseControllerV2`.
 */
// TODO: Replace all instances with `ControllerStateChangeEvent` once `BaseControllerV2` migrations are completed for all controllers.
type LegacyControllerStateChangeEvent<
  ControllerName extends string,
  ControllerState extends LegacyControllerStateConstraint,
> = {
  type: `${ControllerName}:stateChange`;
  payload: [ControllerState, Patch[]];
};

export type ComposableControllerStateChangeEvent<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = LegacyControllerStateChangeEvent<
  typeof controllerName,
  ComposableControllerState
>;

export type ComposableControllerEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ComposableControllerStateChangeEvent<ComposableControllerState>;

type ChildControllerStateChangeEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ComposableControllerState extends Record<
  infer ControllerName extends string,
  infer ControllerState
>
  ? ControllerState extends StateConstraint
    ? ControllerStateChangeEvent<ControllerName, ControllerState>
    : ControllerState extends Record<string, unknown>
    ? LegacyControllerStateChangeEvent<ControllerName, ControllerState>
    : never
  : never;

type AllowedEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ChildControllerStateChangeEvents<ComposableControllerState>;

export type ComposableControllerMessenger<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = RestrictedControllerMessenger<
  typeof controllerName,
  never,
  | ComposableControllerEvents<ComposableControllerState>
  | AllowedEvents<ComposableControllerState>,
  never,
  AllowedEvents<ComposableControllerState>['type']
>;

/**
 * Controller that can be used to compose multiple controllers together.
 * @template ChildControllerState - The composed state of the child controllers that are being used to instantiate the composable controller.
 */
export class ComposableController<
  ComposableControllerState extends LegacyComposableControllerStateConstraint,
  ChildControllers extends WalletComponentInstance,
> extends BaseController<
  typeof controllerName,
  ComposableControllerState,
  ComposableControllerMessenger<ComposableControllerState>
> {
  /**
   * Creates a ComposableController instance.
   *
   * @param options - Initial options used to configure this controller
   * @param options.controllers - List of child controller instances to compose.
   * @param options.messenger - A restricted controller messenger.
   */

  constructor({
    controllers,
    messenger,
  }: {
    controllers: ChildControllers[];
    messenger: ComposableControllerMessenger<ComposableControllerState>;
  }) {
    if (messenger === undefined) {
      throw new Error(`Messaging system is required`);
    }

    super({
      name: controllerName,
      metadata: controllers.reduce<StateMetadata<ComposableControllerState>>(
        (metadata, controller) => ({
          ...metadata,
          [controller.name]: isBaseController(controller)
            ? controller.metadata
            : { persist: true, anonymous: true },
        }),
        {} as never,
      ),
      state: controllers.reduce<ComposableControllerState>(
        (state, controller) => {
          return 'state' in controller
            ? { ...state, [controller.name]: controller.state }
            : state;
        },
        {} as never,
      ),
      messenger,
    });

    controllers.forEach((controller) =>
      this.#updateChildController(controller),
    );
  }

  /**
   * Constructor helper that subscribes to child controller state changes.
   * @param component - Wallet component instance to update
   */
  #updateChildController(component: WalletComponentInstance): void {
    const { name } = component;
    if (
      isBaseController(component) ||
      (isBaseControllerV1(component) && isMessengerConsumer(component))
    ) {
      this.messagingSystem.subscribe(
        `${name}:stateChange`,
        (childState: StateConstraint | (BaseState & object)) => {
          this.update((state) => {
            Object.assign(state, { [name]: childState });
          });
        },
      );
    } else if (isBaseControllerV1(component)) {
      component.subscribe((childState: BaseState & object) => {
        this.update((state) => {
          Object.assign(state, { [name]: childState });
        });
      });
    } else if (!isMessengerConsumer(component)) {
      throw new Error(
        'Invalid component: component must be a MessengerConsumer or a controller inheriting from BaseControllerV1.',
      );
    }
  }
}

export default ComposableController;
