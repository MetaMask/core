import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { clientControllerSelectors } from '@metamask/client-controller';
import type { ClientControllerState } from '@metamask/client-controller';
import {
  CONNECTIVITY_STATUSES,
  connectivityControllerSelectors,
} from '@metamask/connectivity-controller';
import type {
  ConnectivityControllerGetStateAction,
  ConnectivityControllerState,
  ConnectivityControllerStateChangeEvent,
} from '@metamask/connectivity-controller';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
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
import { getIsInfuraEndpoint } from './url-utils';

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
 * An enabled network from `NetworkController` state with a default RPC
 * endpoint. Used as the input to the failed-network detection pipeline.
 * `metadata` is missing until the network's connectivity has been looked up.
 */
type EnabledNetwork = {
  chainId: Hex;
  name: string;
  rpcEndpoints: NetworkConfiguration['rpcEndpoints'];
  defaultRpcEndpointIndex: number;
  defaultRpcEndpoint: NetworkConfiguration['rpcEndpoints'][number];
  metadata: NetworkMetadata | undefined;
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
 * Published when the state of `ClientController` changes. Defined here
 * because the `client-controller` package still exports the legacy
 * `:stateChange` event type.
 */
type ClientControllerStateChangedEvent = ControllerStateChangedEvent<
  'ClientController',
  ClientControllerState
>;

/**
 * Events from other messengers that
 * {@link NetworkConnectionBannerControllerMessenger} subscribes to.
 */
type AllowedEvents =
  | NetworkControllerStateChangeEvent
  | NetworkEnablementControllerStateChangeEvent
  | ConnectivityControllerStateChangeEvent
  | ClientControllerStateChangedEvent
  | KeyringControllerUnlockEvent
  | KeyringControllerLockEvent;

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
 * describe. It encapsulates the rule and the 5s / 30s timer escalation.
 *
 * The banner shows when:
 *
 * - A failing network's default RPC is a custom (non-Infura) endpoint —
 *   users always want to be informed about errors with RPCs they've chosen.
 * - Every enabled EVM network is reporting a failed connectivity status
 *   (escape hatch so Infura-only setups still get a signal).
 *
 * A partial Infura outage alongside healthy peers is suppressed since it
 * usually resolves on its own and the user cannot act on it. When a custom
 * failure is present, it's surfaced first so the "Switch to MetaMask default
 * RPC" CTA targets the network the user can act on.
 *
 * The controller manages its own lifecycle: it evaluates RPC health (and
 * runs the escalation timers) only while the client UI is open
 * (`ClientController`) and the wallet is unlocked (`KeyringController`).
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

  /** Whether the client UI is open. Combined with {@link #isUnlocked}. */
  #isUiOpen = false;

  /** Whether the keyring is unlocked. Combined with {@link #isUiOpen}. */
  #isUnlocked = false;

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
        this.#refreshState({
          networkControllerState,
          networkEnablementControllerState: this.messenger.call(
            'NetworkEnablementController:getState',
          ),
          connectivityControllerState: this.messenger.call(
            'ConnectivityController:getState',
          ),
        }),
      selectNetworkControllerFields,
    );
    this.messenger.subscribe(
      'NetworkEnablementController:stateChange',
      (networkEnablementControllerState) =>
        this.#refreshState({
          networkControllerState: this.messenger.call(
            'NetworkController:getState',
          ),
          networkEnablementControllerState,
          connectivityControllerState: this.messenger.call(
            'ConnectivityController:getState',
          ),
        }),
      selectNetworkEnablementControllerFields,
    );
    this.messenger.subscribe(
      'ConnectivityController:stateChange',
      (connectivityControllerState) =>
        this.#refreshState({
          networkControllerState: this.messenger.call(
            'NetworkController:getState',
          ),
          networkEnablementControllerState: this.messenger.call(
            'NetworkEnablementController:getState',
          ),
          connectivityControllerState,
        }),
      selectConnectivityControllerFields,
    );
    /* eslint-enable no-restricted-syntax */

    // Lifecycle: evaluate RPC health (and run the banner escalation timers)
    // only while the client UI is open on an unlocked wallet.
    this.messenger.subscribe(
      'ClientController:stateChanged',
      (isUiOpen) => {
        this.#isUiOpen = isUiOpen;
        this.#updateLifecycle();
      },
      clientControllerSelectors.selectIsUiOpen,
    );
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#isUnlocked = true;
      this.#updateLifecycle();
    });
    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
      this.#updateLifecycle();
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  #updateLifecycle(): void {
    if (this.#isUiOpen && this.#isUnlocked) {
      this.#start();
    } else {
      this.#stop();
    }
  }

  /**
   * Look for a failed network, if any, and populate the initial state of the
   * banner. Reacts to upstream state changes from this point on. Idempotent.
   */
  #start(): void {
    if (this.#isStarted) {
      return;
    }

    this.#isStarted = true;
    this.#refreshState({
      networkControllerState: this.messenger.call('NetworkController:getState'),
      networkEnablementControllerState: this.messenger.call(
        'NetworkEnablementController:getState',
      ),
      connectivityControllerState: this.messenger.call(
        'ConnectivityController:getState',
      ),
    });
  }

  /**
   * Stops evaluating network connection state. Clears any pending banner
   * timers and resets state to `available`. Idempotent.
   */
  #stop(): void {
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
    networkControllerState: Pick<
      NetworkState,
      'networkConfigurationsByChainId' | 'networksMetadata'
    >;
    networkEnablementControllerState: Pick<
      NetworkEnablementControllerState,
      'enabledNetworkMap'
    >;
    connectivityControllerState: Pick<
      ConnectivityControllerState,
      'connectivityStatus'
    >;
  }): void {
    if (!this.#isStarted) {
      return;
    }

    if (
      connectivityControllerState.connectivityStatus ===
      CONNECTIVITY_STATUSES.Offline
    ) {
      this.#resetBanner();
      return;
    }

    const failedNetwork = this.#findFailedNetwork(
      networkControllerState,
      networkEnablementControllerState,
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
        // Even if the network client ID has not changed, save the current
        // version of the failed network to state in case the user has updated
        // its RPC URL.
        state.networkConnectionBannerNetwork = failedNetwork;
      });
      return;
    }

    // A degraded timer is already counting down for this same network.
    // Repeated `stateChange` events must not clear and restart it, or a
    // steady stream of updates could postpone the banner indefinitely.
    if (this.#pendingNetworkClientId === failedNetwork.networkClientId) {
      return;
    }

    this.#clearTimers();
    this.update((state) => {
      state.networkConnectionBannerStatus = 'available';
      state.networkConnectionBannerNetwork = null;
    });

    // If `stop` is called before scheduling timers, bail early.
    if (!this.#isStarted) {
      return;
    }

    // Remember which network the pending timer is for (see the guard above)
    // and capture the failing network at schedule time. If the failure
    // resolves or a different network becomes the banner target while we
    // wait, the subscription handlers re-enter this method and cancel or
    // replace the timer before it fires.
    this.#pendingNetworkClientId = failedNetwork.networkClientId;
    this.#degradedTimer = setTimeout(() => {
      this.#degradedTimer = undefined;
      this.#pendingNetworkClientId = undefined;
      this.update((state) => {
        state.networkConnectionBannerStatus = 'degraded';
        state.networkConnectionBannerNetwork = failedNetwork;
      });
      // If `stop` is called before scheduling timers, bail early.
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
    const enabledNetworks = this.#collectEnabledNetworks(
      networkState,
      enablementState,
    );
    // Networks whose connectivity has not been looked up yet are not failed.
    const failedNetworks = enabledNetworks
      .filter(
        ({ metadata }) =>
          metadata !== undefined && metadata.status !== NetworkStatus.Available,
      )
      .map((network) => this.#buildFailedNetwork(network));
    return this.#pickFailedNetworkToDisplay(
      failedNetworks,
      enabledNetworks.length,
    );
  }

  #getEnabledEvmChainIds(
    enabledNetworkMap: NetworkEnablementControllerState['enabledNetworkMap'],
  ): Hex[] {
    return Object.entries(enabledNetworkMap[KnownCaipNamespace.Eip155] ?? {})
      .filter(([, enabled]) => enabled)
      .map(([chainId]) => chainId as Hex);
  }

  #collectEnabledNetworks(
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
  ): EnabledNetwork[] {
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
      return [
        {
          chainId,
          name,
          rpcEndpoints,
          defaultRpcEndpointIndex,
          defaultRpcEndpoint,
          metadata: networksMetadata[defaultRpcEndpoint.networkClientId],
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
  }: EnabledNetwork): FailedNetwork {
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
    };
  }

  #pickFailedNetworkToDisplay(
    failedNetworks: FailedNetwork[],
    totalEnabledNetworks: number,
  ): FailedNetwork | null {
    if (failedNetworks.length === 0) {
      return null;
    }

    const firstCustomFailed = failedNetworks.find(
      (entry) => !entry.isInfuraEndpoint,
    );
    const areAllEnabledNetworksFailed =
      failedNetworks.length === totalEnabledNetworks;

    if (!firstCustomFailed && !areAllEnabledNetworksFailed) {
      return null;
    }

    return firstCustomFailed ?? failedNetworks[0];
  }
}
