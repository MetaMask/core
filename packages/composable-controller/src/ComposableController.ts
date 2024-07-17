import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type {
  ActionConstraint,
  BaseConfig,
  BaseState,
  EventConstraint,
  RestrictedControllerMessenger,
  StateConstraint,
  StateMetadata,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { PublicInterface } from '@metamask/utils';
import type { Patch } from 'immer';

export const controllerName = 'ComposableController';
/**
 * A universal supertype for the `BaseControllerV1` state object.
 */
type ConfigConstraintV1 = BaseConfig & object;

/**
 * A universal supertype for the `BaseControllerV1` state object.
 */
type StateConstraintV1 = BaseState & object;

/**
 * A universal subtype of all controller instances that extend from `BaseControllerV1`.
 * Any `BaseControllerV1` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseControllerV1` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 */
type BaseControllerV1Instance = PublicInterface<
  BaseControllerV1<ConfigConstraintV1, StateConstraintV1>
>;

/**
 * A universal subtype of all controller instances that extend from `BaseController` (formerly `BaseControllerV2`).
 * Any `BaseController` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseController` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 *
 * For this reason, we only look for `BaseController` properties that we use in the ComposableController (name and state).
 */
type BaseControllerInstance = {
  name: string;
  state: StateConstraint;
  metadata: Record<string, unknown>;
};

/**
 * A universal subtype of all controller instances that extend from `BaseController` (formerly `BaseControllerV2`) or `BaseControllerV1`.
 * Any `BaseController` or `BaseControllerV1` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseController` and `BaseControllerV1` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 */
export type ControllerInstance =
  | BaseControllerV1Instance
  | BaseControllerInstance;

/**
 * The narrowest supertype of all `RestrictedControllerMessenger` instances.
 *
 * @template ControllerName - Name of the controller.
 * Optionally can be used to narrow the type to a specific controller.
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
 * Determines if the given controller is an instance of `BaseControllerV1`
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of `BaseControllerV1`
 */
export function isBaseControllerV1(
  controller: ControllerInstance,
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
  controller: ControllerInstance,
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
export type LegacyControllerStateConstraint =
  | StateConstraintV1
  | StateConstraint;

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
 * A `stateChange` event for any controller instance that extends from either `BaseControllerV1` or `BaseControllerV2`.
 */
// TODO: Replace all instances with `ControllerStateChangeEvent` once `BaseControllerV2` migrations are completed for all controllers.
type LegacyControllerStateChangeEvent<
  ControllerName extends string,
  ControllerState extends StateConstraintV1,
> = {
  type: `${ControllerName}:stateChange`;
  payload: [ControllerState, Patch[]];
};

/**
 * The `stateChange` event type for the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerStateChangeEvent<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = LegacyControllerStateChangeEvent<
  typeof controllerName,
  ComposableControllerState
>;

/**
 * A union type of internal event types available to the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ComposableControllerStateChangeEvent<ComposableControllerState>;

/**
 * A utility type that extracts controllers from the {@link ComposableControllerState} type,
 * and derives a union type of all of their corresponding `stateChange` events.
 *
 * This type can handle both `BaseController` and `BaseControllerV1` controller instances.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ChildControllerStateChangeEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ComposableControllerState extends Record<
  infer ControllerName extends string,
  infer ControllerState
>
  ? ControllerState extends StateConstraint
    ? ControllerStateChangeEvent<ControllerName, ControllerState>
    : // TODO: Remove this conditional branch once `BaseControllerV2` migrations are completed for all controllers.
    ControllerState extends StateConstraintV1
    ? LegacyControllerStateChangeEvent<ControllerName, ControllerState>
    : never
  : never;

/**
 * A union type of external event types available to the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
type AllowedEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ChildControllerStateChangeEvents<ComposableControllerState>;

/**
 * The messenger of the {@link ComposableController}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
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
 * Controller that composes multiple child controllers and maintains up-to-date composed state.
 *
 * @template ComposableControllerState - A type object containing the names and state types of the child controllers.
 * @template ChildControllers - A union type of the child controllers being used to instantiate the {@link ComposableController}.
 */
export class ComposableController<
  ComposableControllerState extends LegacyComposableControllerStateConstraint,
  ChildControllers extends ControllerInstance,
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
          return { ...state, [controller.name]: controller.state };
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
   * @param controller - Controller instance to update
   */
  #updateChildController(controller: ControllerInstance): void {
    if (!isBaseController(controller) && !isBaseControllerV1(controller)) {
      throw new Error(
        'Invalid controller: controller must extend from BaseController or BaseControllerV1',
      );
    }

    const { name } = controller;
    if (
      (isBaseControllerV1(controller) && 'messagingSystem' in controller) ||
      isBaseController(controller)
    ) {
      this.messagingSystem.subscribe(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${name}:stateChange`,
        (childState: Record<string, unknown>) => {
          this.update((state) => {
            Object.assign(state, { [name]: childState });
          });
        },
      );
    } else if (isBaseControllerV1(controller)) {
      controller.subscribe((childState) => {
        this.update((state) => {
          Object.assign(state, { [name]: childState });
        });
      });
    }
  }
}

export default ComposableController;
