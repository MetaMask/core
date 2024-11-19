import type {
  RestrictedControllerMessenger,
  StateConstraint,
  StateConstraintV1,
  StateMetadata,
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

/**
 * A universal supertype for modules with a 'string'-type `name` property.
 * This type is intended to encompass controller and non-controller input that can be passed into the {@link ComposableController} `controllers` constructor option.
 */
export type NamedModule = { name: string };

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
  [controllerName: string]: Record<string, any>;
};

/**
 * The narrowest supertype for the composable controller state object.
 * This is also a widest subtype of the 'LegacyComposableControllerStateConstraint' type.
 */
// TODO: Replace with `{ [name: string]: StateConstraint }` once BaseControllerV2 migrations are completed for all controllers.
export type ComposableControllerStateConstraint = {
  [controllerName: string]: LegacyControllerStateConstraint;
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
 * @template ComposableControllerState - A type object containing the names and state types of the child controllers. Any non-controllers with empty state should be omitted from this type argument.
 * @template ChildControllers - A union type of the child controllers being used to instantiate the {@link ComposableController}. Non-controllers that are passed into the `controllers` constructor option at runtime should be included in this type argument.
 */
export class ComposableController<
  ComposableControllerState extends LegacyComposableControllerStateConstraint,
  ChildControllers extends NamedModule,
> extends BaseController<
  typeof controllerName,
  ComposableControllerState,
  ComposableControllerMessenger<ComposableControllerState>
> {
  /**
   * Creates a ComposableController instance.
   *
   * @param options - Initial options used to configure this controller
   * @param options.controllers - List of child controller instances to compose. Any non-controllers that are included here will be excluded from the composed state object and from `stateChange` event subscription.
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
        (metadata, controller) =>
          Object.assign(
            metadata,
            // Overriding for better readability
            // eslint-disable-next-line no-nested-ternary
            isBaseController(controller)
              ? { [controller.name]: controller.metadata }
              : isBaseControllerV1(controller)
              ? { [controller.name]: { persist: true, anonymous: true } }
              : {},
          ),
        {} as never,
      ),
      state: controllers.reduce<ComposableControllerState>(
        (state, controller) =>
          Object.assign(
            state,
            isBaseController(controller) || isBaseControllerV1(controller)
              ? { [controller.name]: controller.state }
              : {},
          ),
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
   *
   * @param controller - Controller instance to update
   */
  #updateChildController(controller: ChildControllers): void {
    if (!isBaseController(controller) && !isBaseControllerV1(controller)) {
      return;
    }
    const { name } = controller;
    try {
      this.messagingSystem.subscribe(
        `${name}:stateChange`,
        (childState: LegacyControllerStateConstraint) => {
          this.update((state) => {
            Object.assign(state, { [name]: childState });
          });
        },
      );
      // Invalid/non-existent event names from V1 controllers and non-controllers are expected, and should be handled without blocking ComposableController instantiation in downstream clients.
      // eslint-disable-next-line no-empty
    } catch (error: unknown) {}
    if (isBaseControllerV1(controller)) {
      controller.subscribe((childState) => {
        this.update((state) => {
          Object.assign(state, { [name]: childState });
        });
      });
    }
  }
}

export default ComposableController;
