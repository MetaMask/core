import type { BaseConfig } from '@metamask/base-controller';
import { BaseControllerV1 } from '@metamask/base-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';

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
   * A map of RPC method names to enabled state (true is enabled, false is disabled)
   */
  disabledRpcMethodPreferences: {
    [methodName: string]: boolean;
  };
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
   * The name of the controller
   *
   * @deprecated This property is never set, and will be removed in a future release
   */
  name?: string;
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
};

/**
 * Get the default PreferencesController state.
 *
 * @returns The default PreferencesController state.
 */
export function getDefaultPreferencesState() {
  return {
    disabledRpcMethodPreferences: {
      eth_sign: false,
    },
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
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.OPTIMISM_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.POLYGON]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.POLYGON_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.AVALANCHE]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.AVALANCHE_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.FANTOM]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.FANTOM_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.SEPOLIA]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.LINEA_GOERLI]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.LINEA_MAINNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MOONBEAM]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MOONBEAM_TESTNET]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MOONRIVER]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.GNOSIS]: true,
    },
    showTestNetworks: false,
    useNftDetection: false,
    useTokenDetection: true,
  };
}

/**
 * Controller that stores shared settings and exposes convenience methods
 */
export class PreferencesController extends BaseControllerV1<
  BaseConfig,
  PreferencesState
> {
  /**
   * Name of this controller used during composition
   */
  override name = 'PreferencesController';

  /**
   * Creates a PreferencesController instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(config?: Partial<BaseConfig>, state?: Partial<PreferencesState>) {
    super(config, state);
    this.defaultState = getDefaultPreferencesState();
    this.initialize();
  }

  /**
   * Adds identities to state.
   *
   * @param addresses - List of addresses to use to generate new identities.
   */
  addIdentities(addresses: string[]) {
    const { identities } = this.state;
    addresses.forEach((address) => {
      address = toChecksumHexAddress(address);
      if (identities[address]) {
        return;
      }
      const identityCount = Object.keys(identities).length;

      identities[address] = {
        name: `Account ${identityCount + 1}`,
        address,
        importTime: Date.now(),
      };
    });
    this.update({ identities: { ...identities } });
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
    delete identities[address];
    this.update({ identities: { ...identities } });
    if (address === this.state.selectedAddress) {
      this.update({ selectedAddress: Object.keys(identities)[0] });
    }
  }

  /**
   * Associates a new label with an identity.
   *
   * @param address - Address of the identity to associate.
   * @param label - New label to assign.
   */
  setAccountLabel(address: string, label: string) {
    address = toChecksumHexAddress(address);
    const { identities } = this.state;
    identities[address] = identities[address] || {};
    identities[address].name = label;
    this.update({ identities: { ...identities } });
  }

  /**
   * Enable or disable a specific feature flag.
   *
   * @param feature - Feature to toggle.
   * @param activated - Value to assign.
   */
  setFeatureFlag(feature: string, activated: boolean) {
    const oldFeatureFlags = this.state.featureFlags;
    const featureFlags = { ...oldFeatureFlags, ...{ [feature]: activated } };
    this.update({ featureFlags: { ...featureFlags } });
  }

  /**
   * Synchronizes the current identity list with new identities.
   *
   * @param addresses - List of addresses corresponding to identities to sync.
   * @returns Newly-selected address after syncing.
   */
  syncIdentities(addresses: string[]) {
    addresses = addresses.map((address: string) =>
      toChecksumHexAddress(address),
    );
    const { identities, lostIdentities } = this.state;
    const newlyLost: { [address: string]: Identity } = {};

    for (const [address, identity] of Object.entries(identities)) {
      if (!addresses.includes(address)) {
        newlyLost[address] = identity;
        delete identities[address];
      }
    }

    for (const [address, identity] of Object.entries(newlyLost)) {
      lostIdentities[address] = identity;
    }

    this.update({
      identities: { ...identities },
      lostIdentities: { ...lostIdentities },
    });
    this.addIdentities(addresses);

    if (!addresses.includes(this.state.selectedAddress)) {
      this.update({ selectedAddress: addresses[0] });
    }

    return this.state.selectedAddress;
  }

  /**
   * Generates and stores a new list of stored identities based on address. If the selected address
   * is unset, or if it refers to an identity that was removed, it will be set to the first
   * identity.
   *
   * @param addresses - List of addresses to use as a basis for each identity.
   */
  updateIdentities(addresses: string[]) {
    addresses = addresses.map((address: string) =>
      toChecksumHexAddress(address),
    );
    const oldIdentities = this.state.identities;
    const identities = addresses.reduce(
      (ids: { [address: string]: Identity }, address, index) => {
        ids[address] = oldIdentities[address] || {
          address,
          name: `Account ${index + 1}`,
          importTime: Date.now(),
        };
        return ids;
      },
      {},
    );
    let { selectedAddress } = this.state;
    if (!Object.keys(identities).includes(selectedAddress)) {
      selectedAddress = Object.keys(identities)[0];
    }
    this.update({ identities: { ...identities }, selectedAddress });
  }

  /**
   * Sets selected address.
   *
   * @param selectedAddress - Ethereum address.
   */
  setSelectedAddress(selectedAddress: string) {
    this.update({ selectedAddress: toChecksumHexAddress(selectedAddress) });
  }

  /**
   * Sets new IPFS gateway.
   *
   * @param ipfsGateway - IPFS gateway string.
   */
  setIpfsGateway(ipfsGateway: string) {
    this.update({ ipfsGateway });
  }

  /**
   * Toggle the token detection setting.
   *
   * @param useTokenDetection - Boolean indicating user preference on token detection.
   */
  setUseTokenDetection(useTokenDetection: boolean) {
    this.update({ useTokenDetection });
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
    this.update({ useNftDetection });
  }

  /**
   * Toggle the opensea enabled setting.
   *
   * @param openSeaEnabled - Boolean indicating user preference on using OpenSea's API.
   */
  setOpenSeaEnabled(openSeaEnabled: boolean) {
    this.update({ openSeaEnabled });
    if (!openSeaEnabled) {
      this.update({ useNftDetection: false });
    }
  }

  /**
   * Toggle the security alert enabled setting.
   *
   * @param securityAlertsEnabled - Boolean indicating user preference on using security alerts.
   */
  setSecurityAlertsEnabled(securityAlertsEnabled: boolean) {
    this.update({ securityAlertsEnabled });
  }

  /**
   * A setter for the user preferences to enable/disable rpc methods.
   *
   * @param methodName - The RPC method name to change the setting of.
   * @param isEnabled - true to enable the rpc method, false to disable it.
   */
  setDisabledRpcMethodPreference(methodName: string, isEnabled: boolean) {
    const { disabledRpcMethodPreferences } = this.state;
    const newDisabledRpcMethods = {
      ...disabledRpcMethodPreferences,
      [methodName]: isEnabled,
    };
    this.update({ disabledRpcMethodPreferences: newDisabledRpcMethods });
  }

  /**
   * A setter for the user preferences to enable/disable fetch of multiple accounts balance.
   *
   * @param isMultiAccountBalancesEnabled - true to enable multiple accounts balance fetch, false to fetch only selectedAddress.
   */
  setIsMultiAccountBalancesEnabled(isMultiAccountBalancesEnabled: boolean) {
    this.update({ isMultiAccountBalancesEnabled });
  }

  /**
   * A setter for the user have the test networks visible/hidden.
   *
   * @param showTestNetworks - true to show test networks, false to hidden.
   */
  setShowTestNetworks(showTestNetworks: boolean) {
    this.update({ showTestNetworks });
  }

  /**
   * A setter for the user allow to be fetched IPFS content
   *
   * @param isIpfsGatewayEnabled - true to enable ipfs source
   */
  setIsIpfsGatewayEnabled(isIpfsGatewayEnabled: boolean) {
    this.update({ isIpfsGatewayEnabled });
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
      this.update({
        showIncomingTransactions: {
          ...this.state.showIncomingTransactions,
          [chainId]: isIncomingTransactionNetworkEnable,
        },
      });
    }
  }
}

export default PreferencesController;
