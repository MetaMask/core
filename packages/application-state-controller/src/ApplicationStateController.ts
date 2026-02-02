import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

// === GENERAL ===

/**
 * The name of the {@link ApplicationStateController}.
 */
export const controllerName = 'ApplicationStateController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link ApplicationStateController}.
 */
export type ApplicationStateControllerState = {
  /**
   * Whether the client (UI) is currently open.
   */
  isClientOpen: boolean;
};

/**
 * Constructs the default {@link ApplicationStateController} state.
 *
 * @returns The default {@link ApplicationStateController} state.
 */
export function getDefaultApplicationStateControllerState(): ApplicationStateControllerState {
  return {
    isClientOpen: false,
  };
}

/**
 * The metadata for each property in {@link ApplicationStateControllerState}.
 */
const controllerMetadata = {
  isClientOpen: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: false,
  },
} satisfies StateMetadata<ApplicationStateControllerState>;

// === MESSENGER ===

/**
 * Retrieves the state of the {@link ApplicationStateController}.
 */
export type ApplicationStateControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ApplicationStateControllerState
>;

/**
 * Sets whether the client (UI) is open.
 */
export type ApplicationStateControllerSetClientStateAction = {
  type: `${typeof controllerName}:setClientState`;
  handler: (open: boolean) => void;
};

/**
 * Actions that {@link ApplicationStateController} exposes.
 */
export type ApplicationStateControllerActions =
  | ApplicationStateControllerGetStateAction
  | ApplicationStateControllerSetClientStateAction;

/**
 * Actions from other messengers that {@link ApplicationStateController} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link ApplicationStateController} changes.
 */
export type ApplicationStateControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    ApplicationStateControllerState
  >;

/**
 * Events that {@link ApplicationStateController} exposes.
 */
export type ApplicationStateControllerEvents =
  ApplicationStateControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ApplicationStateController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger for {@link ApplicationStateController}.
 */
export type ApplicationStateControllerMessenger = Messenger<
  typeof controllerName,
  ApplicationStateControllerActions | AllowedActions,
  ApplicationStateControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * The options for constructing an {@link ApplicationStateController}.
 */
export type ApplicationStateControllerOptions = {
  /**
   * The messenger suited for this controller.
   */
  messenger: ApplicationStateControllerMessenger;
  /**
   * The initial state to set on this controller.
   */
  state?: Partial<ApplicationStateControllerState>;
};

/**
 * `ApplicationStateController` manages the application lifecycle state.
 *
 * This controller tracks whether the client (UI) is open and publishes state
 * change events that other controllers can subscribe to for adjusting their behavior.
 *
 * **Use cases:**
 * - Polling controllers can stop when client closes, start when it opens
 * - WebSocket connections can disconnect when closed, reconnect when opened
 * - Real-time subscriptions can pause when not visible
 *
 * **Platform Integration:**
 * Platform code should call `ApplicationStateController:setClientState` via messenger.
 *
 * @example
 * ```typescript
 * // In MetamaskController or platform code
 * set isClientOpen(open) {
 *   this.controllerMessenger.call('ApplicationStateController:setClientState', open);
 * }
 *
 * // Consumer controller subscribing to state changes
 * class MyController extends BaseController {
 *   constructor({ messenger }) {
 *     super({ messenger, ... });
 *
 *     messenger.subscribe(
 *       'ApplicationStateController:stateChange',
 *       (newState) => {
 *         if (newState.isClientOpen) {
 *           this.startPolling();
 *         } else {
 *           this.stopPolling();
 *         }
 *       },
 *     );
 *   }
 * }
 * ```
 */
export class ApplicationStateController extends BaseController<
  typeof controllerName,
  ApplicationStateControllerState,
  ApplicationStateControllerMessenger
> {
  /**
   * Constructs a new {@link ApplicationStateController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - The initial state to set on this controller.
   */
  constructor({ messenger, state = {} }: ApplicationStateControllerOptions) {
    super({
      messenger,
      metadata: controllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultApplicationStateControllerState(),
        ...state,
      },
    });

    // Register the setClientState action
    this.messenger.registerActionHandler(
      `${controllerName}:setClientState`,
      this.setClientState.bind(this),
    );
  }

  /**
   * Sets whether the client (UI) is open.
   *
   * This method should be called via messenger when the UI opens or closes.
   * State changes trigger the standard `stateChange` event that other controllers
   * can subscribe to.
   *
   * @param open - Whether the client is open.
   */
  setClientState(open: boolean): void {
    if (this.state.isClientOpen !== open) {
      this.update((state) => {
        state.isClientOpen = open;
      });
    }
  }

  /**
   * Returns whether the client is currently open.
   *
   * @returns True if the client is open.
   */
  get isClientOpen(): boolean {
    return this.state.isClientOpen;
  }
}

// === SELECTORS ===

/**
 * Selects whether the client is currently open.
 *
 * @param state - The ApplicationStateController state.
 * @returns True if the client is open.
 */
export function selectIsClientOpen(
  state: ApplicationStateControllerState,
): boolean {
  return state.isClientOpen;
}
