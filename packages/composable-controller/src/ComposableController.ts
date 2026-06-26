import type {
  StateConstraint,
  StateMetadata,
  StateMetadataConstraint,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  BaseControllerInstance as ControllerInstance,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

export const controllerName = 'ComposableController';

export const INVALID_CONTROLLER_ERROR =
  'Invalid controller: controller must inherit from `BaseController`.';

/**
 * The narrowest supertype for the composable controller state object.
 */
export type ComposableControllerStateConstraint = {
  [controllerName: string]: StateConstraint;
};

/**
 * The `getState` action type for the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerGetStateAction<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ControllerGetStateAction<typeof controllerName, ComposableControllerState>;

/**
 * The `stateChange` event type for the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerStateChangeEvent<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ControllerStateChangeEvent<
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
 * A union type of action types available to the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerActions<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ComposableControllerGetStateAction<ComposableControllerState>;

/**
 * A utility type that extracts controllers from the {@link ComposableControllerState} type,
 * and derives a union type of all of their corresponding `stateChange` events.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ChildControllerStateChangeEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> =
  ComposableControllerState extends Record<
    infer ChildControllerName extends string,
    infer ChildControllerState extends StateConstraint
  >
    ? ControllerStateChangeEvent<ChildControllerName, ChildControllerState>
    : never;

/**
 * A union type of external event types available to the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type AllowedEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = ChildControllerStateChangeEvents<ComposableControllerState>;

/**
 * The messenger of the {@link ComposableController}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerMessenger<
  ComposableControllerState extends ComposableControllerStateConstraint,
> = Messenger<
  typeof controllerName,
  ComposableControllerActions<ComposableControllerState>,
  | ComposableControllerEvents<ComposableControllerState>
  | AllowedEvents<ComposableControllerState>
>;

/**
 * Controller that composes multiple child controllers and maintains up-to-date composed state.
 *
 * @template ComposableControllerState - A type object containing the names and state types of the child controllers.
 * @template ChildControllersMap - A type object that specifies the child controllers which are used to instantiate the {@link ComposableController}.
 */
export class ComposableController<
  ComposableControllerState extends ComposableControllerStateConstraint,
  ChildControllersMap extends Record<
    keyof ComposableControllerState,
    ControllerInstance
  >,
> extends BaseController<
  typeof controllerName,
  ComposableControllerState,
  ComposableControllerMessenger<ComposableControllerState>
> {
  /**
   * Creates a ComposableController instance.
   *
   * @param options - Initial options used to configure this controller
   * @param options.controllers - An object that contains child controllers keyed by their names.
   * @param options.messenger - A controller messenger.
   */
  constructor({
    controllers,
    messenger,
  }: {
    controllers: ChildControllersMap;
    messenger: ComposableControllerMessenger<ComposableControllerState>;
  }) {
    if (messenger === undefined) {
      throw new Error(`Messaging system is required`);
    }

    super({
      name: controllerName,
      // This reduce operation intentionally reuses its output object. This provides a significant performance benefit over returning a new object on each iteration.
      metadata: Object.keys(controllers).reduce<
        StateMetadata<ComposableControllerState>
      >((metadata, name) => {
        (metadata as StateMetadataConstraint)[name] = {
          includeInStateLogs: false,
          persist: true,
          includeInDebugSnapshot: true,
          usedInUi: false,
        };
        return metadata;
      }, {} as never),
      // This reduce operation intentionally reuses its output object. This provides a significant performance benefit over returning a new object on each iteration.
      state: Object.values(controllers).reduce<ComposableControllerState>(
        (state, controller) => {
          // Type assertion is necessary for property assignment to a generic type. This does not pollute or widen the type of the asserted variable.
          (state as ComposableControllerStateConstraint)[controller.name] =
            controller.state;
          return state;
        },
        {} as never,
      ),
      messenger,
    });

    Object.values(controllers).forEach((controller) => {
      this.#updateChildController(controller);
    });
  }

  /**
   * Constructor helper that subscribes to child controller state changes.
   *
   * @param controller - Controller instance to update
   */
  #updateChildController(controller: ControllerInstance): void {
    const { name } = controller;
    if (!isBaseController(controller)) {
      try {
        delete this.metadata[name];
        delete this.state[name];
        // eslint-disable-next-line no-empty
      } catch {}
      throw new Error(`${name} - ${INVALID_CONTROLLER_ERROR}`);
    }
    try {
      this.messenger.subscribe<
        // The type intersection with "ComposableController:stateChange" is added by one of the `Messenger.subscribe` overloads, but that constraint is unnecessary here,
        // since this method only subscribes the messenger to child controller `stateChange` events.
        // @ts-expect-error "Type '`${string}:stateChange`' is not assignable to parameter of type '"ComposableController:stateChange" & ChildControllerStateChangeEvents<ComposableControllerState>["type"]'."
        ChildControllerStateChangeEvents<ComposableControllerState>['type']
      >(`${name}:stateChange`, (childState: StateConstraint) => {
        this.update((state) => {
          // Type assertion is necessary for property assignment to a generic type. This does not pollute or widen the type of the asserted variable.
          // @ts-expect-error "Type instantiation is excessively deep"
          (state as ComposableControllerStateConstraint)[name] = childState;
        });
      });
    } catch (error: unknown) {
      console.error(`${name} - ${String(error)}`);
    }
  }
}

/**
 * Determines if the given controller is an instance of `BaseController`
 *
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of `BaseController`
 */
function isBaseController(
  controller: unknown,
): controller is ControllerInstance {
  return (
    typeof controller === 'object' &&
    controller !== null &&
    'name' in controller &&
    typeof controller.name === 'string' &&
    'state' in controller &&
    typeof controller.state === 'object' &&
    'metadata' in controller &&
    typeof controller.metadata === 'object'
  );
}

export default ComposableController;
