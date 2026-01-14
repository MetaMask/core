import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import { CONNECTIVITY_STATUSES } from './types';
import type { ConnectivityService, ConnectivityStatus } from './types';

/**
 * The name of the {@link ConnectivityController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'ConnectivityController';

/**
 * State for the {@link ConnectivityController}.
 */
export type ConnectivityControllerState = {
  /**
   * The current device connectivity status.
   * Named with 'connectivity' prefix to avoid conflicts when state is flattened in Redux.
   */
  connectivityStatus: ConnectivityStatus;
};

/**
 * The metadata for each property in {@link ConnectivityControllerState}.
 */
const connectivityControllerMetadata = {
  connectivityStatus: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
} satisfies StateMetadata<ConnectivityControllerState>;

/**
 * Constructs the default {@link ConnectivityController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link ConnectivityController} state.
 */
export function getDefaultConnectivityControllerState(): ConnectivityControllerState {
  return {
    connectivityStatus: CONNECTIVITY_STATUSES.Online,
  };
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
 * Options for constructing the {@link ConnectivityController}.
 */
export type ConnectivityControllerOptions = {
  /**
   * The messenger for inter-controller communication.
   */
  messenger: ConnectivityControllerMessenger;

  /**
   * Connectivity service for platform-specific detection.
   *
   * The controller subscribes to the service's `onConnectivityChange`
   * callback to receive connectivity updates.
   *
   * Platform implementations:
   * - Mobile: Use `NetInfoConnectivityService` with `@react-native-community/netinfo`
   * - Extension (same context): Use `BrowserConnectivityService`
   * - Extension (cross-context): Use `PassiveConnectivityService` and call
   * `setStatus()` from the UI context
   */
  connectivityService: ConnectivityService;
};

/**
 * ConnectivityController stores the device's internet connectivity status.
 *
 * This controller is platform-agnostic and designed to be used across different
 * MetaMask clients (extension, mobile). It requires a `ConnectivityService` to
 * be injected, which provides platform-specific connectivity detection.
 *
 * The controller subscribes to the service's `onConnectivityChange` callback
 * and updates its state accordingly. All connectivity updates flow through
 * the service, ensuring a single source of truth.
 *
 * **Platform implementations:**
 *
 * - **Mobile:** Inject `NetInfoConnectivityService` using `@react-native-community/netinfo`
 * - **Extension:** Inject `PassiveConnectivityService` in the background.
 * Status is updated via the `setDeviceConnectivityStatus` API, which is called from:
 * - MV3: Offscreen document (where browser events work reliably)
 * - MV2: Background page (where browser events work directly)
 *
 * This controller provides a centralized state for connectivity status,
 * enabling the UI and other controllers to adapt when the user goes offline.
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
   * @param args.connectivityService - The connectivity service to use.
   */
  constructor({
    messenger,
    connectivityService,
  }: ConnectivityControllerOptions) {
    const initialStatus = connectivityService.getStatus();

    super({
      messenger,
      metadata: connectivityControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultConnectivityControllerState(),
        connectivityStatus: initialStatus,
      },
    });

    connectivityService.onConnectivityChange((status) => {
      this.update((draftState) => {
        draftState.connectivityStatus = status;
      });
    });
  }
}
