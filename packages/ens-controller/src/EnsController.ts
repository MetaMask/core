// I'm not certain this file should be converted to use caip chain id. It is Eth specific.
import type {
  ExternalProvider,
  JsonRpcFetchFunc,
} from '@ethersproject/providers';
import { Web3Provider } from '@ethersproject/providers';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import {
  normalizeEnsName,
  isValidHexAddress,
  toChecksumHexAddress,
  NETWORK_ID_TO_ETHERS_NETWORK_NAME_MAP,
  getEthChainIdIntFromCaipChainId,
  isEthCaipChainId,
} from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';
import type { CaipChainId } from '@metamask/utils';
import { createProjectLogger, hasProperty } from '@metamask/utils';
import ensNetworkMap from 'ethereum-ens-network-map';
import { toASCII } from 'punycode/';

const log = createProjectLogger('ens-controller');

/**
 * Checks whether the given string is a known network ID.
 *
 * @param networkId - Network id.
 * @returns Boolean indicating if the network ID is recognized.
 */
function isKnownNetworkId(
  networkId: string | null,
): networkId is keyof typeof NETWORK_ID_TO_ETHERS_NETWORK_NAME_MAP {
  return (
    networkId !== null &&
    hasProperty(NETWORK_ID_TO_ETHERS_NETWORK_NAME_MAP, networkId)
  );
}

const name = 'EnsController';

/**
 * @type EnsEntry
 *
 * ENS entry representation
 * @property caipChainId - caip chain id of the associated chain
 * @property ensName - The ENS name
 * @property address - Hex address with the ENS name, or null
 */
export type EnsEntry = {
  caipChainId: CaipChainId;
  ensName: string;
  address: string | null;
};

/**
 * @type EnsControllerState
 *
 * ENS controller state
 * @property ensEntries - Object of ENS entry objects
 */
export type EnsControllerState = {
  ensEntries: {
    [caipChainId: CaipChainId]: {
      [ensName: string]: EnsEntry;
    };
  };
  ensResolutionsByAddress: { [key: string]: string };
};

export type EnsControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  never,
  never,
  never,
  never
>;

const metadata = {
  ensEntries: { persist: true, anonymous: false },
  ensResolutionsByAddress: { persist: true, anonymous: false },
};

const defaultState = {
  ensEntries: {},
  ensResolutionsByAddress: {},
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_X_ERROR_ADDRESS = '0x';

/**
 * Controller that manages a list ENS names and their resolved addresses
 * by caipChainId. A null address indicates an unresolved ENS name.
 */
export class EnsController extends BaseControllerV2<
  typeof name,
  EnsControllerState,
  EnsControllerMessenger
> {
  #ethProvider: Web3Provider | null = null;

  /**
   * Creates an EnsController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.provider - Provider instance.
   * @param options.onNetworkStateChange - Allows registering an event handler for
   * when the network controller state updated.
   */
  constructor({
    messenger,
    state = {},
    provider,
    onNetworkStateChange,
  }: {
    messenger: EnsControllerMessenger;
    state?: Partial<EnsControllerState>;
    provider?: ExternalProvider | JsonRpcFetchFunc;
    onNetworkStateChange?: (
      listener: (
        networkState: Pick<NetworkState, 'networkId' | 'providerConfig'>,
      ) => void,
    ) => void;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: {
        ...defaultState,
        ...state,
      },
    });

    if (provider && onNetworkStateChange) {
      onNetworkStateChange((networkState) => {
        this.resetState();
        const currentNetwork = networkState.networkId;
        if (
          isKnownNetworkId(currentNetwork) &&
          this.#getNetworkEnsSupport(currentNetwork)
        ) {
          this.#ethProvider = new Web3Provider(provider, {
            chainId: getEthChainIdIntFromCaipChainId(
              networkState.providerConfig.caipChainId,
            ),
            name: NETWORK_ID_TO_ETHERS_NETWORK_NAME_MAP[currentNetwork],
            ensAddress: ensNetworkMap[currentNetwork],
          });
        } else {
          this.#ethProvider = null;
        }
      });
    }
  }

  /**
   * Clears ensResolutionsByAddress state property.
   */
  resetState() {
    this.update((currentState) => {
      currentState.ensResolutionsByAddress = {};
    });
  }

  /**
   * Remove all chain Ids and ENS entries from state.
   */
  clear() {
    this.update((state) => {
      state.ensEntries = {};
    });
  }

  /**
   * Delete an ENS entry.
   *
   * @param caipChainId - Parent caip chain id of the ENS entry to delete.
   * @param ensName - Name of the ENS entry to delete.
   * @returns Boolean indicating if the entry was deleted.
   */
  delete(caipChainId: CaipChainId, ensName: string): boolean {
    const normalizedEnsName = normalizeEnsName(ensName);
    if (
      !normalizedEnsName ||
      !this.state.ensEntries[caipChainId] ||
      !this.state.ensEntries[caipChainId][normalizedEnsName]
    ) {
      return false;
    }

    this.update((state) => {
      delete state.ensEntries[caipChainId][normalizedEnsName];

      if (Object.keys(state.ensEntries[caipChainId]).length === 0) {
        delete state.ensEntries[caipChainId];
      }
    });
    return true;
  }

  /**
   * Retrieve a DNS entry.
   *
   * @param caipChainId - Parent caip chain id of the ENS entry to retrieve.
   * @param ensName - Name of the ENS entry to retrieve.
   * @returns The EnsEntry or null if it does not exist.
   */
  get(caipChainId: CaipChainId, ensName: string): EnsEntry | null {
    const normalizedEnsName = normalizeEnsName(ensName);

    // TODO Explicitly handle the case where `normalizedEnsName` is `null`
    // eslint-disable-next-line no-implicit-coercion
    return !!normalizedEnsName && this.state.ensEntries[caipChainId]
      ? this.state.ensEntries[caipChainId][normalizedEnsName] || null
      : null;
  }

  /**
   * Add or update an ENS entry by caipChainId and ensName.
   *
   * A null address indicates that the ENS name does not resolve.
   *
   * @param caipChainId - Caip chain id of the associated chain.
   * @param ensName - The ENS name.
   * @param address - Associated address (or null) to add or update.
   * @returns Boolean indicating if the entry was set.
   */
  set(
    caipChainId: CaipChainId,
    ensName: string,
    address: string | null,
  ): boolean {
    if (
      !isEthCaipChainId(caipChainId) || // is this right?
      !ensName ||
      typeof ensName !== 'string' ||
      (address && !isValidHexAddress(address))
    ) {
      throw new Error(
        `Invalid ENS entry: { caipChainId:${caipChainId}, ensName:${ensName}, address:${address}}`,
      );
    }

    const normalizedEnsName = normalizeEnsName(ensName);
    if (!normalizedEnsName) {
      throw new Error(`Invalid ENS name: ${ensName}`);
    }

    const normalizedAddress = address ? toChecksumHexAddress(address) : null;
    const subState = this.state.ensEntries[caipChainId];

    if (
      subState?.[normalizedEnsName] &&
      subState[normalizedEnsName].address === normalizedAddress
    ) {
      return false;
    }

    this.update((state) => {
      state.ensEntries = {
        ...this.state.ensEntries,
        [caipChainId]: {
          ...this.state.ensEntries[caipChainId],
          [normalizedEnsName]: {
            address: normalizedAddress,
            caipChainId,
            ensName: normalizedEnsName,
          },
        },
      };
    });
    return true;
  }

  /**
   * Check if network supports ENS.
   *
   * @param networkId - Network id.
   * @returns Boolean indicating if the network supports ENS.
   */
  #getNetworkEnsSupport(networkId: string) {
    return Boolean(ensNetworkMap[networkId]);
  }

  /**
   * Resolve ens by address.
   *
   * @param nonChecksummedAddress - address
   * @returns ens resolution
   */
  async reverseResolveAddress(nonChecksummedAddress: string) {
    if (!this.#ethProvider) {
      return undefined;
    }

    const address = toChecksumHexAddress(nonChecksummedAddress);
    if (this.state.ensResolutionsByAddress[address]) {
      return this.state.ensResolutionsByAddress[address];
    }

    let domain: string | null;
    try {
      domain = await this.#ethProvider.lookupAddress(address);
    } catch (error) {
      log(error);
      return undefined;
    }

    if (!domain) {
      return undefined;
    }

    let registeredAddress: string | null;
    try {
      registeredAddress = await this.#ethProvider.resolveName(domain);
    } catch (error) {
      log(error);
      return undefined;
    }

    if (!registeredAddress) {
      return undefined;
    }

    if (
      registeredAddress === ZERO_ADDRESS ||
      registeredAddress === ZERO_X_ERROR_ADDRESS
    ) {
      return undefined;
    }
    if (toChecksumHexAddress(registeredAddress) !== address) {
      return undefined;
    }

    this.update((state) => {
      state.ensResolutionsByAddress[address] = toASCII(domain as string);
    });

    return domain;
  }
}

export default EnsController;
