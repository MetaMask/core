import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

// === GENERAL ===

/**
 * The name of the {@link ClientStateController}.
 */
export const controllerName = 'ClientStateController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link ClientStateController}.
 */
export type ClientStateControllerState = {
  /**
   * Whether the client (UI) is currently open.
   */
  isClientOpen: boolean;
};

/**
 * Constructs the default {@link ClientStateController} state.
 *
 * @returns The default {@link ClientStateController} state.
 */
export function getDefaultClientStateControllerState(): ClientStateControllerState {
  return {
    isClientOpen: false,
  };
}

/**
 * The metadata for each property in {@link ClientStateControllerState}.
 */
const controllerMetadata = {
  isClientOpen: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: false,
  },
} satisfies StateMetadata<ClientStateControllerState>;

// === MESSENGER ===

/**
 * Retrieves the state of the {@link ClientStateController}.
 */
export type ClientStateControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ClientStateControllerState
>;

/**
 * Sets whether the client (UI) is open.
 */
export type ClientStateControllerSetClientOpenAction = {
  type: `${typeof controllerName}:setClientOpen`;
  handler: (open: boolean) => void;
};

/**
 * Actions that {@link ClientStateController} exposes.
 */
export type ClientStateControllerActions =
  | ClientStateControllerGetStateAction
  | ClientStateControllerSetClientOpenAction;

/**
 * Actions from other messengers that {@link ClientStateController} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link ClientStateController} changes.
 */
export type ClientStateControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    ClientStateControllerState
  >;

/**
 * Events that {@link ClientStateController} exposes.
 */
export type ClientStateControllerEvents =
  ClientStateControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ClientStateController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger for {@link ClientStateController}.
 */
export type ClientStateControllerMessenger = Messenger<
  typeof controllerName,
  ClientStateControllerActions | AllowedActions,
  ClientStateControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * The options for constructing a {@link ClientStateController}.
 */
export type ClientStateControllerOptions = {
  /**
   * The messenger suited for this controller.
   */
  messenger: ClientStateControllerMessenger;
  /**
   * The initial state to set on this controller.
   */
  state?: Partial<ClientStateControllerState>;
};

/**
 * `ClientStateController` manages the application lifecycle state.
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
 * Platform code should call `ClientStateController:setClientOpen` via messenger.
 *
 * @example
 * ```typescript
 * // In MetamaskController or platform code
 * set isClientOpen(open) {
 *   this.controllerMessenger.call('ClientStateController:setClientOpen', open);
 * }
 *
 * // Consumer controller subscribing to state changes
 * class MyController extends BaseController {
 *   constructor({ messenger }) {
 *     super({ messenger, ... });
 *
 *     messenger.subscribe(
 *       'ClientStateController:stateChange',
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
export class ClientStateController extends BaseController<
  typeof controllerName,
  ClientStateControllerState,
  ClientStateControllerMessenger
> {
  /**
   * Constructs a new {@link ClientStateController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - The initial state to set on this controller.
   */
  constructor({ messenger, state = {} }: ClientStateControllerOptions) {
    super({
      messenger,
      metadata: controllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultClientStateControllerState(),
        ...state,
      },
    });

    // Register the setClientOpen action
    this.messenger.registerActionHandler(
      `${controllerName}:setClientOpen`,
      this.setClientOpen.bind(this),
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
  setClientOpen(open: boolean): void {
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
 * @param state - The ClientStateController state.
 * @returns True if the client is open.
 */
export function selectIsClientOpen(
  state: ClientStateControllerState,
): boolean {
  return state.isClientOpen;
}
