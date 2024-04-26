import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';

const controllerName = 'ChainController';

export type ChainControllerState = {
  dummy: string;
};

export type ChainControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ChainControllerState
>;

export type AllowedActions = never;

export type ChainControllerActions = never;

export type ChainControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ChainControllerState
>;

export type AllowedEvents = ChainControllerEvents;

export type ChainControllerEvents = ChainControllerChangeEvent;

export type ChainControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  ChainControllerActions | AllowedActions,
  ChainControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

const defaultState: ChainControllerState = {
  dummy: '',
};

/**
 * Controller that manages chain-agnostic providers throught the chain API.
 */
export class ChainController extends BaseController<
  typeof controllerName,
  ChainControllerState,
  ChainControllerMessenger
> {
  /**
   * Constructor for ChainController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: ChainControllerMessenger;
    state: ChainControllerState;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: {
        dummy: {
          persist: false,
          anonymous: false,
        },
      },
      state: {
        ...defaultState,
        ...state,
      },
    });

    this.#registerMessageHandlers();
  }

  /**
   * Registers message handlers for the ChainController.
   * @private
   */
  #registerMessageHandlers() {
    // TODO
  }
}
