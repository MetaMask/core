import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

/**
 * The name of the {@link AssetsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'AssetsController';

// TODO: Implement AssetsController - the goal is to split and consolidate the old one
// This controller will consolidate asset tracking functionality including:
// - Account balance tracking
// - Token balance tracking
// - Asset detection

/**
 * Describes the shape of the state object for {@link AssetsController}.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AssetsControllerState = {
  // Empty state - to be implemented
};

/**
 * The metadata for each property in {@link AssetsControllerState}.
 */
const assetsControllerMetadata =
  {} satisfies StateMetadata<AssetsControllerState>;

/**
 * Constructs the default {@link AssetsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link AssetsController} state.
 */
export function getDefaultAssetsControllerState(): AssetsControllerState {
  return {};
}

/**
 * Retrieves the state of the {@link AssetsController}.
 */
export type AssetsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AssetsControllerState
>;

/**
 * Actions that {@link AssetsControllerMessenger} exposes to other consumers.
 */
export type AssetsControllerActions = AssetsControllerGetStateAction;

/**
 * Actions from other messengers that {@link AssetsControllerMessenger} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link AssetsController} changes.
 */
export type AssetsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AssetsControllerState
>;

/**
 * Events that {@link AssetsControllerMessenger} exposes to other consumers.
 */
export type AssetsControllerEvents = AssetsControllerStateChangeEvent;

/**
 * Events from other messengers that {@link AssetsControllerMessenger} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link AssetsController}.
 */
export type AssetsControllerMessenger = Messenger<
  typeof controllerName,
  AssetsControllerActions | AllowedActions,
  AssetsControllerEvents | AllowedEvents
>;

/**
 * `AssetsController` manages asset tracking for accounts.
 *
 * This controller is a placeholder for future consolidation of asset tracking
 * functionality including account balances, token balances, and asset detection.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   AssetsControllerActions,
 *   AssetsControllerEvents,
 * } from '@metamask/assets-controller';
 * import { AssetsController } from '@metamask/assets-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   AssetsControllerActions,
 *   AssetsControllerEvents
 * >({ namespace: 'Root' });
 * const assetsControllerMessenger = new Messenger<
 *   'AssetsController',
 *   AssetsControllerActions,
 *   AssetsControllerEvents,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'AssetsController',
 *   parent: rootMessenger,
 * });
 * // Instantiate the controller to register its actions on the messenger
 * new AssetsController({
 *   messenger: assetsControllerMessenger,
 * });
 *
 * const assetsControllerState = await rootMessenger.call(
 *   'AssetsController:getState',
 * );
 * ```
 */
export class AssetsController extends BaseController<
  typeof controllerName,
  AssetsControllerState,
  AssetsControllerMessenger
> {
  /**
   * Constructs a new {@link AssetsController}.
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
    messenger: AssetsControllerMessenger;
    state?: Partial<AssetsControllerState>;
  }) {
    super({
      messenger,
      metadata: assetsControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultAssetsControllerState(),
        ...state,
      },
    });
  }
}
