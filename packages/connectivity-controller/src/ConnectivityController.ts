import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

/**
 * The name of the {@link ConnectivityController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'ConnectivityController';

/**
 * Describes the shape of the state object for {@link ConnectivityController}.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ConnectivityControllerState = {
  // Empty state - to be implemented
};

/**
 * The metadata for each property in {@link ConnectivityControllerState}.
 */
const connectivityControllerMetadata =
  {} satisfies StateMetadata<ConnectivityControllerState>;

/**
 * Constructs the default {@link ConnectivityController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link ConnectivityController} state.
 */
export function getDefaultConnectivityControllerState(): ConnectivityControllerState {
  return {};
}

/**
 * Retrieves the state of the {@link ConnectivityController}.
 */
export type ConnectivityControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ConnectivityControllerState
>;

/**
 * Actions that {@link ConnectivityControllerMessenger} exposes to other consumers.
 */
export type ConnectivityControllerActions =
  ConnectivityControllerGetStateAction;

/**
 * Actions from other messengers that {@link ConnectivityControllerMessenger} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link ConnectivityController} changes.
 */
export type ConnectivityControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ConnectivityControllerState
>;

/**
 * Events that {@link ConnectivityControllerMessenger} exposes to other consumers.
 */
export type ConnectivityControllerEvents =
  ConnectivityControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ConnectivityControllerMessenger} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ConnectivityController}.
 */
export type ConnectivityControllerMessenger = Messenger<
  typeof controllerName,
  ConnectivityControllerActions | AllowedActions,
  ConnectivityControllerEvents | AllowedEvents
>;

/**
 * `ConnectivityController` manages connectivity for the application.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   ConnectivityControllerActions,
 *   ConnectivityControllerEvents,
 * } from '@metamask/connectivity-controller';
 * import { ConnectivityController } from '@metamask/connectivity-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   ConnectivityControllerActions,
 *   ConnectivityControllerEvents
 * >({ namespace: 'Root' });
 * const connectivityControllerMessenger = new Messenger<
 *   'ConnectivityController',
 *   ConnectivityControllerActions,
 *   ConnectivityControllerEvents,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'ConnectivityController',
 *   parent: rootMessenger,
 * });
 * // Instantiate the controller to register its actions on the messenger
 * new ConnectivityController({
 *   messenger: connectivityControllerMessenger,
 * });
 *
 * const connectivityControllerState = await rootMessenger.call(
 *   'ConnectivityController:getState',
 * );
 * ```
 */
export class ConnectivityController extends BaseController<
  typeof controllerName,
  ConnectivityControllerState,
  ConnectivityControllerMessenger
> {
  /**
   * Constructs a new {@link ConnectivityController}.
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
    messenger: ConnectivityControllerMessenger;
    state?: Partial<ConnectivityControllerState>;
  }) {
    super({
      messenger,
      metadata: connectivityControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultConnectivityControllerState(),
        ...state,
      },
    });
  }
}
