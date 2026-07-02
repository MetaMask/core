import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import type {
  ConnectivityControllerGetStateAction,
  ConnectivityControllerStateChangeEvent,
} from '@metamask/connectivity-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkConfigurationByChainIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerUpdateNetworkAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import { NetworkStatus } from '@metamask/network-controller';
import type {
  NetworkEnablementControllerGetStateAction,
  NetworkEnablementControllerStateChangeEvent,
} from '@metamask/network-enablement-controller';
import type { Hex } from '@metamask/utils';
import { KnownCaipNamespace } from '@metamask/utils';

import type { NetworkConnectionBannerControllerMethodActions } from './NetworkConnectionBannerController-method-action-types';
import { getDomain } from './url-utils';

/**
 * The name of the {@link NetworkConnectionBannerController}, used to namespace
 * the controller's actions and events and to namespace the controller's state
 * data when composed with other controllers.
 */
const controllerName = 'NetworkConnectionBannerController';

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
 * Details of the failing network the banner should describe. Populated when
 * {@link NetworkConnectionBannerControllerState.status} is `degraded` or
 * `unavailable`, `null` otherwise.
 *
 * `infuraNetworkClientId` is the networkClientId of an Infura endpoint on the
 * same chain that the user can switch to. `null` when the failing endpoint is
 * already Infura, or when no Infura alternative exists.
 */
export type NetworkConnectionBannerFailedNetwork = {
  chainId: Hex;
  networkClientId: string;
  networkName: string;
  rpcUrl: string;
  isInfuraEndpoint: boolean;
  infuraNetworkClientId: string | null;
};

/**
 * State for the {@link NetworkConnectionBannerController}.
 */
export type NetworkConnectionBannerControllerState = {
  status: NetworkConnectionBannerStatus;
  network: NetworkConnectionBannerFailedNetwork | null;
};

const networkConnectionBannerControllerMetadata = {
  status: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  network: {
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
    status: 'available',
    network: null,
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
  'init',
  'dismissBanner',
  'switchToDefaultInfuraRpc',
] as const;

/**
 * Retrieves the state of the {@link NetworkConnectionBannerController}.
 */
export type NetworkConnectionBannerControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
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
    typeof controllerName,
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
  typeof controllerName,
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
 * eTLD+1 grouping that was previously duplicated across MetaMask clients.
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
 * click handlers to {@link dismissBanner} or {@link switchToDefaultInfuraRpc}.
 */
export class NetworkConnectionBannerController extends BaseController<
  typeof controllerName,
  NetworkConnectionBannerControllerState,
  NetworkConnectionBannerControllerMessenger
> {
  #degradedTimer: ReturnType<typeof setTimeout> | undefined;

  #unavailableTimer: ReturnType<typeof setTimeout> | undefined;

  #pendingNetworkClientId: string | undefined;

  #initialized = false;

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
      name: controllerName,
      state: getDefaultNetworkConnectionBannerControllerState(),
    });

    const onStateChange = (): void => {
      if (this.#initialized) {
        this.#refreshState();
      }
    };
    // Upstream controllers still expose :stateChange; switch to :stateChanged
    // once those packages migrate their event types.
    /* eslint-disable no-restricted-syntax -- awaiting upstream :stateChanged migration */
    this.messenger.subscribe('NetworkController:stateChange', onStateChange);
    this.messenger.subscribe(
      'NetworkEnablementController:stateChange',
      onStateChange,
    );
    this.messenger.subscribe(
      'ConnectivityController:stateChange',
      onStateChange,
    );
    /* eslint-enable no-restricted-syntax */

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Starts evaluating network connection state.
   *
   * This method should be called after the upstream network, network
   * enablement, and connectivity controllers have been initialized.
   */
  init(): void {
    if (this.#initialized) {
      return;
    }

    this.#refreshState();
    this.#initialized = true;
  }

  /**
   * Clears the banner state such that the banner will be hidden.
   */
  dismissBanner(): void {
    this.#resetBanner();
  }

  /**
   * Switches the chain's default RPC endpoint to its first Infura endpoint,
   * causing the banner to clear once the network becomes available again.
   *
   * @param args - The arguments to this action.
   * @param args.chainId - The chain whose default RPC should be switched.
   * @throws If the chain configuration cannot be found, or if it has no
   * Infura endpoint to switch to, or if the default is already Infura.
   */
  async switchToDefaultInfuraRpc({ chainId }: { chainId: Hex }): Promise<void> {
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

  #refreshState(): void {
    const { connectivityStatus } = this.messenger.call(
      'ConnectivityController:getState',
    );
    if (connectivityStatus === CONNECTIVITY_STATUSES.Offline) {
      this.#resetBanner();
      return;
    }

    const failedNetwork = this.#findFailedNetwork();

    if (!failedNetwork) {
      this.#resetBanner();
      return;
    }

    if (
      this.state.status !== 'available' &&
      this.state.network?.networkClientId === failedNetwork.networkClientId
    ) {
      this.update((state) => {
        state.network = failedNetwork;
      });
      return;
    }

    if (this.#pendingNetworkClientId === failedNetwork.networkClientId) {
      return;
    }

    this.#clearTimers();
    this.update((state) => {
      state.status = 'available';
      state.network = null;
    });

    this.#pendingNetworkClientId = failedNetwork.networkClientId;
    this.#degradedTimer = setTimeout(() => {
      this.#degradedTimer = undefined;
      this.#pendingNetworkClientId = undefined;
      const stillFailed = this.#findFailedNetwork();
      if (!stillFailed) {
        return;
      }
      this.update((state) => {
        state.status = 'degraded';
        state.network = stillFailed;
      });
      this.#unavailableTimer = setTimeout(() => {
        this.#unavailableTimer = undefined;
        const stillFailedAtEscalation = this.#findFailedNetwork();
        if (!stillFailedAtEscalation) {
          this.#resetBanner();
          return;
        }
        this.update((state) => {
          state.status = 'unavailable';
          state.network = stillFailedAtEscalation;
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
    if (this.state.status !== 'available' || this.state.network !== null) {
      this.update((state) => {
        state.status = 'available';
        state.network = null;
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

  #findFailedNetwork(): NetworkConnectionBannerFailedNetwork | null {
    const { enabledNetworkMap } = this.messenger.call(
      'NetworkEnablementController:getState',
    );
    const enabledEvmChainIds = Object.entries(
      enabledNetworkMap[KnownCaipNamespace.Eip155] ?? {},
    )
      .filter(([, enabled]) => enabled)
      .map(([chainId]) => chainId as Hex);
    const { networkConfigurationsByChainId, networksMetadata } =
      this.messenger.call('NetworkController:getState');

    type EnrichedFailedNetwork = NetworkConnectionBannerFailedNetwork & {
      domain: string | null;
    };
    const failedNetworks: EnrichedFailedNetwork[] = [];
    let totalNetworksWithMetadata = 0;

    for (const chainId of enabledEvmChainIds) {
      const networkConfiguration = networkConfigurationsByChainId[chainId];
      if (!networkConfiguration) {
        continue;
      }

      const { rpcEndpoints, defaultRpcEndpointIndex, name } =
        networkConfiguration;
      const defaultRpcEndpoint = rpcEndpoints[defaultRpcEndpointIndex];
      if (!defaultRpcEndpoint) {
        continue;
      }

      const metadata = networksMetadata[defaultRpcEndpoint.networkClientId];
      if (!metadata) {
        continue;
      }

      totalNetworksWithMetadata += 1;

      if (metadata.status === NetworkStatus.Available) {
        continue;
      }

      const isInfuraEndpoint = getIsInfuraEndpoint(defaultRpcEndpoint.url);

      // For custom endpoints (non-Infura), find an Infura endpoint on this
      // chain that we could offer to switch to.
      let infuraNetworkClientId: string | null = null;
      if (!isInfuraEndpoint) {
        const otherInfura = rpcEndpoints.find(
          (endpoint, index) =>
            index !== defaultRpcEndpointIndex && getIsInfuraEndpoint(endpoint.url),
        );
        infuraNetworkClientId = otherInfura?.networkClientId ?? null;
      }

      failedNetworks.push({
        chainId,
        networkClientId: defaultRpcEndpoint.networkClientId,
        networkName: name,
        rpcUrl: defaultRpcEndpoint.url,
        isInfuraEndpoint: isInfuraEndpoint,
        infuraNetworkClientId,
        domain: getDomain(defaultRpcEndpoint.url),
      });
    }

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

    const selected = firstCustomFailed ?? failedNetworks[0];
    return {
      chainId: selected.chainId,
      networkClientId: selected.networkClientId,
      networkName: selected.networkName,
      rpcUrl: selected.rpcUrl,
      isInfuraEndpoint: selected.isInfuraEndpoint,
      infuraNetworkClientId: selected.infuraNetworkClientId,
    };
  }
}

/**
 * Checks if an RPC URL is hosted on the Infura service. Detection is by
 * hostname suffix rather than the exact MetaMask-key URL pattern, so any
 * `*.infura.io` URL counts.
 *
 * @param url - The RPC URL to check.
 * @returns True if the URL's host is on `infura.io`.
 */
function getIsInfuraEndpoint(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.infura.io');
  } catch {
    return false;
  }
}
