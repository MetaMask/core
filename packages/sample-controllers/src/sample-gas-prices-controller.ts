import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { SampleGasPricesControllerMethodActions } from './sample-gas-prices-controller-method-action-types';
import type { SampleGasPricesServiceFetchGasPricesAction } from './sample-gas-prices-service/sample-gas-prices-service-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link SampleGasPricesController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'SampleGasPricesController';

// === STATE ===

/**
 * The collection of gas price data fetched periodically.
 */
type GasPrices = {
  /**
   * The total estimated gas in the "low" bucket.
   */
  low: number;
  /**
   * The total estimated gas in the "average" bucket.
   */
  average: number;
  /**
   * The total estimated gas in the "high" bucket.
   */
  high: number;
  /**
   * The date/time (in ISO-8601 format) when prices were fetched.
   */
  fetchedDate: string;
};

/**
 * Describes the shape of the state object for {@link SampleGasPricesController}.
 */
export type SampleGasPricesControllerState = {
  /**
   * Fetched gas prices categorized by chain ID.
   */
  gasPricesByChainId: {
    [chainId: Hex]: GasPrices;
  };
};

/**
 * The metadata for each property in {@link SampleGasPricesControllerState}.
 */
const gasPricesControllerMetadata = {
  gasPricesByChainId: {
    persist: true,
    anonymous: false,
  },
} satisfies StateMetadata<SampleGasPricesControllerState>;

/**
 * Constructs the default {@link SampleGasPricesController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link SampleGasPricesController} state.
 */
export function getDefaultSampleGasPricesControllerState(): SampleGasPricesControllerState {
  return {
    gasPricesByChainId: {},
  };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['updateGasPrices'] as const;

/**
 * Retrieves the state of the {@link SampleGasPricesController}.
 */
export type SampleGasPricesControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SampleGasPricesControllerState
>;

/**
 * Actions that {@link SampleGasPricesMessenger} exposes to other consumers.
 */
export type SampleGasPricesControllerActions =
  | SampleGasPricesControllerGetStateAction
  | SampleGasPricesControllerMethodActions;

/**
 * Actions from other messengers that {@link SampleGasPricesMessenger} calls.
 */
type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | SampleGasPricesServiceFetchGasPricesAction;

/**
 * Published when the state of {@link SampleGasPricesController} changes.
 */
export type SampleGasPricesControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SampleGasPricesControllerState
  >;

/**
 * Events that {@link SampleGasPricesMessenger} exposes to other consumers.
 */
export type SampleGasPricesControllerEvents =
  SampleGasPricesControllerStateChangeEvent;

/**
 * Events from other messengers that {@link SampleGasPricesMessenger} subscribes
 * to.
 */
type AllowedEvents = NetworkControllerStateChangeEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link SampleGasPricesController}.
 */
export type SampleGasPricesControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  SampleGasPricesControllerActions | AllowedActions,
  SampleGasPricesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

// === CONTROLLER DEFINITION ===

/**
 * `SampleGasPricesController` fetches and persists gas prices for various chains.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/base-controller';
 * import type {
 *   NetworkControllerActions,
 *   NetworkControllerEvents
 * } from '@metamask/network-controller';
 * import type {
 *   SampleGasPricesControllerActions,
 *   SampleGasPricesControllerEvents
 * } from '@metamask/example-controllers';
 * import {
 *   SampleGasPricesController,
 *   SampleGasPricesService,
 *   selectGasPrices,
 * } from '@metamask/example-controllers';
 *
 * const globalMessenger = new Messenger<
 *  SampleGasPricesServiceActions
 *  | SampleGasPricesControllerActions
 *  | NetworkControllerActions
 *  SampleGasPricesServiceEvents
 *  | SampleGasPricesControllerEvents
 *  | NetworkControllerEvents
 * >();
 * const gasPricesServiceMessenger = globalMessenger.getRestricted({
 *   name: 'SampleGasPricesService',
 *   allowedActions: [],
 *   allowedEvents: [],
 * });
 * // Instantiate the service to register its actions on the messenger
 * new SampleGasPricesService({
 *   messenger: gasPricesServiceMessenger,
 *   // We assume you're using this in the browser.
 *   fetch,
 * });
 * const gasPricesControllerMessenger = globalMessenger.getRestricted({
 *   name: 'SampleGasPricesController',
 *   allowedActions: ['NetworkController:getNetworkClientById'],
 *   allowedEvents: ['NetworkController:stateChange'],
 * });
 * // Instantiate the controller to register its actions on the messenger
 * new SampleGasPricesController({
 *   messenger: gasPricesControllerMessenger,
 * });
 *
 * // Later...
 * await globalMessenger.call(
 *   'SampleGasPricesController:updateGasPrices',
 *   { chainId: '0x42' },
 * );
 * const gasPricesControllerState = await globalMessenger.call(
 *   'SampleGasPricesController:getState',
 * );
 * gasPricesControllerState.gasPricesByChainId
 * // => { '0x42': { low: 5, average: 10, high: 15, fetchedDate: '2024-01-02T00:00:00.000Z' } }
 * ```
 */
export class SampleGasPricesController extends BaseController<
  typeof controllerName,
  SampleGasPricesControllerState,
  SampleGasPricesControllerMessenger
> {
  /**
   * The globally selected chain ID.
   */
  #selectedChainId: Hex | undefined;

  /**
   * Constructs a new {@link SampleGasPricesController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: SampleGasPricesControllerMessenger;
    state?: Partial<SampleGasPricesControllerState>;
  }) {
    super({
      messenger,
      metadata: gasPricesControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultSampleGasPricesControllerState(),
        ...state,
      },
    });

    this.messagingSystem.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      this.#onSelectedNetworkClientIdChange.bind(this),
      (networkControllerState) =>
        networkControllerState.selectedNetworkClientId,
    );
  }

  /**
   * Fetches the latest gas prices for the given chain and persists them to
   * state.
   *
   * @param args - The arguments to the function.
   * @param args.chainId - The chain ID for which to fetch gas prices.
   */
  async updateGasPrices({ chainId }: { chainId: Hex }) {
    const gasPricesResponse = await this.messagingSystem.call(
      'SampleGasPricesService:fetchGasPrices',
      chainId,
    );

    this.update((state) => {
      state.gasPricesByChainId[chainId] = {
        ...gasPricesResponse,
        fetchedDate: new Date().toISOString(),
      };
    });
  }

  /**
   * Callback to call when the globally selected network client ID changes,
   * ensuring that gas prices get updated.
   *
   * @param selectedNetworkClientId - The globally selected network client ID.
   */
  async #onSelectedNetworkClientIdChange(
    selectedNetworkClientId: NetworkClientId,
  ) {
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );

    if (chainId !== this.#selectedChainId) {
      this.#selectedChainId = chainId;
      await this.updateGasPrices({ chainId });
    }
  }
}
