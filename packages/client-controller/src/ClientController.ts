import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { ClientControllerMethodActions } from './ClientController-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link ClientController}.
 */
export const controllerName = 'ClientController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link ClientController}.
 */
export type ClientControllerState = {
  /**
   * Whether the user has opened at least one window or screen
   * containing the MetaMask UI. These windows or screens may or
   * may not be in an inactive state.
   */
  isUiOpen: boolean;
};

/**
 * Constructs the default {@link ClientController} state.
 *
 * @returns The default {@link ClientController} state.
 */
export function getDefaultClientControllerState(): ClientControllerState {
  return {
    isUiOpen: false,
  };
}

/**
 * The metadata for each property in {@link ClientControllerState}.
 */
const controllerMetadata = {
  isUiOpen: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: false,
  },
} satisfies StateMetadata<ClientControllerState>;

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['setUiOpen'] as const;

/**
 * Retrieves the state of the {@link ClientController}.
 */
export type ClientControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ClientControllerState
>;

/**
 * Actions that {@link ClientController} exposes.
 */
export type ClientControllerActions =
  | ClientControllerGetStateAction
  | ClientControllerMethodActions;

/**
 * Actions from other messengers that {@link ClientController} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link ClientController} changes.
 */
export type ClientControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ClientControllerState
>;

/**
 * Events that {@link ClientController} exposes.
 */
export type ClientControllerEvents = ClientControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ClientController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger for {@link ClientController}.
 */
export type ClientControllerMessenger = Messenger<
  typeof controllerName,
  ClientControllerActions | AllowedActions,
  ClientControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * The options for constructing a {@link ClientController}.
 */
export type ClientControllerOptions = {
  /**
   * The messenger suited for this controller.
   */
  messenger: ClientControllerMessenger;
  /**
   * The initial state to set on this controller.
   */
  state?: Partial<ClientControllerState>;
};

/**
 * `ClientController` manages the application lifecycle state.
 *
 * This controller tracks whether the MetaMask UI is open and publishes state
 * change events that other controllers can subscribe to for adjusting their behavior.
 *
 * **Use cases:**
 * - Polling controllers can pause when the UI closes, resume when it opens
 * - WebSocket connections can disconnect when closed, reconnect when opened
 * - Real-time subscriptions can pause when not visible
 *
 * **Platform Integration:**
 * Platform code should call `ClientController:setUiOpen` via messenger.
 *
 * @example
 * ```typescript
 * // In MetamaskController or platform code
 * onUiOpened() {
 *   // ...
 *   this.controllerMessenger.call('ClientController:setUiOpen', true);
 * }
 *
 * onUiClosed() {
 *   // ...
 *   this.controllerMessenger.call('ClientController:setUiOpen', false);
 * }
 *
 * // Consumer controller subscribing to state changes
 * class MyController extends BaseController {
 *   constructor({ messenger }) {
 *     super({ messenger, ... });
 *
 *     messenger.subscribe(
 *       'ClientController:stateChange',
 *       (isClientOpen) => {
 *         if (isClientOpen) {
 *           this.resumePolling();
 *         } else {
 *           this.pausePolling();
 *         }
 *       },
 *       clientControllerSelectors.selectIsUiOpen,
 *     );
 *   }
 * }
 * ```
 */
export class ClientController extends BaseController<
  typeof controllerName,
  ClientControllerState,
  ClientControllerMessenger
> {
  /**
   * Constructs a new {@link ClientController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - The initial state to set on this controller.
   */
  constructor({ messenger, state = {} }: ClientControllerOptions) {
    super({
      messenger,
      metadata: controllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultClientControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Updates state with whether the MetaMask UI is open.
   *
   * This method should be called when the user has opened the first window or
   * screen containing the MetaMask UI, or closed the last window or screen
   * containing the MetaMask UI.
   *
   * @param open - Whether the MetaMask UI is open.
   */
  setUiOpen(open: boolean): void {
    this.update((state) => {
      state.isUiOpen = open;
    });
  }
}
