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
import type { Patch } from 'immer';

export const controllerName = 'ComposableController';

/**
 * A universal subtype of all controller instances that extend from `BaseControllerV1`.
 * Any `BaseControllerV1` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseControllerV1` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 */
export type BaseControllerV1Instance =
  // `any` is used so that all `BaseControllerV1` instances are assignable to this type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseControllerV1<any, any>;

/**
 * A universal subtype of all controller instances that extend from `BaseController` (formerly `BaseControllerV2`).
 * Any `BaseController` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseController` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 *
 * For this reason, we only look for `BaseController` properties that we use in the ComposableController (name and state).
 */
export type BaseControllerInstance = {
  name: string;
  state: StateConstraint;
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
 */
export type RestrictedControllerMessengerConstraint =
  RestrictedControllerMessenger<
    string,
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
): controller is BaseControllerV1<
  BaseConfig & Record<string, unknown>,
  BaseState & Record<string, unknown>
> {
  return (
    'name' in controller &&
    typeof controller.name === 'string' &&
    'defaultConfig' in controller &&
    typeof controller.defaultConfig === 'object' &&
    'defaultState' in controller &&
    typeof controller.defaultState === 'object' &&
    'disabled' in controller &&
    typeof controller.disabled === 'boolean' &&
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
): controller is BaseController<
  string,
  StateConstraint,
  RestrictedControllerMessengerConstraint
> {
  return (
    'name' in controller &&
    typeof controller.name === 'string' &&
    'state' in controller &&
    typeof controller.state === 'object' &&
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

type GetChildControllers<
  ComposableControllerState,
  ControllerName extends keyof ComposableControllerState = keyof ComposableControllerState,
> = ControllerName extends string
  ? ComposableControllerState[ControllerName] extends StateConstraint
    ? { name: ControllerName; state: ComposableControllerState[ControllerName] }
    : BaseControllerV1<
        BaseConfig & Record<string, unknown>,
        BaseState & ComposableControllerState[ControllerName]
      >
  : never;

/**
 * Controller that can be used to compose multiple controllers together.
 * @template ChildControllerState - The composed state of the child controllers that are being used to instantiate the composable controller.
 */
export class ComposableController<
  ComposableControllerState extends LegacyComposableControllerStateConstraint,
  ChildControllers extends ControllerInstance = GetChildControllers<ComposableControllerState>,
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
