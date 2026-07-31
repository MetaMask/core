import { BaseController } from '@metamask/base-controller';
import type {
  StateMetadata,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import {
  normalizeEnsName,
  isValidHexAddress,
  isSafeDynamicKey,
  toChecksumHexAddress,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkState,
} from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { createProjectLogger } from '@metamask/utils';
import { toASCII } from 'punycode/punycode.js';
import type { Address, Chain, Client } from 'viem';
import { createClient, custom } from 'viem';
import { getEnsAddress, getEnsName } from 'viem/actions';
import { mainnet, sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';

import type { EnsControllerMethodActions } from './EnsController-method-action-types.js';

const log = createProjectLogger('ens-controller');

const name = 'EnsController';

const MESSENGER_EXPOSED_METHODS = [
  'clear',
  'delete',
  'get',
  'resetState',
  'reverseResolveAddress',
  'set',
] as const;

// Map of chainIDs and ENS universal resolver contract addresses (ENSIP-23
// proxy, upgraded in place by the ENS DAO to support ENSv2 on launch).
export const DEFAULT_ENS_NETWORK_MAP: Record<number, Hex> = {
  // Mainnet
  1: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
  // Sepolia
  11155111: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
};

// Chains with a viem definition that includes an `ensUniversalResolver`
// contract, used as the default source of universal resolver addresses.
const VIEM_CHAINS_BY_ID: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
};

/**
 * @type EnsEntry
 *
 * ENS entry representation
 *
 * @property chainId - Id of the associated chain
 * @property ensName - The ENS name
 * @property address - Hex address with the ENS name, or null
 */
export type EnsEntry = {
  chainId: Hex;
  ensName: string;
  address: string | null;
};

/**
 * @type EnsControllerState
 *
 * ENS controller state
 *
 * @property ensEntries - Object of ENS entry objects
 */
export type EnsControllerState = {
  ensEntries: {
    [chainId: Hex]: {
      [ensName: string]: EnsEntry;
    };
  };
  ensResolutionsByAddress: { [key: string]: string };
};

export type EnsControllerGetStateAction = ControllerGetStateAction<
  typeof name,
  EnsControllerState
>;

export type EnsControllerActions =
  | EnsControllerGetStateAction
  | EnsControllerMethodActions;

export type EnsControllerEvents = ControllerStateChangeEvent<
  typeof name,
  EnsControllerState
>;

export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction;

export type EnsControllerMessenger = Messenger<
  typeof name,
  EnsControllerActions | AllowedActions,
  EnsControllerEvents
>;

const metadata: StateMetadata<EnsControllerState> = {
  ensEntries: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  ensResolutionsByAddress: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
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
export class EnsController extends BaseController<
  typeof name,
  EnsControllerState,
  EnsControllerMessenger
> {
  #ethClient: Client | null = null;

  /**
   * Creates an EnsController instance.
   *
   * @param options - Constructor options.
   * @param options.registriesByChainId - Map between chain IDs and ENS contract addresses.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.onNetworkDidChange - Allows subscribing to network controller networkDidChange events.
   */
  constructor({
    registriesByChainId = DEFAULT_ENS_NETWORK_MAP,
    messenger,
    state = {},
    onNetworkDidChange,
  }: {
    registriesByChainId?: Record<number, Hex>;
    messenger: EnsControllerMessenger;
    state?: Partial<EnsControllerState>;
    onNetworkDidChange?: (
      listener: (networkState: NetworkState) => void,
    ) => void;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: {
        ...defaultState,
        ensEntries: Object.fromEntries(
          Object.entries(registriesByChainId).map(([chainId, address]) => [
            toHex(chainId),
            {
              '.': {
                address,
                chainId: toHex(chainId),
                ensName: '.',
              },
            },
          ]),
        ),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.#setDefaultEthProvider(registriesByChainId);

    if (onNetworkDidChange) {
      onNetworkDidChange(({ selectedNetworkClientId }) => {
        this.resetState();
        this.#setEthProvider(selectedNetworkClientId, registriesByChainId);
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
  delete(chainId: Hex, ensName: string): boolean {
    const normalizedEnsName = normalizeEnsName(ensName);
    if (
      !isSafeDynamicKey(chainId) ||
      !normalizedEnsName ||
      !this.state.ensEntries[chainId]?.[normalizedEnsName]
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
  get(chainId: Hex, ensName: string): EnsEntry | null {
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
  set(chainId: Hex, ensName: string, address: string | null): boolean {
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

    if (subState?.[normalizedEnsName]?.address === normalizedAddress) {
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

  #setDefaultEthProvider(registriesByChainId?: Record<number, Hex>) {
    const { selectedNetworkClientId } = this.messenger.call(
      'NetworkController:getState',
    );
    this.#setEthProvider(selectedNetworkClientId, registriesByChainId);
  }

  #setEthProvider(
    selectedNetworkClientId: string,
    registriesByChainId?: Record<number, Hex>,
  ) {
    const {
      configuration: { chainId: currentChainId },
      provider,
    } = this.messenger.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );

    const chainIdDecimal = convertHexToDecimal(currentChainId);
    const chain = VIEM_CHAINS_BY_ID[chainIdDecimal];

    if (
      registriesByChainId?.[chainIdDecimal] &&
      this.#getChainEnsSupport(currentChainId) &&
      chain
    ) {
      // viem resolves ENS names through the `ensUniversalResolver` contract
      // defined on the chain.
      this.#ethClient = createClient({
        chain,
        transport: custom(provider),
      });
    } else {
      this.#ethClient = null;
    }
  }

  /**
   * Check if the chain supports ENS.
   *
   * @param chainId - chain id.
   * @returns Boolean indicating if the chain supports ENS.
   */
  #getChainEnsSupport(chainId: Hex) {
    return Boolean(this.state.ensEntries[chainId]);
  }

  /**
   * Resolve ens by address.
   *
   * @param nonChecksummedAddress - address
   * @returns ens resolution
   */
  async reverseResolveAddress(nonChecksummedAddress: string) {
    if (!this.#ethClient) {
      return undefined;
    }

    const address = toChecksumHexAddress(nonChecksummedAddress);
    if (this.state.ensResolutionsByAddress[address]) {
      return this.state.ensResolutionsByAddress[address];
    }

    let domain: string | null;
    try {
      domain = await getEnsName(this.#ethClient, {
        address: address as Address,
      });
    } catch (error) {
      log(error);
      return undefined;
    }

    if (!domain) {
      return undefined;
    }

    let registeredAddress: string | null;
    try {
      registeredAddress = await getEnsAddress(this.#ethClient, {
        name: normalize(domain),
      });
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
