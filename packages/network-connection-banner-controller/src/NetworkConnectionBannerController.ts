import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  CONNECTIVITY_STATUSES,
  connectivityControllerSelectors,
} from '@metamask/connectivity-controller';
import type {
  ConnectivityControllerGetStateAction,
  ConnectivityControllerState,
  ConnectivityControllerStateChangeEvent,
} from '@metamask/connectivity-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkConfiguration,
  NetworkControllerGetNetworkConfigurationByChainIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerUpdateNetworkAction,
  NetworkControllerStateChangeEvent,
  NetworkMetadata,
  NetworkState,
} from '@metamask/network-controller';
import { NetworkStatus } from '@metamask/network-controller';
import type {
  NetworkEnablementControllerGetStateAction,
  NetworkEnablementControllerState,
  NetworkEnablementControllerStateChangeEvent,
} from '@metamask/network-enablement-controller';
import { selectEnabledNetworkMap } from '@metamask/network-enablement-controller';
import type { Hex } from '@metamask/utils';
import { KnownCaipNamespace } from '@metamask/utils';
import { createSelector } from 'reselect';

import type { NetworkConnectionBannerControllerMethodActions } from './NetworkConnectionBannerController-method-action-types';
import { getDomain, getIsInfuraEndpoint } from './url-utils';

/**
 * The name of the {@link NetworkConnectionBannerController}, used to namespace
 * the controller's actions and events and to namespace the controller's state
 * data when composed with other controllers.
 */
const CONTROLLER_NAME = 'NetworkConnectionBannerController';

/**
 * Selects `networksMetadata` from the `NetworkController` state.
 *
 * @param state - The `NetworkController` state.
 * @returns The networks metadata map keyed by network client id.
 */
const selectNetworksMetadata = (
  state: NetworkState,
): NetworkState['networksMetadata'] => state.networksMetadata;

/**
 * Selects `networkConfigurationsByChainId` from the `NetworkController`
 * state.
 *
 * @param state - The `NetworkController` state.
 * @returns The network configurations keyed by chain id.
 */
const selectNetworkConfigurationsByChainId = (
  state: NetworkState,
): NetworkState['networkConfigurationsByChainId'] =>
  state.networkConfigurationsByChainId;

/**
 * Selects the `NetworkController` state fields that influence the banner
 * rule. Composed with `createSelector` so the return object stays reference
 * stable while unrelated `NetworkController` state (e.g.
 * `selectedNetworkClientId`) changes.
 *
 * @param state - The `NetworkController` state.
 * @returns The relevant network fields.
 */
const selectNetworkControllerFields = createSelector(
  [selectNetworksMetadata, selectNetworkConfigurationsByChainId],
  (networksMetadata, networkConfigurationsByChainId) => ({
    networksMetadata,
    networkConfigurationsByChainId,
  }),
);

/**
 * Selects the `NetworkEnablementController` state field that influences the
 * banner rule.
 *
 * @param state - The `NetworkEnablementController` state.
 * @returns The relevant enablement fields.
 */
const selectNetworkEnablementControllerFields = createSelector(
  [selectEnabledNetworkMap],
  (enabledNetworkMap) => ({ enabledNetworkMap }),
);

/**
 * Selects the `ConnectivityController` state field that influences the
 * banner rule.
 *
 * @param state - The `ConnectivityController` state.
 * @returns The relevant connectivity fields.
 */
const selectConnectivityControllerFields = createSelector(
  [connectivityControllerSelectors.selectConnectivityStatus],
  (connectivityStatus) => ({ connectivityStatus }),
);

/**
 * Status the banner can be in. `available` means no banner is shown; the
 * `degraded` and `unavailable` values mirror the two-tier escalation that the
 * UI renders.
 */
export type NetworkConnectionBannerStatus =
  | 'available'
  | 'degraded'
  | 'unavailable';

/**
 * A network from `NetworkController` state that has a default RPC endpoint
 * with a known metadata status. Used as the input to the failed-network
 * detection pipeline.
 */
type NetworkWithMetadata = {
  chainId: Hex;
  name: string;
  rpcEndpoints: NetworkConfiguration['rpcEndpoints'];
  defaultRpcEndpointIndex: number;
  defaultRpcEndpoint: NetworkConfiguration['rpcEndpoints'][number];
  metadata: NetworkMetadata;
};

/**
 * Details of a failing network the banner describes.
 */
export type FailedNetwork = {
  /** The chain id of the failing network. */
  chainId: Hex;
  /** The `networkClientId` of the failing default RPC endpoint. */
  networkClientId: string;
  /** The display name for the failing network. */
  name: string;
  /** The URL of the failing default RPC endpoint. */
  rpcUrl: string;
  /** Whether the failing endpoint is a MetaMask Infura endpoint. */
  isInfuraEndpoint: boolean;
  /**
   * The networkClientId of an Infura endpoint on the same chain that the user
   * can switch to. `null` when the failing endpoint is already Infura or when
   * no Infura alternative exists.
   */
  switchableInfuraNetworkClientId: string | null;
  /**
   * The registrable domain (eTLD+1) of `rpcUrl`, used to group endpoints by
   * provider. `null` when the URL is invalid.
   */
  domain: string | null;
};

/**
 * State for the {@link NetworkConnectionBannerController}.
 *
 * The keys carry the controller-domain prefix (like
 * `ConnectivityController`'s `connectivityStatus`) because some clients merge
 * all controller states into one flat object, where generic names like
 * `status` collide across controllers.
 */
export type NetworkConnectionBannerControllerState = {
  networkConnectionBannerStatus: NetworkConnectionBannerStatus;
  networkConnectionBannerNetwork: FailedNetwork | null;
};

const networkConnectionBannerControllerMetadata = {
  networkConnectionBannerStatus: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  networkConnectionBannerNetwork: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
} satisfies StateMetadata<NetworkConnectionBannerControllerState>;

/**
 * Constructs the default {@link NetworkConnectionBannerController} state.
 *
 * @returns The default state.
 */
export function getDefaultNetworkConnectionBannerControllerState(): NetworkConnectionBannerControllerState {
  return {
    networkConnectionBannerStatus: 'available',
    networkConnectionBannerNetwork: null,
  };
}

/**
 * How long (in milliseconds) a failing network must remain in a "failed"
 * status ("degraded" or "unavailable") before the degraded banner appears.
 */
const DEGRADED_BANNER_TIMEOUT = 5_000;

/**
 * How long (in milliseconds) a failing network must remain in a "failed"
 * status before the banner escalates to "unavailable".
 */
const UNAVAILABLE_BANNER_TIMEOUT = 30_000;

const MESSENGER_EXPOSED_METHODS = [
  'start',
  'stop',
  'dismissBanner',
  'switchToDefaultInfuraRpcEndpoint',
] as const;

/**
 * Retrieves the state of the {@link NetworkConnectionBannerController}.
 */
export type NetworkConnectionBannerControllerGetStateAction =
  ControllerGetStateAction<
    typeof CONTROLLER_NAME,
    NetworkConnectionBannerControllerState
  >;

/**
 * Actions that {@link NetworkConnectionBannerControllerMessenger} exposes to
 * other consumers.
 */
export type NetworkConnectionBannerControllerActions =
  | NetworkConnectionBannerControllerGetStateAction
  | NetworkConnectionBannerControllerMethodActions;

/**
 * Actions from other messengers that
 * {@link NetworkConnectionBannerControllerMessenger} calls.
 */
type AllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkConfigurationByChainIdAction
  | NetworkControllerUpdateNetworkAction
  | NetworkEnablementControllerGetStateAction
  | ConnectivityControllerGetStateAction;

/**
 * Published when the state of {@link NetworkConnectionBannerController}
 * changes.
 */
export type NetworkConnectionBannerControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof CONTROLLER_NAME,
    NetworkConnectionBannerControllerState
  >;

/**
 * Events that {@link NetworkConnectionBannerControllerMessenger} exposes to
 * other consumers.
 */
export type NetworkConnectionBannerControllerEvents =
  NetworkConnectionBannerControllerStateChangedEvent;

/**
 * Events from other messengers that
 * {@link NetworkConnectionBannerControllerMessenger} subscribes to.
 */
type AllowedEvents =
  | NetworkControllerStateChangeEvent
  | NetworkEnablementControllerStateChangeEvent
  | ConnectivityControllerStateChangeEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link NetworkConnectionBannerController}.
 */
export type NetworkConnectionBannerControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  NetworkConnectionBannerControllerActions | AllowedActions,
  NetworkConnectionBannerControllerEvents | AllowedEvents
>;

/**
 * Options for constructing the {@link NetworkConnectionBannerController}.
 */
export type NetworkConnectionBannerControllerOptions = {
  /**
   * The messenger for inter-controller communication.
   */
  messenger: NetworkConnectionBannerControllerMessenger;
};

/**
 * NetworkConnectionBannerController decides whether the network connection
 * banner should be shown for the user, and which failing network it should
 * describe. It encapsulates the rule, the 5s / 30s timer escalation, and the
 * eTLD+1 grouping used to decide when a wider provider outage is in play.
 *
 * The banner shows when:
 *
 * - The first failing network's default RPC is a custom (non-Infura) endpoint
 *   — users always want to be informed about errors with RPCs they've chosen.
 * - Failed RPCs span more than one registrable domain (likely client-side).
 * - Every enabled EVM network with known connectivity status is failing
 *   (escape hatch for single-network setups so they still get a signal).
 *
 * A wide single-provider outage (e.g. every `*.infura.io` network goes down at
 * once) collapses to one domain and is suppressed, except in the all-down
 * single-network case. When a custom failure is present, it's surfaced first
 * so the "Switch to MetaMask default RPC" CTA targets the network the user
 * can act on.
 *
 * Clients only need to render the banner from the controller's state and wire
 * click handlers to {@link dismissBanner} or {@link switchToDefaultInfuraRpcEndpoint}.
 */
export class NetworkConnectionBannerController extends BaseController<
  typeof CONTROLLER_NAME,
  NetworkConnectionBannerControllerState,
  NetworkConnectionBannerControllerMessenger
> {
  #degradedTimer: ReturnType<typeof setTimeout> | undefined;

  #unavailableTimer: ReturnType<typeof setTimeout> | undefined;

  #pendingNetworkClientId: string | undefined;

  #isStarted = false;

  /**
   * Constructs a new {@link NetworkConnectionBannerController}.
   *
   * @param args - The arguments to this controller.
   * @param args.messenger - The messenger suited for this controller.
   */
  constructor({ messenger }: NetworkConnectionBannerControllerOptions) {
    super({
      messenger,
      metadata: networkConnectionBannerControllerMetadata,
      name: CONTROLLER_NAME,
      state: getDefaultNetworkConnectionBannerControllerState(),
    });

    // Upstream controllers still expose :stateChange; switch to :stateChanged
    // once those packages migrate their event types.
    /* eslint-disable no-restricted-syntax -- awaiting upstream :stateChanged migration */
    this.messenger.subscribe(
      'NetworkController:stateChange',
      (networkControllerState) =>
        this.#refreshState({ networkControllerState }),
      selectNetworkControllerFields,
    );
    this.messenger.subscribe(
      'NetworkEnablementController:stateChange',
      (networkEnablementControllerState) =>
        this.#refreshState({ networkEnablementControllerState }),
      selectNetworkEnablementControllerFields,
    );
    this.messenger.subscribe(
      'ConnectivityController:stateChange',
      (connectivityControllerState) =>
        this.#refreshState({ connectivityControllerState }),
      selectConnectivityControllerFields,
    );
    /* eslint-enable no-restricted-syntax */

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Look for a failed network, if any, and populate the initial state of the
   * banner. Reacts to upstream state changes from this point on.
   *
   * Call this when the wallet UI that consumes the banner becomes active
   * (typically when the wallet is unlocked and the home surface mounts) so
   * timers do not run while the user is not looking at the wallet. Should
   * be called after `NetworkController`, `NetworkEnablementController`, and
   * `ConnectivityController` have been initialized. Idempotent.
   */
  start(): void {
    if (this.#isStarted) {
      return;
    }

    this.#isStarted = true;
    this.#refreshState();
  }

  /**
   * Stops evaluating network connection state. Clears any pending banner
   * timers and resets state to `available`. Call this when the UI
   * consuming the banner is no longer active. Idempotent.
   */
  stop(): void {
    if (!this.#isStarted) {
      return;
    }

    this.#isStarted = false;
    this.#resetBanner();
  }

  /**
   * Clears the banner state such that the banner will be hidden.
   */
  dismissBanner(): void {
    this.#resetBanner();
  }

  /**
   * Switches the chain's default RPC endpoint to its Infura endpoint,
   * causing the banner to clear once the network becomes available again.
   *
   * @param chainId - The chain whose default RPC endpoint should be switched.
   * @throws If the chain configuration cannot be found, or if it has no
   * Infura endpoint to switch to, or if the default is already Infura.
   */
  async switchToDefaultInfuraRpcEndpoint(chainId: Hex): Promise<void> {
    const networkConfiguration = this.messenger.call(
      'NetworkController:getNetworkConfigurationByChainId',
      chainId,
    );
    if (!networkConfiguration) {
      throw new Error(
        `No network configuration found for chain ID "${chainId}".`,
      );
    }

    const infuraEndpointIndex = networkConfiguration.rpcEndpoints.findIndex(
      (endpoint) => getIsInfuraEndpoint(endpoint.url),
    );
    if (infuraEndpointIndex === -1) {
      throw new Error(
        `No Infura endpoint available for chain ID "${chainId}".`,
      );
    }
    if (infuraEndpointIndex === networkConfiguration.defaultRpcEndpointIndex) {
      // The default is already Infura; nothing to do.
      return;
    }

    await this.messenger.call(
      'NetworkController:updateNetwork',
      chainId,
      {
        ...networkConfiguration,
        defaultRpcEndpointIndex: infuraEndpointIndex,
      },
      { replacementSelectedRpcEndpointIndex: infuraEndpointIndex },
    );
  }

  #refreshState({
    networkControllerState,
    networkEnablementControllerState,
    connectivityControllerState,
  }: {
    networkControllerState?: Pick<
      NetworkState,
      'networkConfigurationsByChainId' | 'networksMetadata'
    >;
    networkEnablementControllerState?: Pick<
      NetworkEnablementControllerState,
      'enabledNetworkMap'
    >;
    connectivityControllerState?: Pick<
      ConnectivityControllerState,
      'connectivityStatus'
    >;
  } = {}): void {
    if (!this.#isStarted) {
      return;
    }

    const { connectivityStatus } =
      connectivityControllerState ??
      this.messenger.call('ConnectivityController:getState');
    if (connectivityStatus === CONNECTIVITY_STATUSES.Offline) {
      this.#resetBanner();
      return;
    }

    const networkState =
      networkControllerState ??
      this.messenger.call('NetworkController:getState');
    const enablementState =
      networkEnablementControllerState ??
      this.messenger.call('NetworkEnablementController:getState');

    const failedNetwork = this.#findFailedNetwork(
      networkState,
      enablementState,
    );
    if (!failedNetwork) {
      this.#resetBanner();
      return;
    }

    if (
      this.state.networkConnectionBannerStatus !== 'available' &&
      this.state.networkConnectionBannerNetwork?.networkClientId ===
        failedNetwork.networkClientId
    ) {
      this.update((state) => {
        state.networkConnectionBannerNetwork = failedNetwork;
      });
      return;
    }

    if (this.#pendingNetworkClientId === failedNetwork.networkClientId) {
      return;
    }

    this.#clearTimers();
    this.update((state) => {
      state.networkConnectionBannerStatus = 'available';
      state.networkConnectionBannerNetwork = null;
    });

    // A synchronous listener on our `stateChanged` event above may have
    // called `stop()` re-entrantly. Bail before scheduling anything.
    if (!this.#isStarted) {
      return;
    }

    // Capture the failing network at schedule time. We trust the messenger
    // contract: if the failure resolves or the target changes during the
    // wait, our upstream subscriptions will have cancelled or replaced this
    // timer via `#clearTimers` before it fires.
    this.#pendingNetworkClientId = failedNetwork.networkClientId;
    this.#degradedTimer = setTimeout(() => {
      this.#degradedTimer = undefined;
      this.#pendingNetworkClientId = undefined;
      this.update((state) => {
        state.networkConnectionBannerStatus = 'degraded';
        state.networkConnectionBannerNetwork = failedNetwork;
      });
      // A synchronous listener on our `stateChanged` event above may have
      // called `stop()` re-entrantly. Bail before scheduling the escalation.
      if (!this.#isStarted) {
        return;
      }
      this.#unavailableTimer = setTimeout(() => {
        this.#unavailableTimer = undefined;
        this.update((state) => {
          state.networkConnectionBannerStatus = 'unavailable';
          state.networkConnectionBannerNetwork = failedNetwork;
        });
      }, UNAVAILABLE_BANNER_TIMEOUT - DEGRADED_BANNER_TIMEOUT);
    }, DEGRADED_BANNER_TIMEOUT);
  }

  /**
   * Clears timers and resets banner state to {@link NetworkConnectionBannerStatus|`available`}
   * if it isn't there already.
   */
  #resetBanner(): void {
    this.#clearTimers();
    this.#pendingNetworkClientId = undefined;
    if (
      this.state.networkConnectionBannerStatus !== 'available' ||
      this.state.networkConnectionBannerNetwork !== null
    ) {
      this.update((state) => {
        state.networkConnectionBannerStatus = 'available';
        state.networkConnectionBannerNetwork = null;
      });
    }
  }

  #clearTimers(): void {
    if (this.#degradedTimer !== undefined) {
      clearTimeout(this.#degradedTimer);
      this.#degradedTimer = undefined;
    }
    if (this.#unavailableTimer !== undefined) {
      clearTimeout(this.#unavailableTimer);
      this.#unavailableTimer = undefined;
    }
  }

  #findFailedNetwork(
    networkState: Pick<
      NetworkState,
      'networkConfigurationsByChainId' | 'networksMetadata'
    >,
    enablementState: Pick<
      NetworkEnablementControllerState,
      'enabledNetworkMap'
    >,
  ): FailedNetwork | null {
    const networksWithMetadata = this.#collectNetworksWithMetadata(
      networkState,
      enablementState,
    );
    const failedNetworks = networksWithMetadata
      .filter(({ metadata }) => metadata.status !== NetworkStatus.Available)
      .map((network) => this.#buildFailedNetwork(network));
    return this.#pickBannerNetwork(failedNetworks, networksWithMetadata.length);
  }

  #getEnabledEvmChainIds(
    enabledNetworkMap: NetworkEnablementControllerState['enabledNetworkMap'],
  ): Hex[] {
    return Object.entries(enabledNetworkMap[KnownCaipNamespace.Eip155] ?? {})
      .filter(([, enabled]) => enabled)
      .map(([chainId]) => chainId as Hex);
  }

  #collectNetworksWithMetadata(
    {
      networkConfigurationsByChainId,
      networksMetadata,
    }: Pick<
      NetworkState,
      'networkConfigurationsByChainId' | 'networksMetadata'
    >,
    {
      enabledNetworkMap,
    }: Pick<NetworkEnablementControllerState, 'enabledNetworkMap'>,
  ): NetworkWithMetadata[] {
    return this.#getEnabledEvmChainIds(enabledNetworkMap).flatMap((chainId) => {
      const networkConfiguration = networkConfigurationsByChainId[chainId];
      if (!networkConfiguration) {
        return [];
      }
      const { rpcEndpoints, defaultRpcEndpointIndex, name } =
        networkConfiguration;
      const defaultRpcEndpoint = rpcEndpoints[defaultRpcEndpointIndex];
      if (!defaultRpcEndpoint) {
        return [];
      }
      const metadata = networksMetadata[defaultRpcEndpoint.networkClientId];
      if (!metadata) {
        return [];
      }
      return [
        {
          chainId,
          name,
          rpcEndpoints,
          defaultRpcEndpointIndex,
          defaultRpcEndpoint,
          metadata,
        },
      ];
    });
  }

  #buildFailedNetwork({
    chainId,
    name,
    rpcEndpoints,
    defaultRpcEndpointIndex,
    defaultRpcEndpoint,
  }: NetworkWithMetadata): FailedNetwork {
    const isInfuraEndpoint = getIsInfuraEndpoint(defaultRpcEndpoint.url);

    // For custom endpoints (non-Infura), find an Infura endpoint on this
    // chain that we could offer to switch to.
    let switchableInfuraNetworkClientId: string | null = null;
    if (!isInfuraEndpoint) {
      const infuraEndpoint = rpcEndpoints.find(
        (endpoint, index) =>
          index !== defaultRpcEndpointIndex &&
          getIsInfuraEndpoint(endpoint.url),
      );
      switchableInfuraNetworkClientId = infuraEndpoint?.networkClientId ?? null;
    }

    return {
      chainId,
      networkClientId: defaultRpcEndpoint.networkClientId,
      name,
      rpcUrl: defaultRpcEndpoint.url,
      isInfuraEndpoint,
      switchableInfuraNetworkClientId,
      domain: getDomain(defaultRpcEndpoint.url),
    };
  }

  #pickBannerNetwork(
    failedNetworks: FailedNetwork[],
    totalNetworksWithMetadata: number,
  ): FailedNetwork | null {
    if (failedNetworks.length === 0) {
      return null;
    }

    const firstCustomFailed = failedNetworks.find(
      (entry) => !entry.isInfuraEndpoint,
    );
    const distinctDomains = new Set(
      failedNetworks
        .map((entry) => entry.domain)
        .filter((domain): domain is string => domain !== null),
    ).size;
    const areAllKnownNetworksFailed =
      failedNetworks.length === totalNetworksWithMetadata;

    if (
      !firstCustomFailed &&
      distinctDomains <= 1 &&
      !areAllKnownNetworksFailed
    ) {
      return null;
    }

    return firstCustomFailed ?? failedNetworks[0];
  }
}
