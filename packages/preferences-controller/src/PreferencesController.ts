import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';

/**
 * ContactEntry representation.
 *
 * @property address - Hex address of a recipient account
 * @property name - Nickname associated with this address
 * @property importTime - Data time when an account as created/imported
 */
export interface ContactEntry {
  address: string;
  name: string;
  importTime?: number;
}

/**
 * @type PreferencesState
 *
 * Preferences controller state
 * @property featureFlags - Map of specific features to enable or disable
 * @property identities - Map of addresses to ContactEntry objects
 * @property lostIdentities - Map of lost addresses to ContactEntry objects
 * @property selectedAddress - Current coinbase account
 */
export interface PreferencesState extends BaseState {
  featureFlags: { [feature: string]: boolean };
  ipfsGateway: string;
  identities: { [address: string]: ContactEntry };
  lostIdentities: { [address: string]: ContactEntry };
  selectedAddress: string;
  useTokenDetection: boolean;
  useNftDetection: boolean;
  openSeaEnabled: boolean;
  isMultiAccountBalancesEnabled: boolean;
  disabledRpcMethodPreferences: {
    [methodName: string]: boolean;
  };
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
      identities: {},
      ipfsGateway: 'https://ipfs.io/ipfs/',
      lostIdentities: {},
      selectedAddress: '',
      useTokenDetection: true,
      useNftDetection: false,
      openSeaEnabled: false,
      isMultiAccountBalancesEnabled: true,
      disabledRpcMethodPreferences: {
        eth_sign: false,
      },
    };
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
}

export default PreferencesController;
