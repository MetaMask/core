import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { UiStateControllerMethodActions } from './UiStateController-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link UiStateController}.
 */
export const controllerName = 'UiStateController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link UiStateController}.
 */
export type UiStateControllerState = {
  /**
   * Whether the user has opened at least one window or screen
   * containing the MetaMask UI. These windows or screens may or
   * may not be in an inactive state.
   */
  isUiOpen: boolean;
};

/**
 * Constructs the default {@link UiStateController} state.
 *
 * @returns The default {@link UiStateController} state.
 */
export function getDefaultUiStateControllerState(): UiStateControllerState {
  return {
    isUiOpen: false,
  };
}

/**
 * The metadata for each property in {@link UiStateControllerState}.
 */
const controllerMetadata = {
  isUiOpen: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: false,
    usedInUi: false,
  },
} satisfies StateMetadata<UiStateControllerState>;

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['setUiOpen'] as const;

/**
 * Retrieves the state of the {@link UiStateController}.
 */
export type UiStateControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  UiStateControllerState
>;

/**
 * Actions that {@link UiStateController} exposes.
 */
export type UiStateControllerActions =
  | UiStateControllerGetStateAction
  | UiStateControllerMethodActions;

/**
 * Actions from other messengers that {@link UiStateController} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link UiStateController} changes.
 */
export type UiStateControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  UiStateControllerState
>;

/**
 * Events that {@link UiStateController} exposes.
 */
export type UiStateControllerEvents = UiStateControllerStateChangeEvent;

/**
 * Events from other messengers that {@link UiStateController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger for {@link UiStateController}.
 */
export type UiStateControllerMessenger = Messenger<
  typeof controllerName,
  UiStateControllerActions | AllowedActions,
  UiStateControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * The options for constructing a {@link UiStateController}.
 */
export type UiStateControllerOptions = {
  /**
   * The messenger suited for this controller.
   */
  messenger: UiStateControllerMessenger;
  /**
   * The initial state to set on this controller.
   */
  state?: Partial<UiStateControllerState>;
};

/**
 * `UiStateController` manages the application lifecycle state.
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
 * Platform code should call `UiStateController:setUiOpen` via messenger.
 *
 * @example
 * ```typescript
 * // In MetamaskController or platform code
 * onUiOpened() {
 *   // ...
 *   this.controllerMessenger.call('UiStateController:setUiOpen', true);
 * }
 *
 * onUiClosed() {
 *   // ...
 *   this.controllerMessenger.call('UiStateController:setUiOpen', false);
 * }
 *
 * // Consumer controller subscribing to state changes
 * class MyController extends BaseController {
 *   constructor({ messenger }) {
 *     super({ messenger, ... });
 *
 *     messenger.subscribe(
 *       'UiStateController:stateChange',
 *       (isClientOpen) => {
 *         if (isClientOpen) {
 *           this.resumePolling();
 *         } else {
 *           this.pausePolling();
 *         }
 *       },
 *       uiStateControllerSelectors.selectIsUiOpen,
 *     );
 *   }
 * }
 * ```
 */
export class UiStateController extends BaseController<
  typeof controllerName,
  UiStateControllerState,
  UiStateControllerMessenger
> {
  /**
   * Constructs a new {@link UiStateController}.
   *
   * @param options - The constructor options.
   * @param options.messenger - The messenger suited for this controller.
   * @param options.state - The initial state to set on this controller.
   */
  constructor({ messenger, state = {} }: UiStateControllerOptions) {
    super({
      messenger,
      metadata: controllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultUiStateControllerState(),
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
    if (this.state.isUiOpen !== open) {
      this.update((state) => {
        state.isUiOpen = open;
      });
    }
  }
}
