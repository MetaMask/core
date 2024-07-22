import {
  ETHERSCAN_SUPPORTED_CHAIN_IDS,
  __privateAdd,
  __privateMethod
} from "./chunk-FT2APC4J.mjs";

// src/PreferencesController.ts
import {
  BaseController
} from "@metamask/base-controller";
import { toChecksumHexAddress } from "@metamask/controller-utils";
var metadata = {
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
  useTransactionSimulations: { persist: true, anonymous: true }
};
var name = "PreferencesController";
function getDefaultPreferencesState() {
  return {
    featureFlags: {},
    identities: {},
    ipfsGateway: "https://ipfs.io/ipfs/",
    isIpfsGatewayEnabled: true,
    isMultiAccountBalancesEnabled: true,
    lostIdentities: {},
    openSeaEnabled: false,
    securityAlertsEnabled: false,
    selectedAddress: "",
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
      [ETHERSCAN_SUPPORTED_CHAIN_IDS.GNOSIS]: true
    },
    showTestNetworks: false,
    useNftDetection: false,
    useTokenDetection: true,
    smartTransactionsOptInStatus: false,
    useTransactionSimulations: true
  };
}
var _syncIdentities, syncIdentities_fn;
var PreferencesController = class extends BaseController {
  /**
   * Creates a PreferencesController instance.
   *
   * @param args - Arguments
   * @param args.messenger - The preferences controller messenger.
   * @param args.state - Preferences controller state.
   */
  constructor({
    messenger,
    state
  }) {
    super({
      name,
      metadata,
      messenger,
      state: {
        ...getDefaultPreferencesState(),
        ...state
      }
    });
    /**
     * Synchronizes the current identity list with new identities.
     *
     * @param addresses - List of addresses corresponding to identities to sync.
     */
    __privateAdd(this, _syncIdentities);
    messenger.subscribe(
      "KeyringController:stateChange",
      (keyringState) => {
        const accounts = /* @__PURE__ */ new Set();
        for (const keyring of keyringState.keyrings) {
          for (const account of keyring.accounts) {
            accounts.add(account);
          }
        }
        if (accounts.size > 0) {
          __privateMethod(this, _syncIdentities, syncIdentities_fn).call(this, Array.from(accounts));
        }
      }
    );
  }
  /**
   * Adds identities to state.
   *
   * @param addresses - List of addresses to use to generate new identities.
   */
  addIdentities(addresses) {
    const checksummedAddresses = addresses.map(
      (address) => toChecksumHexAddress(address)
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
          importTime: Date.now()
        };
      }
    });
  }
  /**
   * Removes an identity from state.
   *
   * @param address - Address of the identity to remove.
   */
  removeIdentity(address) {
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
  setAccountLabel(address, label) {
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
  setFeatureFlag(feature, activated) {
    this.update((state) => {
      state.featureFlags[feature] = activated;
    });
  }
  /**
   * Sets selected address.
   *
   * @param selectedAddress - Ethereum address.
   */
  setSelectedAddress(selectedAddress) {
    this.update((state) => {
      state.selectedAddress = toChecksumHexAddress(selectedAddress);
    });
  }
  /**
   * Sets new IPFS gateway.
   *
   * @param ipfsGateway - IPFS gateway string.
   */
  setIpfsGateway(ipfsGateway) {
    this.update((state) => {
      state.ipfsGateway = ipfsGateway;
    });
  }
  /**
   * Toggle the token detection setting.
   *
   * @param useTokenDetection - Boolean indicating user preference on token detection.
   */
  setUseTokenDetection(useTokenDetection) {
    this.update((state) => {
      state.useTokenDetection = useTokenDetection;
    });
  }
  /**
   * Toggle the NFT detection setting.
   *
   * @param useNftDetection - Boolean indicating user preference on NFT detection.
   */
  setUseNftDetection(useNftDetection) {
    if (useNftDetection && !this.state.openSeaEnabled) {
      throw new Error(
        "useNftDetection cannot be enabled if openSeaEnabled is false"
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
  setOpenSeaEnabled(openSeaEnabled) {
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
  setSecurityAlertsEnabled(securityAlertsEnabled) {
    this.update((state) => {
      state.securityAlertsEnabled = securityAlertsEnabled;
    });
  }
  /**
   * A setter for the user preferences to enable/disable fetch of multiple accounts balance.
   *
   * @param isMultiAccountBalancesEnabled - true to enable multiple accounts balance fetch, false to fetch only selectedAddress.
   */
  setIsMultiAccountBalancesEnabled(isMultiAccountBalancesEnabled) {
    this.update((state) => {
      state.isMultiAccountBalancesEnabled = isMultiAccountBalancesEnabled;
    });
  }
  /**
   * A setter for the user have the test networks visible/hidden.
   *
   * @param showTestNetworks - true to show test networks, false to hidden.
   */
  setShowTestNetworks(showTestNetworks) {
    this.update((state) => {
      state.showTestNetworks = showTestNetworks;
    });
  }
  /**
   * A setter for the user allow to be fetched IPFS content
   *
   * @param isIpfsGatewayEnabled - true to enable ipfs source
   */
  setIsIpfsGatewayEnabled(isIpfsGatewayEnabled) {
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
  setEnableNetworkIncomingTransactions(chainId, isIncomingTransactionNetworkEnable) {
    if (Object.values(ETHERSCAN_SUPPORTED_CHAIN_IDS).includes(chainId)) {
      this.update((state) => {
        state.showIncomingTransactions = {
          ...this.state.showIncomingTransactions,
          [chainId]: isIncomingTransactionNetworkEnable
        };
      });
    }
  }
  /**
   * A setter for the user to opt into smart transactions
   *
   * @param smartTransactionsOptInStatus - true to opt into smart transactions
   */
  setSmartTransactionsOptInStatus(smartTransactionsOptInStatus) {
    this.update((state) => {
      state.smartTransactionsOptInStatus = smartTransactionsOptInStatus;
    });
  }
  /**
   * A setter for the user preferences to enable/disable transaction simulations.
   *
   * @param useTransactionSimulations - true to enable transaction simulations, false to disable it.
   */
  setUseTransactionSimulations(useTransactionSimulations) {
    this.update((state) => {
      state.useTransactionSimulations = useTransactionSimulations;
    });
  }
};
_syncIdentities = new WeakSet();
syncIdentities_fn = function(addresses) {
  addresses = addresses.map(
    (address) => toChecksumHexAddress(address)
  );
  this.update((state) => {
    const { identities } = state;
    const newlyLost = {};
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
};
var PreferencesController_default = PreferencesController;

export {
  getDefaultPreferencesState,
  PreferencesController,
  PreferencesController_default
};
//# sourceMappingURL=chunk-KFN3X2JE.mjs.map