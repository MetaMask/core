import { BaseController } from '@metamask/base-controller';
import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import { ETHERSCAN_SUPPORTED_CHAIN_IDS } from './constants';

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

type TokenSortConfig = {
  key: string;
  order: 'asc' | 'dsc';
  sortCallback: string;
};

/**
 * Preferences controller state
 */
export type PreferencesState = {
  /**
   * Map of specific features to enable or disable
   */
  featureFlags: { [feature: string]: boolean };
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
   * Controls whether the OpenSea API is used
   */
  displayNftMedia: boolean;
  /**
   * Controls whether "security alerts" are enabled
   */
  securityAlertsEnabled: boolean;
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
  /**
   * Controls whether Multi rpc modal is displayed or not
   */
  showMultiRpcModal: boolean;
  /**
   * Controls whether to use the safe chains list validation
   */
  useSafeChainsListValidation: boolean;
  /**
   * Controls which order tokens are sorted in
   */
  tokenSortConfig: TokenSortConfig;
  /**
   * Controls whether balance and assets are hidden or not
   */
  privacyMode: boolean;
  /**
   * Allow user to stop being prompted for smart account upgrade
   */
  dismissSmartAccountSuggestionEnabled: boolean;
  /**
   * User to opt in for smart account upgrade for all user accounts.
   */
  smartAccountOptIn: boolean;
  /**
   * Controls token filtering controls
   */
  tokenNetworkFilter: Record<string, boolean>;
};

const metadata = {
  featureFlags: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  ipfsGateway: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  isIpfsGatewayEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  isMultiAccountBalancesEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  displayNftMedia: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  securityAlertsEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  showTestNetworks: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  showIncomingTransactions: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  useNftDetection: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  useTokenDetection: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  smartTransactionsOptInStatus: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  useTransactionSimulations: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  showMultiRpcModal: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  useSafeChainsListValidation: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  tokenSortConfig: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  privacyMode: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  dismissSmartAccountSuggestionEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  smartAccountOptIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  tokenNetworkFilter: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
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

export type PreferencesControllerMessenger = Messenger<
  typeof name,
  PreferencesControllerActions,
  PreferencesControllerEvents
>;

/**
 * Get the default PreferencesController state.
 *
 * @returns The default PreferencesController state.
 */
export function getDefaultPreferencesState(): PreferencesState {
  return {
    featureFlags: {},
    ipfsGateway: 'https://ipfs.io/ipfs/',
    isIpfsGatewayEnabled: true,
    isMultiAccountBalancesEnabled: true,
    displayNftMedia: false,
    securityAlertsEnabled: false,
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
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.SEI]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.MONAD]: true,
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.HYPEREVM]: true,
    },
    showTestNetworks: false,
    useNftDetection: false,
    useTokenDetection: true,
    showMultiRpcModal: false,
    smartTransactionsOptInStatus: true,
    useTransactionSimulations: true,
    useSafeChainsListValidation: true,
    tokenSortConfig: {
      key: 'tokenFiatAmount',
      order: 'dsc',
      sortCallback: 'stringNumeric',
    },
    privacyMode: false,
    dismissSmartAccountSuggestionEnabled: false,
    smartAccountOptIn: true,
    tokenNetworkFilter: {},
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
  }

  /**
   * Enable or disable a specific feature flag.
   *
   * @param feature - Feature to toggle.
   * @param activated - Value to assign.
   */
  setFeatureFlag(feature: string, activated: boolean): void {
    this.update((state) => {
      state.featureFlags[feature] = activated;
    });
  }

  /**
   * Sets new IPFS gateway.
   *
   * @param ipfsGateway - IPFS gateway string.
   */
  setIpfsGateway(ipfsGateway: string): void {
    this.update((state) => {
      state.ipfsGateway = ipfsGateway;
    });
  }

  /**
   * Toggle the token detection setting.
   *
   * @param useTokenDetection - Boolean indicating user preference on token detection.
   */
  setUseTokenDetection(useTokenDetection: boolean): void {
    this.update((state) => {
      state.useTokenDetection = useTokenDetection;
    });
  }

  /**
   * Toggle the NFT detection setting.
   *
   * @param useNftDetection - Boolean indicating user preference on NFT detection.
   */
  setUseNftDetection(useNftDetection: boolean): void {
    if (useNftDetection && !this.state.displayNftMedia) {
      throw new Error(
        'useNftDetection cannot be enabled if displayNftMedia is false',
      );
    }
    this.update((state) => {
      state.useNftDetection = useNftDetection;
    });
  }

  /**
   * Toggle the display nft media enabled setting.
   *
   * @param displayNftMedia - Boolean indicating user preference on using OpenSea's API.
   */
  setDisplayNftMedia(displayNftMedia: boolean): void {
    this.update((state) => {
      state.displayNftMedia = displayNftMedia;
      if (!displayNftMedia) {
        state.useNftDetection = false;
      }
    });
  }

  /**
   * Toggle the security alert enabled setting.
   *
   * @param securityAlertsEnabled - Boolean indicating user preference on using security alerts.
   */
  setSecurityAlertsEnabled(securityAlertsEnabled: boolean): void {
    this.update((state) => {
      state.securityAlertsEnabled = securityAlertsEnabled;
    });
  }

  /**
   * A setter for the user preferences to enable/disable fetch of multiple accounts balance.
   *
   * @param isMultiAccountBalancesEnabled - true to enable multiple accounts balance fetch, false to fetch only selectedAddress.
   */
  setIsMultiAccountBalancesEnabled(
    isMultiAccountBalancesEnabled: boolean,
  ): void {
    this.update((state) => {
      state.isMultiAccountBalancesEnabled = isMultiAccountBalancesEnabled;
    });
  }

  /**
   * A setter for the user have the test networks visible/hidden.
   *
   * @param showTestNetworks - true to show test networks, false to hidden.
   */
  setShowTestNetworks(showTestNetworks: boolean): void {
    this.update((state) => {
      state.showTestNetworks = showTestNetworks;
    });
  }

  /**
   * A setter for the user allow to be fetched IPFS content
   *
   * @param isIpfsGatewayEnabled - true to enable ipfs source
   */
  setIsIpfsGatewayEnabled(isIpfsGatewayEnabled: boolean): void {
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
  ): void {
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
   * Toggle multi rpc migration modal.
   *
   * @param showMultiRpcModal - Boolean indicating if the multi rpc modal will be displayed or not.
   */
  setShowMultiRpcModal(showMultiRpcModal: boolean): void {
    this.update((state) => {
      state.showMultiRpcModal = showMultiRpcModal;
      if (!showMultiRpcModal) {
        state.showMultiRpcModal = false;
      }
    });
  }

  /**
   * A setter for the user to opt into smart transactions
   *
   * @param smartTransactionsOptInStatus - true to opt into smart transactions
   */
  setSmartTransactionsOptInStatus(smartTransactionsOptInStatus: boolean): void {
    this.update((state) => {
      state.smartTransactionsOptInStatus = smartTransactionsOptInStatus;
    });
  }

  /**
   * A setter for the user preferences to enable/disable transaction simulations.
   *
   * @param useTransactionSimulations - true to enable transaction simulations, false to disable it.
   */
  setUseTransactionSimulations(useTransactionSimulations: boolean): void {
    this.update((state) => {
      state.useTransactionSimulations = useTransactionSimulations;
    });
  }

  /**
   * A setter to update the user's preferred token sorting order.
   *
   * @param tokenSortConfig - a configuration representing the sort order of tokens.
   */
  setTokenSortConfig(tokenSortConfig: TokenSortConfig): void {
    this.update((state) => {
      state.tokenSortConfig = tokenSortConfig;
    });
  }

  /**
   * A setter for the user preferences to enable/disable safe chains list validation.
   *
   * @param useSafeChainsListValidation - true to enable safe chains list validation, false to disable it.
   */
  setUseSafeChainsListValidation(useSafeChainsListValidation: boolean): void {
    this.update((state) => {
      state.useSafeChainsListValidation = useSafeChainsListValidation;
    });
  }

  /**
   * A setter for the user preferences to enable/disable privacy mode.
   *
   * @param privacyMode - true to enable privacy mode, false to disable it.
   */
  setPrivacyMode(privacyMode: boolean): void {
    this.update((state) => {
      state.privacyMode = privacyMode;
    });
  }

  /**
   * A setter for the user preferences dismiss smart account upgrade prompt.
   *
   * @param dismissSmartAccountSuggestionEnabled - true to dismiss smart account upgrade prompt, false to enable it.
   */
  setDismissSmartAccountSuggestionEnabled(
    dismissSmartAccountSuggestionEnabled: boolean,
  ): void {
    this.update((state) => {
      state.dismissSmartAccountSuggestionEnabled =
        dismissSmartAccountSuggestionEnabled;
    });
  }

  /**
   * A setter for the user preferences smart account OptIn.
   *
   * @param smartAccountOptIn - true if user opts in for smart account update, false otherwise.
   */
  setSmartAccountOptIn(smartAccountOptIn: boolean): void {
    this.update((state) => {
      state.smartAccountOptIn = smartAccountOptIn;
    });
  }

  /**
   * Set the token network filter configuration setting.
   *
   * @param tokenNetworkFilter - Object describing token network filter configuration.
   */
  setTokenNetworkFilter(tokenNetworkFilter: Record<string, boolean>): void {
    this.update((state) => {
      state.tokenNetworkFilter = tokenNetworkFilter;
    });
  }
}

export default PreferencesController;
