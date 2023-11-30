import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
  BaseControllerV1,
} from '@metamask/base-controller';

const controllerName = 'ComposableController';

/*
 * This type encompasses controllers based up either BaseControllerV1 or
 * BaseController. The BaseController type can't be included directly
 * because the generic parameters it expects require knowing the exact state
 * shape, so instead we look for an object with the BaseController properties
 * that we use in the ComposableController (name and state).
 */
type ControllerInstance =
  | BaseControllerV1<any, any>
  | { name: string; state: Record<string, unknown> };

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
): controller is BaseControllerV1<any, any> {
  return 'subscribe' in controller && controller.subscribe !== undefined;
}

export type ComposableControllerState = {
  [name: string]: ControllerInstance['state'];
};

export type ComposableControllerGetStateAction = ControllerGetStateAction<
  `${typeof controllerName}`,
  ComposableControllerState
>;

export type ComposableControllerStateChangeEvent = ControllerStateChangeEvent<
  `${typeof controllerName}`,
  ComposableControllerState
>;

export type ComposableControllerActions = ComposableControllerGetStateAction;

export type ComposableControllerEvents = ComposableControllerStateChangeEvent;

export type ComposableControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  ControllerGetStateAction<string, Record<string, unknown>>,
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
   * @param controllers - List of controller instances.
   * @param messenger - The controller messaging system, used for communicating with BaseController controllers.
   */

  constructor({
    controllers,
    messenger,
  }: {
    controllers: ControllerList;
    messenger: ComposableControllerMessenger;
  }) {
    if (messenger === undefined) {
      throw new Error(
        `Messaging system required if any BaseController controllers are used`,
      );
    }

    super({
      name: controllerName,
      metadata: {},
      state: controllers.reduce((state, controller) => {
        state[controller.name] = controller.state;
        return state;
      }, {} as ComposableControllerState),
      messenger,
    });

    this.#controllers = controllers;
    this.#controllers.forEach((controller) =>
      this.#updateChildController(controller),
    );
  }

  /**
   * Flat state representation, one that isn't keyed
   * of controller name. Instead, all child controller state is merged
   * together into a single, flat object.
   *
   * @returns Merged state representation of all child controllers.
   */
  get flatState() {
    let flatState = {};
    for (const controller of this.#controllers) {
      flatState = { ...flatState, ...controller.state };
    }
    return flatState;
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
