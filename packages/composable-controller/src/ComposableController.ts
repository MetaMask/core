import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type {
  BaseState,
  BaseConfig,
  RestrictedControllerMessenger,
  StateMetadata,
  StateConstraint,
} from '@metamask/base-controller';
import type { Patch } from 'immer';

export const controllerName = 'ComposableController';

/**
 * A type encompassing all controller instances that extend from `BaseControllerV1`.
 */
export type BaseControllerV1Instance =
  // `any` is used to include all `BaseControllerV1` instances.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseControllerV1<any, any>;

/**
 * A type encompassing all controller instances that extend from `BaseController` (formerly `BaseControllerV2`).
 *
 * The `BaseController` class itself can't be used directly as a type representing all of its subclasses,
 * because the generic parameters it expects require knowing the exact shape of the controller's state and messenger.
 *
 * Instead, we look for an object with the `BaseController` properties that we use in the ComposableController (name and state).
 *
 * Note that this type is not sufficiently type-safe for general use, and is only intended for use within the ComposableController.
 */
export type BaseControllerInstance = {
  name: string;
  state: StateConstraint;
};

/**
 * A type encompassing all controller instances that extend from `BaseControllerV1` or `BaseController`.
 *
 * Note that this type is not sufficiently type-safe for general use, and is only intended for use within the ComposableController.
 */
export type ControllerInstance =
  | BaseControllerV1Instance
  | BaseControllerInstance;

/**
 * Determines if the given controller is an instance of BaseControllerV1
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of BaseControllerV1
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
 * Determines if the given controller is an instance of BaseController
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of BaseController
 */
export function isBaseController(
  controller: ControllerInstance,
): controller is BaseController<never, never, never> {
  return (
    'name' in controller &&
    typeof controller.name === 'string' &&
    'state' in controller &&
    typeof controller.state === 'object' &&
    controller instanceof BaseController
  );
}

// TODO: Replace `any` with `Json` once `BaseControllerV2` migrations are completed for all controllers.
export type ComposableControllerState = {
  // `any` is used here to disable the `BaseController` type constraint which expects state properties to extend `Record<string, Json>`.
  // `ComposableController` state needs to accommodate `BaseControllerV1` state objects that may have properties wider than `Json`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [name: string]: Record<string, any>;
};

export type ComposableControllerStateChangeEvent = {
  type: `${typeof controllerName}:stateChange`;
  payload: [ComposableControllerState, Patch[]];
};

export type ComposableControllerEvents = ComposableControllerStateChangeEvent;

type AnyControllerStateChangeEvent = {
  type: `${string}:stateChange`;
  payload: [ControllerInstance['state'], Patch[]];
};

type AllowedEvents = AnyControllerStateChangeEvent;

export type ComposableControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  never,
  ComposableControllerEvents | AllowedEvents,
  never,
  AllowedEvents['type']
>;

/**
 * Controller that can be used to compose multiple controllers together.
 */
export class ComposableController extends BaseController<
  typeof controllerName,
  ComposableControllerState,
  ComposableControllerMessenger
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
    controllers: ControllerInstance[];
    messenger: ComposableControllerMessenger;
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
        {},
      ),
      state: controllers.reduce<ComposableControllerState>(
        (state, controller) => {
          return { ...state, [controller.name]: controller.state };
        },
        {},
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
    if (isBaseControllerV1(controller)) {
      controller.subscribe((childState) => {
        this.update((state) => {
          Object.assign(state, { [name]: childState });
        });
      });
    }
    if (
      (isBaseControllerV1(controller) && 'messagingSystem' in controller) ||
      isBaseController(controller)
    ) {
      this.messagingSystem.subscribe(
        `${name}:stateChange`,
        (childState: Record<string, unknown>) => {
          this.update((state) => {
            Object.assign(state, { [name]: childState });
          });
        },
      );
    }
  }
}

export default ComposableController;
