import type {
  RestrictedMessenger,
  StateConstraint,
  StateMetadata,
  StateMetadataConstraint,
  ControllerStateChangeEvent,
  BaseControllerInstance as ControllerInstance,
} from '@metamask/base-controller';
import { BaseController, isBaseController } from '@metamask/base-controller';

export const controllerName = 'ComposableController';

export const INVALID_CONTROLLER_ERROR =
  'Invalid controller: controller must have a `messagingSystem` and inherit from `BaseController`.';

/**
 * The narrowest supertype for the composable controller state object.
 */
export type ComposableControllerStateConstraint = {
  [controllerName: string]: StateConstraint;
};

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
 * A utility type that extracts controllers from the {@link ComposableControllerState} type,
 * and derives a union type of all of their corresponding `stateChange` events.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ChildControllerStateChangeEvents<
  ComposableControllerState extends ComposableControllerStateConstraint,
> =
  ComposableControllerState extends Record<
    infer ControllerName extends string,
    infer ControllerState
  >
    ? ControllerState extends StateConstraint
      ? ControllerStateChangeEvent<ControllerName, ControllerState>
      : never
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
> = RestrictedMessenger<
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
   * @param options.messenger - A restricted messenger.
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
          persist: true,
          anonymous: true,
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
      } catch (_) {}
      // False negative. `name` is a string type.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`${name} - ${INVALID_CONTROLLER_ERROR}`);
    }
    try {
      this.messagingSystem.subscribe(
        // False negative. `name` is a string type.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${name}:stateChange`,
        (childState: StateConstraint) => {
          this.update((state) => {
            // Type assertion is necessary for property assignment to a generic type. This does not pollute or widen the type of the asserted variable.
            (state as ComposableControllerStateConstraint)[name] = childState;
          });
        },
      );
    } catch (error: unknown) {
      // False negative. `name` is a string type.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.error(`${name} - ${String(error)}`);
    }
  }
}

export default ComposableController;
