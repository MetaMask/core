import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId, toHex } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import type { MultichainNetworkControllerGetStateAction } from '@metamask/multichain-network-controller';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerNetworkAddedEvent,
  NetworkControllerNetworkRemovedEvent,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';
import {
  isHexString,
  KnownCaipNamespace,
  parseCaipChainId,
} from '@metamask/utils';

import { POPULATE_NETWORKS } from './constant';

// Unique name for the controller
const controllerName = 'NetworkEnablementController';

/**
 * Information about an ordered network.
 */
export type NetworksInfo = {
  networkId: CaipChainId; // The network's chain id
};

type EnabledMap = Record<CaipNamespace, Record<string, boolean>>;

// State shape for NetworkEnablementController
export type NetworkEnablementControllerState = {
  enabledNetworkMap: EnabledMap;
};

export type NetworkEnablementControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    NetworkEnablementControllerState
  >;

export type NetworkEnablementControllerSetEnabledNetworksAction = {
  type: `${typeof controllerName}:setEnabledNetworks`;
  handler: NetworkEnablementController['setEnabledNetwork'];
};

export type NetworkEnablementControllerDisableNetworkAction = {
  type: `${typeof controllerName}:disableNetwork`;
  handler: NetworkEnablementController['setDisabledNetwork'];
};

export type NetworkEnablementControllerIsNetworkEnabledAction = {
  type: `${typeof controllerName}:isNetworkEnabled`;
  handler: NetworkEnablementController['isNetworkEnabled'];
};

/**
 * All actions that {@link NetworkEnablementController} calls internally.
 */
type AllowedActions =
  | NetworkControllerGetStateAction
  | MultichainNetworkControllerGetStateAction;

export type NetworkEnablementControllerActions =
  | NetworkEnablementControllerGetStateAction
  | NetworkEnablementControllerSetEnabledNetworksAction
  | NetworkEnablementControllerDisableNetworkAction
  | NetworkEnablementControllerIsNetworkEnabledAction;

export type NetworkEnablementControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    NetworkEnablementControllerState
  >;

export type NetworkEnablementControllerEvents =
  NetworkEnablementControllerStateChangeEvent;

/**
 * All events that {@link NetworkEnablementController} subscribes to internally.
 */
type AllowedEvents =
  | NetworkControllerNetworkAddedEvent
  | NetworkControllerNetworkRemovedEvent
  | NetworkControllerStateChangeEvent;

export type NetworkEnablementControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  NetworkEnablementControllerActions | AllowedActions,
  NetworkEnablementControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Gets the default state for the NetworkEnablementController.
 *
 * @returns The default state with pre-enabled networks.
 */
const defaultState = (): NetworkEnablementControllerState => ({
  enabledNetworkMap: {
    [KnownCaipNamespace.Eip155]: {
      [ChainId[BuiltInNetworkName.Mainnet]]: true,
      [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
      [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
    },
    [KnownCaipNamespace.Solana]: {
      [SolScope.Mainnet]: false,
    },
  } as EnabledMap,
});

// Metadata for the controller state
const metadata = {
  enabledNetworkMap: {
    persist: true,
    anonymous: true,
  },
};

const mergeEnabledMaps = (
  base: EnabledMap,
  override?: Partial<EnabledMap>,
): EnabledMap => {
  if (!override) {
    return base;
  }
  return (Object.keys(base) as CaipNamespace[]).reduce((acc, ns) => {
    acc[ns] = { ...base[ns], ...(override[ns] ?? {}) };
    return acc;
  }, {} as EnabledMap);
};

export class NetworkEnablementController extends BaseController<
  typeof controllerName,
  NetworkEnablementControllerState,
  NetworkEnablementControllerMessenger
> {
  /**
   * Creates a NetworkEnablementController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: NetworkEnablementControllerMessenger;
    state?: Partial<NetworkEnablementControllerState>;
  }) {
    // Call the constructor of BaseControllerV2
    super({
      messenger,
      metadata,
      name: controllerName,
      state: {
        enabledNetworkMap: mergeEnabledMaps(
          defaultState().enabledNetworkMap,
          state?.enabledNetworkMap,
        ),
      },
    });

    this.messagingSystem = messenger;

    messenger.subscribe('NetworkController:networkAdded', ({ chainId }) => {
      this.#ensureNetworkEntry(chainId, false);
      this.#toggleNetwork(chainId, true);
    });

    messenger.subscribe('NetworkController:networkRemoved', ({ chainId }) => {
      this.#removeNetworkEntry(chainId);
    });
  }

  setEnabledNetwork(chainId: Hex | CaipChainId): void {
    this.#toggleNetwork(chainId, true);
  }

  setDisabledNetwork(chainId: Hex | CaipChainId): void {
    this.#toggleNetwork(chainId, false);
  }

  isNetworkEnabled(chainId: Hex | CaipChainId): boolean {
    try {
      const { namespace, storageKey } = this.#deriveKeys(chainId);
      return Boolean(this.state.enabledNetworkMap[namespace]?.[storageKey]);
    } catch {
      return false;
    }
  }

  getEnabledNetworksForNamespace(namespace: CaipNamespace): string[] {
    return Object.entries(this.state.enabledNetworkMap[namespace] ?? {})
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
  }

  getAllEnabledNetworks(): Record<CaipNamespace, string[]> {
    return (
      Object.keys(this.state.enabledNetworkMap) as CaipNamespace[]
    ).reduce(
      (acc, ns) => {
        acc[ns] = this.getEnabledNetworksForNamespace(ns);
        return acc;
      },
      {} as Record<CaipNamespace, string[]>,
    );
  }

  // ---------------------------- Internals ----------------------------------

  #deriveKeys(chainId: Hex | CaipChainId) {
    const caipId: CaipChainId = isHexString(chainId)
      ? toEvmCaipChainId(chainId as Hex)
      : (chainId as CaipChainId);
    const { namespace, reference } = parseCaipChainId(caipId);
    let storageKey: string;
    if (namespace === (KnownCaipNamespace.Eip155 as string)) {
      storageKey = isHexString(chainId)
        ? (chainId as string)
        : toHex(reference);
    } else {
      storageKey = caipId;
    }
    return { namespace, storageKey, caipId } as const;
  }

  #ensureNamespaceBucket(
    state: NetworkEnablementControllerState,
    ns: CaipNamespace,
  ) {
    if (!state.enabledNetworkMap[ns]) {
      state.enabledNetworkMap[ns] = {} as Record<string, boolean>;
    }
  }

  #ensureNetworkEntry(chainId: Hex | CaipChainId, enable = false): void {
    const { namespace, storageKey } = this.#deriveKeys(chainId);
    this.update((s) => {
      this.#ensureNamespaceBucket(s, namespace);
      if (!(storageKey in s.enabledNetworkMap[namespace])) {
        s.enabledNetworkMap[namespace][storageKey] = enable;
      }
    });
  }

  #removeNetworkEntry(chainId: Hex | CaipChainId): void {
    const { namespace, storageKey } = this.#deriveKeys(chainId);
    this.update((s) => {
      delete s.enabledNetworkMap[namespace]?.[storageKey];
      if (Object.keys(s.enabledNetworkMap[namespace] ?? {}).length === 0) {
        delete s.enabledNetworkMap[namespace];
      }
      this.#ensureAtLeastOneEnabled(s);
    });
  }

  #ensureAtLeastOneEnabled(state: NetworkEnablementControllerState) {
    const anyEnabled = Object.values(state.enabledNetworkMap).some((map) =>
      Object.values(map).some(Boolean),
    );
    if (!anyEnabled) {
      this.#ensureNamespaceBucket(state, KnownCaipNamespace.Eip155);
      state.enabledNetworkMap[KnownCaipNamespace.Eip155 as string][
        ChainId[BuiltInNetworkName.Mainnet]
      ] = true;
    }
  }

  #isKnownNetwork(caipId: CaipChainId): boolean {
    const { namespace, reference } = parseCaipChainId(caipId);
    if (namespace === (KnownCaipNamespace.Eip155 as string)) {
      const { networkConfigurationsByChainId } = this.messagingSystem.call(
        'NetworkController:getState',
      );
      return Boolean(networkConfigurationsByChainId[toHex(reference)]);
    }
    if (namespace === (KnownCaipNamespace.Solana as string)) {
      const { multichainNetworkConfigurationsByChainId } =
        this.messagingSystem.call('MultichainNetworkController:getState');
      return Boolean(multichainNetworkConfigurationsByChainId[caipId]);
    }
    return false;
  }

  #isPopularNetwork(caipId: CaipChainId | string): boolean {
    if (isHexString(caipId)) {
      return POPULATE_NETWORKS.includes(caipId as Hex);
    }
    const { namespace, reference } = parseCaipChainId(caipId);
    if (namespace === (KnownCaipNamespace.Eip155 as string)) {
      return POPULATE_NETWORKS.includes(toHex(reference));
    }
    return false;
  }

  #toggleNetwork(chainId: Hex | CaipChainId, enable: boolean): void {
    try {
      const { namespace, storageKey, caipId } = this.#deriveKeys(chainId);

      // Ignore unknown networks
      if (!this.#isKnownNetwork(caipId)) {
        return;
      }

      // Don’t disable the last remaining enabled network
      if (
        !enable &&
        Object.values(this.getAllEnabledNetworks()).flat().length <= 1
      ) {
        return;
      }

      this.update((s) => {
        // Ensure entry exists first
        this.#ensureNetworkEntry(chainId);

        // If enabling a non-popular network, disable all others
        if (enable && !this.#isPopularNetwork(caipId)) {
          Object.values(s.enabledNetworkMap).forEach((map) => {
            Object.keys(map).forEach((key) => {
              map[key] = false;
            });
          });
        }

        // disable all non popular networks when enabling a non popular network
        Object.values(s.enabledNetworkMap).forEach((map) => {
          Object.keys(map).forEach((key) => {
            if (!this.#isPopularNetwork(key)) {
              map[key] = false;
            }
          });
        });

        s.enabledNetworkMap[namespace][storageKey] = enable;
        this.#ensureAtLeastOneEnabled(s);
      });
    } catch (err) {
      console.error('[NetworkEnablement] toggle failed:', err);
    }
  }
}
