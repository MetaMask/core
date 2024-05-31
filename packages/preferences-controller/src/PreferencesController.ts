import {
  BaseController,
  type ControllerStateChangeEvent,
  type ControllerGetStateAction,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type {
  KeyringControllerState,
  KeyringControllerStateChangeEvent,
} from '@metamask/keyring-controller';

import { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';

/**
 * A representation of a MetaMask identity
 */
export type Identity = {
  /**
   * The address of the identity
   */
  address: string;
  /**
   * The timestamp for when this identity was first added
   */
  importTime?: number;
  /**
   * The name of the identity
   */
  name: string;
};

/**
 * A type union of the name for each chain that is supported by Etherscan or
 * an Etherscan-compatible service.
 */
export type EtherscanSupportedChains =
  keyof typeof ETHERSCAN_SUPPORTED_CHAIN_IDS;

/**
 * A type union of the chain ID for each chain that is supported by Etherscan
 * or an Etherscan-compatible service.
 */
export type EtherscanSupportedHexChainId =
  (typeof ETHERSCAN_SUPPORTED_CHAIN_IDS)[EtherscanSupportedChains];

/**
 * Preferences controller state
 */
export type PreferencesState = {
  /**
   * Map of specific features to enable or disable
   */
  featureFlags: { [feature: string]: boolean };
  /**
   * Map of addresses to Identity objects
   */
  identities: { [address: string]: Identity };
  /**
   * The configured IPFS gateway
   */
  ipfsGateway: string;
  /**
   * Controls whether IPFS is enabled or not
   */
  isIpfsGatewayEnabled: boolean;
  /**
   * Controls whether multi-account balances are enabled or not
   */
  isMultiAccountBalancesEnabled: boolean;
  /**
   * Map of lost addresses to Identity objects
   */
  lostIdentities: { [address: string]: Identity };
  /**
   * Controls whether the OpenSea API is used
   */
  openSeaEnabled: boolean;
  /**
   * Controls whether "security alerts" are enabled
   */
  securityAlertsEnabled: boolean;
  /**
   * The current selected address
   */
  selectedAddress: string;
  /**
   * Controls whether incoming transactions are enabled, per-chain (for Etherscan-supported chains)
   */
  showIncomingTransactions: {
    [chainId in EtherscanSupportedHexChainId]: boolean;
  };
  /**
   * Controls whether test networks are shown in the wallet
   */
  showTestNetworks: boolean;
  /**
   * Controls whether NFT detection is enabled
   */
  useNftDetection: boolean;
  /**
   * Controls whether token detection is enabled
   */
  useTokenDetection: boolean;
  /**
   * Controls whether smart transactions are opted into
   */
  smartTransactionsOptInStatus: boolean;
  /**
   * Controls whether transaction simulations are enabled
   */
  useTransactionSimulations: boolean;
};

const metadata = {
  featureFlags: { persist: true, anonymous: true },
  identities: { persist: true, anonymous: false },
  ipfsGateway: { persist: true, anonymous: false },
  isIpfsGatewayEnabled: { persist: true, anonymous: true },
  isMultiAccountBalancesEnabled: { persist: true, anonymous: true },
  lostIdentities: { persist: true, anonymous: false },
  openSeaEnabled: { persist: true, anonymous: true },
  securityAlertsEnabled: { persist: true, anonymous: true },
  selectedAddress: { persist: true, anonymous: false },
  showTestNetworks: { persist: true, anonymous: true },
  showIncomingTransactions: { persist: true, anonymous: true },
  useNftDetection: { persist: true, anonymous: true },
  useTokenDetection: { persist: true, anonymous: true },
  smartTransactionsOptInStatus: { persist: true, anonymous: false },
  useTransactionSimulations: { persist: true, anonymous: true },
};

const name = 'PreferencesController';

export type PreferencesControllerGetStateAction = ControllerGetStateAction<
  typeof name,
  PreferencesState
>;

export type PreferencesControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof name,
  PreferencesState
>;

export type PreferencesControllerActions = PreferencesControllerGetStateAction;

export type PreferencesControllerEvents = PreferencesControllerStateChangeEvent;

export type AllowedEvents = KeyringControllerStateChangeEvent;

export type PreferencesControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  PreferencesControllerActions,
  PreferencesControllerEvents | AllowedEvents,
  never,
  AllowedEvents['type']
>;

/**
 * Get the default PreferencesController state.
 *
 * @returns The default PreferencesController state.
 */
export function getDefaultPreferencesState() {
  return {
    featureFlags: {},
    identities: {},
    ipfsGateway: 'https://ipfs.io/ipfs/',
    isIpfsGatewayEnabled: true,
    isMultiAccountBalancesEnabled: true,
    lostIdentities: {},
    openSeaEnabled: false,
    securityAlertsEnabled: false,
    selectedAddress: '',
    showIncomingTransactions: {
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MAINNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.GOERLI]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.BSC]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.BSC_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.OPTIMISM]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.OPTIMISM_SEPOLIA]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.POLYGON]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.POLYGON_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.AVALANCHE]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.AVALANCHE_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.FANTOM]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.FANTOM_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.SEPOLIA]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.LINEA_GOERLI]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.LINEA_SEPOLIA]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.LINEA_MAINNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MOONBEAM]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MOONBEAM_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MOONRIVER]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.GNOSIS]: true,
    },
    showTestNetworks: false,
    useNftDetection: false,
    useTokenDetection: true,
    smartTransactionsOptInStatus: false,
    useTransactionSimulations: true,
  };
}

/**
 * Controller that stores shared settings and exposes convenience methods
 */
export class PreferencesController extends BaseController<
  typeof name,
  PreferencesState,
  PreferencesControllerMessenger
> {
  /**
   * Creates a PreferencesController instance.
   *
   * @param args - Arguments
   * @param args.messenger - The preferences controller messenger.
   * @param args.state - Preferences controller state.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: PreferencesControllerMessenger;
    state?: Partial<PreferencesState>;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: {
        ...getDefaultPreferencesState(),
        ...state,
      },
    });

    messenger.subscribe(
      'KeyringController:stateChange',
      (keyringState: KeyringControllerState) => {
        const accounts = new Set<string>();
        for (const keyring of keyringState.keyrings) {
          for (const account of keyring.accounts) {
            accounts.add(account);
          }
        }
        if (accounts.size > 0) {
          this.#syncIdentities(Array.from(accounts));
        }
      },
    );
  }

  /**
   * Adds identities to state.
   *
   * @param addresses - List of addresses to use to generate new identities.
   */
  addIdentities(addresses: string[]) {
    const checksummedAddresses = addresses.map((address) =>
      toChecksumHexAddress(address),
    );
    this.update((state) => {
      const { identities } = state;
      for (const address of checksummedAddresses) {
        if (identities[address]) {
          continue;
        }
        const identityCount = Object.keys(identities).length;

        identities[address] = {
          name: `Account ${identityCount + 1}`,
          address,
          importTime: Date.now(),
        };
      }
    });
  }

  /**
   * Removes an identity from state.
   *
   * @param address - Address of the identity to remove.
   */
  removeIdentity(address: string) {
    address = toChecksumHexAddress(address);
    const { identities } = this.state;
    if (!identities[address]) {
      return;
    }
    this.update((state) => {
      delete state.identities[address];
      if (address === state.selectedAddress) {
        state.selectedAddress = Object.keys(state.identities)[0];
      }
    });
  }

  /**
   * Associates a new label with an identity.
   *
   * @param address - Address of the identity to associate.
   * @param label - New label to assign.
   */
  setAccountLabel(address: string, label: string) {
    address = toChecksumHexAddress(address);
    this.update((state) => {
      const identity = state.identities[address] || {};
      identity.name = label;
      state.identities[address] = identity;
    });
  }

  /**
   * Enable or disable a specific feature flag.
   *
   * @param feature - Feature to toggle.
   * @param activated - Value to assign.
   */
  setFeatureFlag(feature: string, activated: boolean) {
    this.update((state) => {
      state.featureFlags[feature] = activated;
    });
  }

  /**
   * Synchronizes the current identity list with new identities.
   *
   * @param addresses - List of addresses corresponding to identities to sync.
   */
  #syncIdentities(addresses: string[]) {
    addresses = addresses.map((address: string) =>
      toChecksumHexAddress(address),
    );

    this.update((state) => {
      const { identities } = state;
      const newlyLost: { [address: string]: Identity } = {};

      for (const [address, identity] of Object.entries(identities)) {
        if (!addresses.includes(address)) {
          newlyLost[address] = identity;
          delete identities[address];
        }
      }

      for (const [address, identity] of Object.entries(newlyLost)) {
        state.lostIdentities[address] = identity;
      }
    });
    this.addIdentities(addresses);

    if (!addresses.includes(this.state.selectedAddress)) {
      this.update((state) => {
        state.selectedAddress = addresses[0];
      });
    }
  }

  /**
   * Sets selected address.
   *
   * @param selectedAddress - Ethereum address.
   */
  setSelectedAddress(selectedAddress: string) {
    this.update((state) => {
      state.selectedAddress = toChecksumHexAddress(selectedAddress);
    });
  }

  /**
   * Sets new IPFS gateway.
   *
   * @param ipfsGateway - IPFS gateway string.
   */
  setIpfsGateway(ipfsGateway: string) {
    this.update((state) => {
      state.ipfsGateway = ipfsGateway;
    });
  }

  /**
   * Toggle the token detection setting.
   *
   * @param useTokenDetection - Boolean indicating user preference on token detection.
   */
  setUseTokenDetection(useTokenDetection: boolean) {
    this.update((state) => {
      state.useTokenDetection = useTokenDetection;
    });
  }

  /**
   * Toggle the NFT detection setting.
   *
   * @param useNftDetection - Boolean indicating user preference on NFT detection.
   */
  setUseNftDetection(useNftDetection: boolean) {
    if (useNftDetection && !this.state.openSeaEnabled) {
      throw new Error(
        'useNftDetection cannot be enabled if openSeaEnabled is false',
      );
    }
    this.update((state) => {
      state.useNftDetection = useNftDetection;
    });
  }

  /**
   * Toggle the opensea enabled setting.
   *
   * @param openSeaEnabled - Boolean indicating user preference on using OpenSea's API.
   */
  setOpenSeaEnabled(openSeaEnabled: boolean) {
    this.update((state) => {
      state.openSeaEnabled = openSeaEnabled;
      if (!openSeaEnabled) {
        state.useNftDetection = false;
      }
    });
  }

  /**
   * Toggle the security alert enabled setting.
   *
   * @param securityAlertsEnabled - Boolean indicating user preference on using security alerts.
   */
  setSecurityAlertsEnabled(securityAlertsEnabled: boolean) {
    this.update((state) => {
      state.securityAlertsEnabled = securityAlertsEnabled;
    });
  }

  /**
   * A setter for the user preferences to enable/disable fetch of multiple accounts balance.
   *
   * @param isMultiAccountBalancesEnabled - true to enable multiple accounts balance fetch, false to fetch only selectedAddress.
   */
  setIsMultiAccountBalancesEnabled(isMultiAccountBalancesEnabled: boolean) {
    this.update((state) => {
      state.isMultiAccountBalancesEnabled = isMultiAccountBalancesEnabled;
    });
  }

  /**
   * A setter for the user have the test networks visible/hidden.
   *
   * @param showTestNetworks - true to show test networks, false to hidden.
   */
  setShowTestNetworks(showTestNetworks: boolean) {
    this.update((state) => {
      state.showTestNetworks = showTestNetworks;
    });
  }

  /**
   * A setter for the user allow to be fetched IPFS content
   *
   * @param isIpfsGatewayEnabled - true to enable ipfs source
   */
  setIsIpfsGatewayEnabled(isIpfsGatewayEnabled: boolean) {
    this.update((state) => {
      state.isIpfsGatewayEnabled = isIpfsGatewayEnabled;
    });
  }

  /**
   * A setter for the user allow to be fetched IPFS content
   *
   * @param chainId - On hexadecimal format to enable the incoming transaction network
   * @param isIncomingTransactionNetworkEnable - true to enable incoming transactions
   */
  setEnableNetworkIncomingTransactions(
    chainId: EtherscanSupportedHexChainId,
    isIncomingTransactionNetworkEnable: boolean,
  ) {
    if (Object.values(ETHERSCAN_SUPPORTED_CHAIN_IDS).includes(chainId)) {
      this.update((state) => {
        state.showIncomingTransactions = {
          ...this.state.showIncomingTransactions,
          [chainId]: isIncomingTransactionNetworkEnable,
        };
      });
    }
  }

  /**
   * A setter for the user to opt into smart transactions
   *
   * @param smartTransactionsOptInStatus - true to opt into smart transactions
   */
  setSmartTransactionsOptInStatus(smartTransactionsOptInStatus: boolean) {
    this.update((state) => {
      state.smartTransactionsOptInStatus = smartTransactionsOptInStatus;
    });
  }

  /**
   * A setter for the user preferences to enable/disable transaction simulations.
   *
   * @param useTransactionSimulations - true to enable transaction simulations, false to disable it.
   */
  setUseTransactionSimulations(useTransactionSimulations: boolean) {
    this.update((state) => {
      state.useTransactionSimulations = useTransactionSimulations;
    });
  }
}

export default PreferencesController;
