import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import type {
  ConnectivityControllerGetStateAction,
  ConnectivityControllerState,
} from '@metamask/connectivity-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkConfigurationByChainIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerUpdateNetworkAction,
  NetworkState,
} from '@metamask/network-controller';
import { NetworkStatus } from '@metamask/network-controller';
import type {
  NetworkEnablementControllerGetStateAction,
  NetworkEnablementControllerState,
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
export const controllerName = 'NetworkConnectionBannerController';

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

const DEGRADED_BANNER_TIMEOUT_MS = 5_000;
const UNAVAILABLE_BANNER_TIMEOUT_MS = 30_000;

const MESSENGER_EXPOSED_METHODS = [
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
  | ControllerStateChangedEvent<'NetworkController', NetworkState>
  | ControllerStateChangedEvent<
      'NetworkEnablementController',
      NetworkEnablementControllerState
    >
  | ControllerStateChangedEvent<
      'ConnectivityController',
      ConnectivityControllerState
    >;

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
 * - Every enabled EVM network is failing (escape hatch for single-network
 *   setups so they still get a signal).
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

    const onStateChange = (): void => this.#evaluate();
    this.messenger.subscribe('NetworkController:stateChanged', onStateChange);
    this.messenger.subscribe(
      'NetworkEnablementController:stateChanged',
      onStateChange,
    );
    this.messenger.subscribe(
      'ConnectivityController:stateChanged',
      onStateChange,
    );

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Clears the banner state regardless of the current rule outcome. The next
   * subscription-driven evaluation will re-show the banner if the conditions
   * still hold.
   */
  dismissBanner(): void {
    this.#clearTimers();
    if (this.state.status !== 'available' || this.state.network !== null) {
      this.update((draft) => {
        draft.status = 'available';
        draft.network = null;
      });
    }
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
      (endpoint) => isInfuraEndpoint(endpoint.url),
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

  #evaluate(): void {
    const { connectivityStatus } = this.messenger.call(
      'ConnectivityController:getState',
    );
    if (connectivityStatus === CONNECTIVITY_STATUSES.Offline) {
      this.#clearTimers();
      if (this.state.status !== 'available' || this.state.network !== null) {
        this.update((draft) => {
          draft.status = 'available';
          draft.network = null;
        });
      }
      return;
    }

    const failed = this.#findFailedNetworkForBanner();

    if (!failed) {
      this.#clearTimers();
      if (this.state.status !== 'available' || this.state.network !== null) {
        this.update((draft) => {
          draft.status = 'available';
          draft.network = null;
        });
      }
      return;
    }

    // If the banner is currently showing for a different network or status,
    // restart the escalation timeline for the new one. Otherwise let the
    // existing timers continue.
    if (
      this.state.status !== 'available' &&
      this.state.network?.networkClientId === failed.networkClientId
    ) {
      this.update((draft) => {
        draft.network = failed;
      });
      return;
    }

    this.#clearTimers();
    this.update((draft) => {
      draft.status = 'available';
      draft.network = null;
    });

    this.#degradedTimer = setTimeout(() => {
      this.#degradedTimer = undefined;
      const stillFailed = this.#findFailedNetworkForBanner();
      if (!stillFailed) {
        return;
      }
      this.update((draft) => {
        draft.status = 'degraded';
        draft.network = stillFailed;
      });
      this.#unavailableTimer = setTimeout(() => {
        this.#unavailableTimer = undefined;
        const stillFailedAtEscalation = this.#findFailedNetworkForBanner();
        if (!stillFailedAtEscalation) {
          return;
        }
        this.update((draft) => {
          draft.status = 'unavailable';
          draft.network = stillFailedAtEscalation;
        });
      }, UNAVAILABLE_BANNER_TIMEOUT_MS - DEGRADED_BANNER_TIMEOUT_MS);
    }, DEGRADED_BANNER_TIMEOUT_MS);
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

  #findFailedNetworkForBanner(): NetworkConnectionBannerFailedNetwork | null {
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
    let totalEnabled = 0;

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

      totalEnabled += 1;

      const metadata = networksMetadata[defaultRpcEndpoint.networkClientId];
      if (
        metadata === undefined ||
        metadata.status === NetworkStatus.Available
      ) {
        continue;
      }

      const endpointIsInfura = isInfuraEndpoint(defaultRpcEndpoint.url);

      // For custom endpoints (non-Infura), find an Infura endpoint on this
      // chain that we could offer to switch to.
      let infuraNetworkClientId: string | null = null;
      if (!endpointIsInfura) {
        const otherInfura = rpcEndpoints.find(
          (endpoint, index) =>
            index !== defaultRpcEndpointIndex && isInfuraEndpoint(endpoint.url),
        );
        infuraNetworkClientId = otherInfura?.networkClientId ?? null;
      }

      failedNetworks.push({
        chainId,
        networkClientId: defaultRpcEndpoint.networkClientId,
        networkName: name,
        rpcUrl: defaultRpcEndpoint.url,
        isInfuraEndpoint: endpointIsInfura,
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
    const areAllEnabledNetworksFailed = failedNetworks.length === totalEnabled;

    if (
      !firstCustomFailed &&
      distinctDomains <= 1 &&
      !areAllEnabledNetworksFailed
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
 * `*.infura.io` URL counts. That's the right shape for grouping by provider.
 *
 * @param url - The RPC URL to check.
 * @returns True if the URL's host is on `infura.io`.
 */
function isInfuraEndpoint(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.infura.io');
  } catch {
    return false;
  }
}
