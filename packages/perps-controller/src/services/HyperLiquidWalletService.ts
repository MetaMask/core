import {
  hasProperty,
  isValidHexAddress,
  parseCaipAccountId,
} from '@metamask/utils';
import type { CaipAccountId, Hex } from '@metamask/utils';

import { getChainId } from '../constants/hyperLiquidConfig.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type {
  PerpsPlatformDependencies,
  PerpsTypedMessageParams,
} from '../types/index.js';
import type { PerpsControllerMessengerBase } from '../types/messenger.js';
import {
  getSelectedEvmAccountDetailsFromMessenger,
  getSelectedEvmAccountFromMessenger,
} from '../utils/accountUtils.js';

// Mirrors KeyringTypes from @metamask/keyring-controller. Inlined to keep this
// service portable between mobile and the core monorepo.
const HARDWARE_KEYRING_TYPES = new Set<string>([
  'Ledger Hardware',
  'Trezor Hardware',
  'OneKey Hardware',
  'Lattice Hardware',
  'QR Hardware Wallet Device',
]);

/**
 * A local signer for a HyperLiquid agent account, in the SDK-native
 * `AbstractEthersV6Signer` shape (positional EIP-712 arguments, message as
 * the signed value). Provided by the client (e.g. a local key stored in
 * memory) so agent actions never touch the keyring.
 */
export type AgentSigner = {
  /** The agent account address used as the actor for signed actions. */
  address: `0x${string}`;
  /**
   * Sign EIP-712 typed data with the agent key.
   *
   * @param domain - The EIP-712 domain.
   * @param domain.name - The domain name.
   * @param domain.version - The domain version.
   * @param domain.chainId - The domain chain ID.
   * @param domain.verifyingContract - The verifying contract address.
   * @param types - The EIP-712 type definitions (without `EIP712Domain`).
   * @param value - The message payload to sign.
   * @returns The 65-byte hex signature.
   */
  signTypedData(
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}`;
    },
    types: {
      [key: string]: { name: string; type: string }[];
    },
    value: Record<string, unknown>,
  ): Promise<string>;
};

/** Options bag for {@link HyperLiquidWalletService}. */
export type HyperLiquidWalletServiceOptions = {
  isTestnet?: boolean;
  /**
   * Resolves the local agent signer for a master account address, or null
   * when the account has no active agent or the wallet is locked. When it
   * returns a signer, wallet adapters sign with the agent key instead of
   * contacting the keyring.
   */
  getAgentSigner?: (
    masterAccountAddress: string,
  ) => Promise<AgentSigner | null>;
};

/**
 * Service for MetaMask wallet integration with HyperLiquid SDK
 * Provides wallet adapter that implements AbstractWindowEthereum interface
 */
export class HyperLiquidWalletService {
  #isTestnet: boolean;

  // Platform dependencies for observability
  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessengerBase;

  readonly #getAgentSigner?:
    | ((masterAccountAddress: string) => Promise<AgentSigner | null>)
    | undefined;

  constructor(
    deps: PerpsPlatformDependencies,
    messenger: PerpsControllerMessengerBase,
    options: HyperLiquidWalletServiceOptions = {},
  ) {
    this.#deps = deps;
    this.#messenger = messenger;
    this.#isTestnet = options.isTestnet ?? false;
    this.#getAgentSigner = options.getAgentSigner;
  }

  /**
   * Check if the keyring is currently unlocked
   *
   * @returns True if the keyring is unlocked and available for signing.
   */
  public isKeyringUnlocked(): boolean {
    return this.#messenger.call('KeyringController:getState').isUnlocked;
  }

  /**
   * Check whether the selected EVM account is backed by hardware.
   *
   * @returns True for MetaMask hardware keyrings; false for software accounts.
   */
  public isSelectedHardwareWallet(): boolean {
    const selectedEvmAccount = getSelectedEvmAccountDetailsFromMessenger(
      this.#messenger,
    );
    if (!selectedEvmAccount || !hasProperty(selectedEvmAccount, 'metadata')) {
      return false;
    }

    const metadata = selectedEvmAccount.metadata as
      | { keyring?: { type?: string } }
      | undefined;
    const keyringType = metadata?.keyring?.type;

    return Boolean(keyringType && HARDWARE_KEYRING_TYPES.has(keyringType));
  }

  /**
   * Sign typed data via DI keyring controller
   *
   * @param msgParams - The typed message parameters including data and sender address.
   * @returns The signature string.
   */
  async #signTypedMessage(msgParams: PerpsTypedMessageParams): Promise<string> {
    if (!this.isKeyringUnlocked()) {
      throw new Error(PERPS_ERROR_CODES.KEYRING_LOCKED);
    }
    // Cast needed: PerpsTypedMessageParams uses loose `data: unknown` type
    // while KeyringController uses strict TypedMessageParams / SignTypedDataVersion
    return this.#messenger.call(
      'KeyringController:signTypedMessage',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      msgParams as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'V4' as any,
    );
  }

  /**
   * Create a wallet adapter backed by a local agent signer.
   *
   * The returned adapter keeps the params-style `signTypedData` shape the SDK
   * already accepts (viem local account), but delegates directly to the
   * injected signer — no keyring messenger call is ever made. The SDK's viem
   * adapters inject an `EIP712Domain` entry into `types` before calling
   * params-style wallets; ethers-style signers reject that entry, so it is
   * stripped before delegation.
   *
   * @param agentSigner - The local agent signer to delegate to.
   * @returns The agent wallet adapter.
   */
  public createAgentWalletAdapter(agentSigner: AgentSigner): {
    address: Hex;
    signTypedData: (params: {
      domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Hex;
      };
      types: {
        [key: string]: { name: string; type: string }[];
      };
      primaryType: string;
      message: Record<string, unknown>;
    }) => Promise<Hex>;
    getChainId?: () => Promise<number>;
  } {
    return {
      address: agentSigner.address,
      signTypedData: async (params: {
        domain: {
          name: string;
          version: string;
          chainId: number;
          verifyingContract: Hex;
        };
        types: {
          [key: string]: { name: string; type: string }[];
        };
        primaryType: string;
        message: Record<string, unknown>;
      }): Promise<Hex> => {
        const { EIP712Domain: _eip712Domain, ...types } = params.types;

        this.#deps.debugLogger.log(
          'HyperLiquidWalletService: Signing typed data (agent mode)',
          {
            address: agentSigner.address,
            primaryType: params.primaryType,
          },
        );

        return (await agentSigner.signTypedData(
          params.domain,
          types,
          params.message,
        )) as Hex;
      },
      getChainId: async (): Promise<number> =>
        parseInt(getChainId(this.#isTestnet), 10),
    };
  }

  /**
   * Create wallet adapter that implements AbstractViemJsonRpcAccount interface
   * Required by @nktkas/hyperliquid SDK for signing transactions
   *
   * When the injected `getAgentSigner` resolves a signer for the selected
   * master account, the returned adapter signs with that local agent key and
   * never contacts the keyring. Otherwise the master keyring path is used,
   * unchanged.
   *
   * @returns The wallet adapter with address, signTypedData, and getChainId methods.
   */
  public async createWalletAdapter(): Promise<{
    address: Hex;
    signTypedData: (params: {
      domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Hex;
      };
      types: {
        [key: string]: { name: string; type: string }[];
      };
      primaryType: string;
      message: Record<string, unknown>;
    }) => Promise<Hex>;
    getChainId?: () => Promise<number>;
  }> {
    // Get current EVM account via DI messenger
    const evmAccount = getSelectedEvmAccountFromMessenger(this.#messenger);

    if (!evmAccount?.address) {
      throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
    }

    const address = evmAccount.address as Hex;

    // Agent mode: a local signer for this master account takes over signing
    // entirely. The unlocked-vault gate for agent signing is the in-memory
    // plaintext key (null while locked), not the keyring.
    const agentSigner = this.#getAgentSigner
      ? await this.#getAgentSigner(address)
      : null;
    if (agentSigner) {
      return this.createAgentWalletAdapter(agentSigner);
    }

    return {
      address,
      signTypedData: async (params: {
        domain: {
          name: string;
          version: string;
          chainId: number;
          verifyingContract: Hex;
        };
        types: {
          [key: string]: { name: string; type: string }[];
        };
        primaryType: string;
        message: Record<string, unknown>;
      }): Promise<Hex> => {
        // Get FRESH account on every sign to handle account switches
        // This prevents race conditions where wallet adapter was created with old account
        const currentEvmAccount = getSelectedEvmAccountFromMessenger(
          this.#messenger,
        );

        if (!currentEvmAccount?.address) {
          throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
        }

        const currentAddress = currentEvmAccount.address as Hex;

        // Construct EIP-712 typed data
        const typedData = {
          domain: params.domain,
          types: params.types,
          primaryType: params.primaryType,
          message: params.message,
        };

        this.#deps.debugLogger.log(
          'HyperLiquidWalletService: Signing typed data',
          {
            address: currentAddress,
            primaryType: params.primaryType,
            domain: params.domain,
          },
        );

        // Use messenger to sign typed data
        const signature = await this.#signTypedMessage({
          from: currentAddress,
          data: typedData,
        });

        return signature as Hex;
      },
      getChainId: async (): Promise<number> =>
        parseInt(getChainId(this.#isTestnet), 10),
    };
  }

  /**
   * Get current account ID using messenger
   *
   * @returns The CAIP account ID for the current EVM account.
   */
  public async getCurrentAccountId(): Promise<CaipAccountId> {
    const evmAccount = getSelectedEvmAccountFromMessenger(this.#messenger);

    if (!evmAccount?.address) {
      throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
    }

    const chainId = getChainId(this.#isTestnet);
    const caipAccountId: CaipAccountId = `eip155:${chainId}:${evmAccount.address}`;

    return caipAccountId;
  }

  /**
   * Get validated user address as Hex from account ID
   *
   * @param accountId - The CAIP account ID to extract the address from.
   * @returns The validated hex address.
   */
  public getUserAddress(accountId: CaipAccountId): Hex {
    const parsed = parseCaipAccountId(accountId);
    const address = parsed.address as Hex;

    if (!isValidHexAddress(address)) {
      throw new Error(PERPS_ERROR_CODES.INVALID_ADDRESS_FORMAT);
    }

    return address;
  }

  /**
   * Get user address with default fallback to current account
   *
   * @param accountId - Optional CAIP account ID; defaults to current account if omitted.
   * @returns The validated hex address.
   */
  public async getUserAddressWithDefault(
    accountId?: CaipAccountId,
  ): Promise<Hex> {
    const id = accountId ?? (await this.getCurrentAccountId());
    return this.getUserAddress(id);
  }

  /**
   * Update testnet mode
   *
   * @param isTestnet - Whether to enable testnet mode.
   */
  public setTestnetMode(isTestnet: boolean): void {
    this.#isTestnet = isTestnet;
  }

  /**
   * Check if running on testnet
   *
   * @returns True if the service is in testnet mode.
   */
  public isTestnetMode(): boolean {
    return this.#isTestnet;
  }
}
