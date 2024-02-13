import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type {
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';

export const controllerName = 'ComposableController';

/*
 * This type encompasses controllers based on either BaseControllerV1 or
 * BaseController. The BaseController type can't be included directly
 * because the generic parameters it expects require knowing the exact state
 * shape, so instead we look for an object with the BaseController properties
 * that we use in the ComposableController (name and state).
 */
type ControllerInstance =
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseControllerV1<any, any> | { name: string; state: Record<string, unknown> };

/**
 * List of child controller instances
 */
export type ControllerList = ControllerInstance[];

/**
 * Determines if the given controller is an instance of BaseControllerV1
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of BaseControllerV1
 */
function isBaseControllerV1(
  controller: ControllerInstance,
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): controller is BaseControllerV1<any, any> {
  return controller instanceof BaseControllerV1;
}

export type ComposableControllerState = {
  [name: string]: ControllerInstance['state'];
};

export type ComposableControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ComposableControllerState
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
  readonly #controllers: ControllerList = [];

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
      state: controllers.reduce((state, controller) => {
        return { ...state, [controller.name]: controller.state };
      }, {} as ComposableControllerState),
      messenger,
    });

    this.#controllers = controllers;
    this.#controllers.forEach((controller) =>
      this.#updateChildController(controller),
    );
  }

  /**
   * Adds a child controller instance to composable controller state,
   * or updates the state of a child controller.
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
    } else {
      this.messagingSystem.subscribe(
        `${String(name)}:stateChange`,
        (childState: Record<string, unknown>) => {
          this.update((state) => ({
            ...state,
            [name]: childState,
          }));
        },
      );
    }
  }
}

export default ComposableController;
