import { BaseController, BaseConfig, BaseState } from '../BaseController';
import { toChecksumHexAddress } from '../util';
import { ContactEntry } from './AddressBookController';

// explain(minhdoan): rpc network information

/**
 * Custom RPC network information
 *
 * @property rpcUrl - RPC target URL.
 * @property chainId - Network ID as per EIP-155
 * @property nickname - Personalized network name.
 * @property ticker - Currency ticker.
 * @property rpcPrefs - Personalized preferences.
 */
export interface FrequentRpc {
  rpcUrl: string;
  chainId?: number;
  nickname?: string;
  ticker?: string;
  rpcPrefs?: RpcPreferences;
}

// explain(minhdoan): block explorer url
/**
 * Custom RPC network preferences
 *
 * @param blockExplorerUrl - Block explorer URL.
 */
export interface RpcPreferences {
  blockExplorerUrl: string;
}

// explain(minhdoan): thông tin rpc, ipfs, lost identities,
// current selected Address, useTokenDection, openSeaEnabled
/**
 * @type PreferencesState
 *
 * Preferences controller state
 * @property featureFlags - Map of specific features to enable or disable
 * @property frequentRpcList - A list of custom RPCs to provide the user
 * @property identities - Map of addresses to ContactEntry objects
 * @property lostIdentities - Map of lost addresses to ContactEntry objects
 * @property selectedAddress - Current coinbase account
 */
export interface PreferencesState extends BaseState {
  featureFlags: { [feature: string]: boolean };
  frequentRpcList: FrequentRpc[];
  ipfsGateway: string;
  identities: { [address: string]: ContactEntry };
  lostIdentities: { [address: string]: ContactEntry };
  selectedAddress: string;
  useTokenDetection: boolean;
  useCollectibleDetection: boolean;
  openSeaEnabled: boolean;
}

/**
 * Controller that stores shared settings and exposes convenience methods
 */
export class PreferencesController extends BaseController<
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
    this.defaultState = {
      featureFlags: {},
      frequentRpcList: [],
      identities: {},
      ipfsGateway: 'https://ipfs.io/ipfs/',
      lostIdentities: {},
      selectedAddress: '',
      useTokenDetection: true,
      useCollectibleDetection: false,
      openSeaEnabled: false,
    };
    this.initialize();
  }

  // explain(minhdoan): add them identities - tao new accounts tren metamask
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


  // explain(minhdoan): remove accounts tren metamask
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
    const newlyLost: { [address: string]: ContactEntry } = {};

    for (const identity in identities) {
      if (addresses.indexOf(identity) === -1) {
        newlyLost[identity] = identities[identity];
        delete identities[identity];
      }
    }

    if (Object.keys(newlyLost).length > 0) {
      for (const key in newlyLost) {
        lostIdentities[key] = newlyLost[key];
      }
    }

    this.update({
      identities: { ...identities },
      lostIdentities: { ...lostIdentities },
    });
    this.addIdentities(addresses);

    if (addresses.indexOf(this.state.selectedAddress) === -1) {
      this.update({ selectedAddress: addresses[0] });
    }

    return this.state.selectedAddress;
  }

  // explain(minhdoan): update lai identities, neu ma selected address unset hoac la identity do'
  // removed thi se set la index 0
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
      (ids: { [address: string]: ContactEntry }, address, index) => {
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

  // add new customized network
  /**
   * Adds custom RPC URL to state.
   *
   * @param url - The custom RPC URL.
   * @param chainId - The chain ID of the network, as per EIP-155.
   * @param ticker - Currency ticker.
   * @param nickname - Personalized network name.
   * @param rpcPrefs - Personalized preferences.
   */
  addToFrequentRpcList(
    url: string,
    chainId?: number,
    ticker?: string,
    nickname?: string,
    rpcPrefs?: RpcPreferences,
  ) {
    const { frequentRpcList } = this.state;
    const index = frequentRpcList.findIndex(({ rpcUrl }) => {
      return rpcUrl === url;
    });
    if (index !== -1) {
      frequentRpcList.splice(index, 1);
    }
    const newFrequestRpc: FrequentRpc = {
      rpcUrl: url,
      chainId,
      ticker,
      nickname,
      rpcPrefs,
    };
    frequentRpcList.push(newFrequestRpc);
    this.update({ frequentRpcList: [...frequentRpcList] });
  }

  // remove 1 network
  /**
   * Removes custom RPC URL from state.
   *
   * @param url - Custom RPC URL.
   */
  removeFromFrequentRpcList(url: string) {
    const { frequentRpcList } = this.state;
    const index = frequentRpcList.findIndex(({ rpcUrl }) => {
      return rpcUrl === url;
    });
    if (index !== -1) {
      frequentRpcList.splice(index, 1);
    }
    this.update({ frequentRpcList: [...frequentRpcList] });
  }

  // chon select address
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
   * Toggle the collectible detection setting.
   *
   * @param useCollectibleDetection - Boolean indicating user preference on collectible detection.
   */
  setUseCollectibleDetection(useCollectibleDetection: boolean) {
    if (useCollectibleDetection && !this.state.openSeaEnabled) {
      throw new Error(
        'useCollectibleDetection cannot be enabled if openSeaEnabled is false',
      );
    }
    this.update({ useCollectibleDetection });
  }

  /**
   * Toggle the opensea enabled setting.
   *
   * @param openSeaEnabled - Boolean indicating user preference on using OpenSea's API.
   */
  setOpenSeaEnabled(openSeaEnabled: boolean) {
    this.update({ openSeaEnabled });
    if (!openSeaEnabled) {
      this.update({ useCollectibleDetection: false });
    }
  }
}

export default PreferencesController;
