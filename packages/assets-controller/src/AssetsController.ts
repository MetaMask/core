import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

// TODO: Implement AssetsController - the goal is to split and consolidate the old one
// This controller will consolidate asset tracking functionality including:
// - Account balance tracking
// - Token balance tracking
// - Asset detection

/**
 * The name of the {@link AssetsController}.
 */
export const controllerName = 'AssetsController';

/**
 * The state of the {@link AssetsController}.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AssetsControllerState = {
  // Empty state - to be implemented
};

/**
 * The action to get the state of the {@link AssetsController}.
 */
export type AssetsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AssetsControllerState
>;

/**
 * The actions that can be performed using the {@link AssetsController}.
 */
export type AssetsControllerActions = AssetsControllerGetStateAction;

/**
 * The event that {@link AssetsController} can emit.
 */
export type AssetsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AssetsControllerState
>;

/**
 * The events that {@link AssetsController} can emit.
 */
export type AssetsControllerEvents = AssetsControllerStateChangeEvent;

/**
 * The messenger of the {@link AssetsController}.
 */
export type AssetsControllerMessenger = Messenger<
  typeof controllerName,
  AssetsControllerActions,
  AssetsControllerEvents
>;

/**
 * The default state of the {@link AssetsController}.
 *
 * @returns The default state.
 */
export const getDefaultAssetsControllerState =
  (): AssetsControllerState => ({});

/**
 * The metadata for the state of the {@link AssetsController}.
 */
const assetsControllerMetadata: StateMetadata<AssetsControllerState> = {};

/**
 * Controller that manages assets tracking.
 *
 * This controller is a placeholder for future consolidation of asset tracking
 * functionality including account balances, token balances, and asset detection.
 */
export class AssetsController extends BaseController<
  typeof controllerName,
  AssetsControllerState,
  AssetsControllerMessenger
> {
  /**
   * Creates an AssetsController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messenger.
   * @param options.state - Initial state to set on this controller.
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
      name: controllerName,
      metadata: assetsControllerMetadata,
      state: {
        ...getDefaultAssetsControllerState(),
        ...state,
      },
    });
  }
}
