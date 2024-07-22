import type { ActionConstraint, BaseConfig, BaseState, EventConstraint, RestrictedControllerMessenger, StateConstraint, ControllerStateChangeEvent } from '@metamask/base-controller';
import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type { PublicInterface } from '@metamask/utils';
import type { Patch } from 'immer';
export declare const controllerName = "ComposableController";
export declare const INVALID_CONTROLLER_ERROR = "Invalid controller: controller must have a `messagingSystem` or be a class inheriting from `BaseControllerV1`.";
/**
 * A universal supertype for the `BaseControllerV1` state object.
 */
type ConfigConstraintV1 = BaseConfig & object;
/**
 * A universal supertype for the `BaseControllerV1` state object.
 */
type StateConstraintV1 = BaseState & object;
/**
 * A universal subtype of all controller instances that extend from `BaseControllerV1`.
 * Any `BaseControllerV1` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseControllerV1` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 */
type BaseControllerV1Instance = PublicInterface<BaseControllerV1<ConfigConstraintV1, StateConstraintV1>>;
/**
 * A universal subtype of all controller instances that extend from `BaseController` (formerly `BaseControllerV2`).
 * Any `BaseController` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseController` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 *
 * For this reason, we only look for `BaseController` properties that we use in the ComposableController (name and state).
 */
type BaseControllerInstance = {
    name: string;
    state: StateConstraint;
    metadata: Record<string, unknown>;
};
/**
 * A universal subtype of all controller instances that extend from `BaseController` (formerly `BaseControllerV2`) or `BaseControllerV1`.
 * Any `BaseController` or `BaseControllerV1` instance can be assigned to this type.
 *
 * Note that this type is not the widest subtype or narrowest supertype of all `BaseController` and `BaseControllerV1` instances.
 * This type is therefore unsuitable for general use as a type constraint, and is only intended for use within the ComposableController.
 */
type ControllerInstance = BaseControllerV1Instance | BaseControllerInstance;
/**
 * The narrowest supertype of all `RestrictedControllerMessenger` instances.
 *
 * @template ControllerName - Name of the controller.
 * Optionally can be used to narrow the type to a specific controller.
 */
export type RestrictedControllerMessengerConstraint<ControllerName extends string = string> = RestrictedControllerMessenger<ControllerName, ActionConstraint, EventConstraint, string, string>;
/**
 * Determines if the given controller is an instance of `BaseControllerV1`
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of `BaseControllerV1`
 */
export declare function isBaseControllerV1(controller: ControllerInstance): controller is BaseControllerV1Instance;
/**
 * Determines if the given controller is an instance of `BaseController`
 * @param controller - Controller instance to check
 * @returns True if the controller is an instance of `BaseController`
 */
export declare function isBaseController(controller: ControllerInstance): controller is BaseControllerInstance;
/**
 * A universal supertype for the controller state object, encompassing both `BaseControllerV1` and `BaseControllerV2` state.
 */
export type LegacyControllerStateConstraint = StateConstraintV1 | StateConstraint;
/**
 * A universal supertype for the composable controller state object.
 *
 * This type is only intended to be used for disabling the generic constraint on the `ControllerState` type argument in the `BaseController` type as a temporary solution for ensuring compatibility with BaseControllerV1 child controllers.
 * Note that it is unsuitable for general use as a type constraint.
 */
type LegacyComposableControllerStateConstraint = {
    [name: string]: Record<string, any>;
};
/**
 * The narrowest supertype for the composable controller state object.
 * This is also a widest subtype of the 'LegacyComposableControllerStateConstraint' type.
 */
export type ComposableControllerStateConstraint = {
    [name: string]: LegacyControllerStateConstraint;
};
/**
 * A `stateChange` event for any controller instance that extends from either `BaseControllerV1` or `BaseControllerV2`.
 */
type LegacyControllerStateChangeEvent<ControllerName extends string, ControllerState extends StateConstraintV1> = {
    type: `${ControllerName}:stateChange`;
    payload: [ControllerState, Patch[]];
};
/**
 * The `stateChange` event type for the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerStateChangeEvent<ComposableControllerState extends ComposableControllerStateConstraint> = LegacyControllerStateChangeEvent<typeof controllerName, ComposableControllerState>;
/**
 * A union type of internal event types available to the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerEvents<ComposableControllerState extends ComposableControllerStateConstraint> = ComposableControllerStateChangeEvent<ComposableControllerState>;
/**
 * A utility type that extracts controllers from the {@link ComposableControllerState} type,
 * and derives a union type of all of their corresponding `stateChange` events.
 *
 * This type can handle both `BaseController` and `BaseControllerV1` controller instances.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ChildControllerStateChangeEvents<ComposableControllerState extends ComposableControllerStateConstraint> = ComposableControllerState extends Record<infer ControllerName extends string, infer ControllerState> ? ControllerState extends StateConstraint ? ControllerStateChangeEvent<ControllerName, ControllerState> : ControllerState extends StateConstraintV1 ? LegacyControllerStateChangeEvent<ControllerName, ControllerState> : never : never;
/**
 * A union type of external event types available to the {@link ComposableControllerMessenger}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
type AllowedEvents<ComposableControllerState extends ComposableControllerStateConstraint> = ChildControllerStateChangeEvents<ComposableControllerState>;
/**
 * The messenger of the {@link ComposableController}.
 *
 * @template ComposableControllerState - A type object that maps controller names to their state types.
 */
export type ComposableControllerMessenger<ComposableControllerState extends ComposableControllerStateConstraint> = RestrictedControllerMessenger<typeof controllerName, never, ComposableControllerEvents<ComposableControllerState> | AllowedEvents<ComposableControllerState>, never, AllowedEvents<ComposableControllerState>['type']>;
/**
 * Controller that composes multiple child controllers and maintains up-to-date composed state.
 *
 * @template ComposableControllerState - A type object containing the names and state types of the child controllers.
 * @template ChildControllers - A union type of the child controllers being used to instantiate the {@link ComposableController}.
 */
export declare class ComposableController<ComposableControllerState extends LegacyComposableControllerStateConstraint, ChildControllers extends ControllerInstance> extends BaseController<typeof controllerName, ComposableControllerState, ComposableControllerMessenger<ComposableControllerState>> {
    #private;
    /**
     * Creates a ComposableController instance.
     *
     * @param options - Initial options used to configure this controller
     * @param options.controllers - List of child controller instances to compose.
     * @param options.messenger - A restricted controller messenger.
     */
    constructor({ controllers, messenger, }: {
        controllers: ChildControllers[];
        messenger: ComposableControllerMessenger<ComposableControllerState>;
    });
}
export default ComposableController;
//# sourceMappingURL=ComposableController.d.ts.map