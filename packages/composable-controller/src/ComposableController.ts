import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type {
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
  BaseState,
  BaseConfig,
} from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

export const controllerName = 'ComposableController';

/*
 * This type encompasses controllers based on either BaseControllerV1 or
 * BaseController. The BaseController type can't be included directly
 * because the generic parameters it expects require knowing the exact state
 * shape, so instead we look for an object with the BaseController properties
 * that we use in the ComposableController (name and state).
 */
type ControllerInstance =
  // As explained above, `any` is used to include all `BaseControllerV1` instances.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseControllerV1<any, any> | { name: string; state: Record<string, Json> };

/**
 * List of child controller instances
 */
export type ControllerList = ControllerInstance[];

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

export type ComposableControllerState = {
  // `any` is used here to disable the `BaseController` type constraint which expects state properties to extend `Record<string, Json>`.
  // `ComposableController` state needs to accommodate `BaseControllerV1` state objects that may have properties wider than `Json`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [name: string]: Record<string, any>;
};

export type ComposableControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  Record<string, Json | (BaseState & Record<string, unknown>)>
>;

export type ComposableControllerEvents = ComposableControllerStateChangeEvent;

export type ComposableControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  never,
  ControllerStateChangeEvent<string, Record<string, unknown>>,
  string,
  string
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
    controllers: ControllerList;
    messenger: ComposableControllerMessenger;
  }) {
    if (messenger === undefined) {
      throw new Error(`Messaging system is required`);
    }

    super({
      name: controllerName,
      metadata: {},
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
   * Constructor helper that adds a child controller instance to composable controller state
   * and subscribes to child controller state changes.
   * @param controller - Controller instance to update
   */
  #updateChildController(controller: ControllerInstance): void {
    const { name } = controller;
    if (isBaseControllerV1(controller)) {
      controller.subscribe((childState) => {
        this.update((state) => ({
          ...state,
          [name]: childState,
        }));
      });
    } else if (isBaseController(controller)) {
      this.messagingSystem.subscribe(`${name}:stateChange`, (childState) => {
        this.update((state) => ({
          ...state,
          [name]: childState,
        }));
      });
    } else {
      throw new Error(
        'Invalid controller: controller must extend from BaseController or BaseControllerV1',
      );
    }
  }
}

export default ComposableController;
