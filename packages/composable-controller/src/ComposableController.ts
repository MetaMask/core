import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type {
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
  BaseState,
  BaseConfig,
  EventConstraint,
  StateMetadata,
} from '@metamask/base-controller';
import { isValidJson, type Json } from '@metamask/utils';

export const controllerName = 'ComposableController';

/*
 * The following three types encompass controllers based on either BaseControllerV1 or
 * BaseController. The BaseController type can't be included directly
 * because the generic parameters it expects require knowing the exact state
 * shape, so instead we look for an object with the BaseController properties
 * that we use in the ComposableController (name and state).
 */
// As explained above, `any` is used to include all `BaseControllerV1` instances.
// TODO: Remove this type once `BaseControllerV2` migrations are completed for all controllers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BaseControllerV1Instance = BaseControllerV1<any, any>;

type BaseControllerV2Instance = { name: string; state: Record<string, Json> };

type ControllerInstance =
  // As explained above, `any` is used to include all `BaseControllerV1` instances.
  // TODO: Remove `BaseControllerV1Instance` once `BaseControllerV2` migrations are completed for all controllers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseControllerV1Instance | BaseControllerV2Instance;

/**
 * Determines if the given controller is an instance of BaseControllerV1
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of BaseControllerV1
 * TODO: Deprecate once `BaseControllerV2` migrations are completed for all controllers.
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
  // TODO: Replace `any` with `Json` once `BaseControllerV2` migrations are completed for all controllers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [name: string]: Record<string, any>;
};

export type ComposableControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  Record<string, unknown>
>;

export type ComposableControllerEvents = ComposableControllerStateChangeEvent;

type AnyControllerStateChangeEvent = ControllerStateChangeEvent<
  string,
  Record<string, unknown>
>;

type AllowedEvents = AnyControllerStateChangeEvent;

export type ComposableControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  never,
  ComposableControllerEvents | AllowedEvents,
  never,
  AllowedEvents['type']
>;

type GetStateChangeEventsUnion<Controller extends ControllerInstance> =
  Controller extends ControllerInstance
    ? Controller extends BaseControllerV2Instance
      ? ControllerStateChangeEvent<Controller['name'], Controller['state']>
      : never
    : never;

/**
 * Controller that can be used to compose multiple controllers together.
 */
export class ComposableController<
  ChildControllers extends ControllerInstance,
  ComposedControllerState extends ComposableControllerState = {
    [P in ChildControllers as P['name']]: P extends ControllerInstance
      ? P['state']
      : never;
  },
  ComposedControllerStateChangeEvent extends EventConstraint & {
    type: `${typeof controllerName}:stateChange`;
  } = ControllerStateChangeEvent<
    typeof controllerName,
    ComposedControllerState
  >,
  ChildControllersStateChangeEvents extends EventConstraint & {
    type: `${string}:stateChange`;
  } = GetStateChangeEventsUnion<ChildControllers>,
  ComposedControllerMessenger extends ComposableControllerMessenger = RestrictedControllerMessenger<
    typeof controllerName,
    never,
    ComposedControllerStateChangeEvent | ChildControllersStateChangeEvents,
    never,
    ChildControllersStateChangeEvents['type']
  >,
> extends BaseController<
  typeof controllerName,
  ComposedControllerState,
  ComposedControllerMessenger
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
    messenger: ComposedControllerMessenger;
  }) {
    if (messenger === undefined) {
      throw new Error(`Messaging system is required`);
    }

    super({
      name: controllerName,
      metadata: controllers.reduce<StateMetadata<ComposedControllerState>>(
        (metadata, controller) => ({
          ...metadata,
          [controller.name]: isBaseController(controller)
            ? controller.metadata
            : { persist: true, anonymous: true },
        }),
        {} as never,
      ),
      state: controllers.reduce<ComposedControllerState>(
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
   * TODO: Remove `isBaseControllerV1` branch once `BaseControllerV2` migrations are completed for all controllers.
   */
  #updateChildController(controller: ControllerInstance): void {
    const { name } = controller;
    if (isBaseControllerV1(controller)) {
      controller.subscribe((childState) => {
        this.update(
          (state) =>
            ({
              ...state,
              [name]: childState,
            } as ComposedControllerState),
        );
      });
    } else if (isBaseController(controller)) {
      this.messagingSystem.subscribe(`${name}:stateChange`, (childState) => {
        if (isValidJson(childState)) {
          this.update(
            (state) =>
              ({
                ...state,
                [name]: childState,
              } as ComposedControllerState),
          );
        }
      });
    } else {
      throw new Error(
        'Invalid controller: controller must extend from BaseController or BaseControllerV1',
      );
    }
  }
}

export default ComposableController;
