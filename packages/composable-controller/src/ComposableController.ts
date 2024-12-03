import type {
  RestrictedControllerMessenger,
  StateConstraint,
  StateConstraintV1,
  StateMetadata,
  StateMetadataConstraint,
  ControllerStateChangeEvent,
  LegacyControllerStateConstraint,
  ControllerInstance,
} from '@metamask/base-controller';
import {
  BaseController,
  isBaseController,
  isBaseControllerV1,
} from '@metamask/base-controller';
import type { Patch } from 'immer';

export const controllerName = 'ComposableController';

export const INVALID_CONTROLLER_ERROR =
  'Invalid controller: controller must have a `messagingSystem` or be a class inheriting from `BaseControllerV1`.';

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
 * @template ChildControllers - A type object that specifies the child controllers which are used to instantiate the {@link ComposableController}.
 */
export class ComposableController<
  ComposableControllerState extends LegacyComposableControllerStateConstraint,
  ChildControllers extends Record<
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
   * @param options.messenger - A restricted controller messenger.
   */
  constructor({
    controllers,
    messenger,
  }: {
    controllers: ChildControllers;
    messenger: ComposableControllerMessenger<ComposableControllerState>;
  }) {
    if (messenger === undefined) {
      throw new Error(`Messaging system is required`);
    }

    super({
      name: controllerName,
      metadata: Object.keys(controllers).reduce<
        StateMetadata<ComposableControllerState>
      >((metadata, name) => {
        (metadata as StateMetadataConstraint)[name] = {
          persist: true,
          anonymous: true,
        };
        return metadata;
      }, {} as never),
      state: Object.values(controllers).reduce<ComposableControllerState>(
        (state, controller) => {
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
    if (!isBaseController(controller) && !isBaseControllerV1(controller)) {
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
        (childState: LegacyControllerStateConstraint) => {
          this.update((state) => {
            (state as ComposableControllerStateConstraint)[name] = childState;
          });
        },
      );
    } catch (error: unknown) {
      // False negative. `name` is a string type.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.error(`${name} - ${String(error)}`);
    }
    if (isBaseControllerV1(controller)) {
      controller.subscribe((childState: StateConstraintV1) => {
        this.update((state) => {
          (state as ComposableControllerStateConstraint)[name] = childState;
        });
      });
    }
  }
}

export default ComposableController;
