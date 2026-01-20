import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

/**
 * The name of the {@link PerpsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'PerpsController';

/**
 * Describes the shape of the state object for {@link PerpsController}.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type PerpsControllerState = {
  // Empty state - to be implemented in future PRs
};

/**
 * The metadata for each property in {@link PerpsControllerState}.
 */
const perpsControllerMetadata =
  {} satisfies StateMetadata<PerpsControllerState>;

/**
 * Constructs the default {@link PerpsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link PerpsController} state.
 */
export function getDefaultPerpsControllerState(): PerpsControllerState {
  return {};
}

/**
 * Retrieves the state of the {@link PerpsController}.
 */
export type PerpsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PerpsControllerState
>;

/**
 * Actions that {@link PerpsControllerMessenger} exposes to other consumers.
 */
export type PerpsControllerActions = PerpsControllerGetStateAction;

/**
 * Actions from other messengers that {@link PerpsControllerMessenger} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link PerpsController} changes.
 */
export type PerpsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PerpsControllerState
>;

/**
 * Events that {@link PerpsControllerMessenger} exposes to other consumers.
 */
export type PerpsControllerEvents = PerpsControllerStateChangeEvent;

/**
 * Events from other messengers that {@link PerpsControllerMessenger} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link PerpsController}.
 */
export type PerpsControllerMessenger = Messenger<
  typeof controllerName,
  PerpsControllerActions | AllowedActions,
  PerpsControllerEvents | AllowedEvents
>;

/**
 * `PerpsController` manages perpetual trading functionality in MetaMask.
 *
 * This controller provides platform-agnostic perps trading capabilities.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   PerpsControllerActions,
 *   PerpsControllerEvents,
 * } from '@metamask/perps-controller';
 * import { PerpsController } from '@metamask/perps-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   PerpsControllerActions,
 *   PerpsControllerEvents
 * >({ namespace: 'Root' });
 * const perpsControllerMessenger = new Messenger<
 *   'PerpsController',
 *   PerpsControllerActions,
 *   PerpsControllerEvents,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'PerpsController',
 *   parent: rootMessenger,
 * });
 * // Instantiate the controller to register its actions on the messenger
 * new PerpsController({
 *   messenger: perpsControllerMessenger,
 * });
 *
 * const perpsControllerState = await rootMessenger.call(
 *   'PerpsController:getState',
 * );
 * ```
 */
export class PerpsController extends BaseController<
  typeof controllerName,
  PerpsControllerState,
  PerpsControllerMessenger
> {
  /**
   * Constructs a new {@link PerpsController}.
   *
   * @param args - The arguments to this controller.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: PerpsControllerMessenger;
    state?: Partial<PerpsControllerState>;
  }) {
    super({
      messenger,
      metadata: perpsControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultPerpsControllerState(),
        ...state,
      },
    });
  }
}
