import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  Web3Provider,
  ExternalProvider,
  JsonRpcFetchFunc,
} from '@ethersproject/providers';
import { createProjectLogger, hasProperty } from '@metamask/utils';
import {
  normalizeEnsName,
  isValidHexAddress,
  toChecksumHexAddress,
  NETWORK_ID_TO_ETHERS_NETWORK_NAME_MAP,
  convertHexToDecimal,
} from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';
import { toASCII } from 'punycode/';
import ensNetworkMap from 'ethereum-ens-network-map';

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
 * @property chainId - Id of the associated chain
 * @property ensName - The ENS name
 * @property address - Hex address with the ENS name, or null
 */
export type EnsEntry = {
  chainId: string;
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
    [chainId: string]: {
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
 * by chainId. A null address indicates an unresolved ENS name.
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
            chainId: convertHexToDecimal(networkState.providerConfig.chainId),
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
   * @param chainId - Parent chain of the ENS entry to delete.
   * @param ensName - Name of the ENS entry to delete.
   * @returns Boolean indicating if the entry was deleted.
   */
  delete(chainId: string, ensName: string): boolean {
    const normalizedEnsName = normalizeEnsName(ensName);
    if (
      !normalizedEnsName ||
      !this.state.ensEntries[chainId] ||
      !this.state.ensEntries[chainId][normalizedEnsName]
    ) {
      return false;
    }

    this.update((state) => {
      delete state.ensEntries[chainId][normalizedEnsName];

      if (Object.keys(state.ensEntries[chainId]).length === 0) {
        delete state.ensEntries[chainId];
      }
    });
    return true;
  }

  /**
   * Retrieve a DNS entry.
   *
   * @param chainId - Parent chain of the ENS entry to retrieve.
   * @param ensName - Name of the ENS entry to retrieve.
   * @returns The EnsEntry or null if it does not exist.
   */
  get(chainId: string, ensName: string): EnsEntry | null {
    const normalizedEnsName = normalizeEnsName(ensName);

    // TODO Explicitly handle the case where `normalizedEnsName` is `null`
    // eslint-disable-next-line no-implicit-coercion
    return !!normalizedEnsName && this.state.ensEntries[chainId]
      ? this.state.ensEntries[chainId][normalizedEnsName] || null
      : null;
  }

  /**
   * Add or update an ENS entry by chainId and ensName.
   *
   * A null address indicates that the ENS name does not resolve.
   *
   * @param chainId - Id of the associated chain.
   * @param ensName - The ENS name.
   * @param address - Associated address (or null) to add or update.
   * @returns Boolean indicating if the entry was set.
   */
  set(chainId: string, ensName: string, address: string | null): boolean {
    if (
      !Number.isInteger(Number.parseInt(chainId, 10)) ||
      !ensName ||
      typeof ensName !== 'string' ||
      (address && !isValidHexAddress(address))
    ) {
      throw new Error(
        `Invalid ENS entry: { chainId:${chainId}, ensName:${ensName}, address:${address}}`,
      );
    }

    const normalizedEnsName = normalizeEnsName(ensName);
    if (!normalizedEnsName) {
      throw new Error(`Invalid ENS name: ${ensName}`);
    }

    const normalizedAddress = address ? toChecksumHexAddress(address) : null;
    const subState = this.state.ensEntries[chainId];

    if (
      subState?.[normalizedEnsName] &&
      subState[normalizedEnsName].address === normalizedAddress
    ) {
      return false;
    }

    this.update((state) => {
      state.ensEntries = {
        ...this.state.ensEntries,
        [chainId]: {
          ...this.state.ensEntries[chainId],
          [normalizedEnsName]: {
            address: normalizedAddress,
            chainId,
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
