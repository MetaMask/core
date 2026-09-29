import {
  hasProperty,
  isValidHexAddress,
  parseCaipAccountId,
} from '@metamask/utils';
import type { CaipAccountId, Hex } from '@metamask/utils';

import {
  getChainId,
  HYPERLIQUID_L1_ACTION_DOMAIN_NAME,
  HYPERLIQUID_L1_ACTION_PRIMARY_TYPE,
} from '../constants/hyperLiquidConfig.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type {
  PerpsAgentSigner,
  PerpsPlatformDependencies,
  PerpsTypedDataPayload,
  PerpsTypedMessageParams,
} from '../types/index.js';
import type { PerpsControllerMessengerBase } from '../types/messenger.js';
import {
  getSelectedEvmAccountDetailsFromMessenger,
  getSelectedEvmAccountFromMessenger,
} from '../utils/accountUtils.js';
import {
  isAccountSignerReady,
  isMainAccountSignerReady,
} from './accountSigner.js';
import { AgentSignerUnavailableError } from './agentSigner.js';
import type { HyperLiquidWalletParams } from './HyperLiquidClientService.js';

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
 * Returns the agent that signs L1 actions for a main account, or null to sign
 * them with the main account.
 */
type AgentResolver = (mainAddress: Hex) => Promise<PerpsAgentSigner | null>;

/**
 * Whether a signing request is an L1 action.
 *
 * @param params - The typed data the SDK asked the wallet to sign.
 * @returns True for L1 actions.
 */
function isL1Action(params: PerpsTypedDataPayload): boolean {
  return (
    params.primaryType === HYPERLIQUID_L1_ACTION_PRIMARY_TYPE &&
    params.domain.name === HYPERLIQUID_L1_ACTION_DOMAIN_NAME
  );
}

/**
 * Service for MetaMask wallet integration with HyperLiquid SDK
 * Provides wallet adapter that implements AbstractWindowEthereum interface
 */
export class HyperLiquidWalletService {
  #isTestnet: boolean;

  // Platform dependencies for observability
  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessengerBase;

  readonly #resolveAgent: AgentResolver | undefined;

  constructor(
    deps: PerpsPlatformDependencies,
    messenger: PerpsControllerMessengerBase,
    options: { isTestnet?: boolean; resolveAgent?: AgentResolver } = {},
  ) {
    this.#deps = deps;
    this.#messenger = messenger;
    this.#isTestnet = options.isTestnet ?? false;
    this.#resolveAgent = options.resolveAgent;
  }

  /**
   * Check whether the main account can sign now: the injected account
   * signer's readiness when one is set, else the keyring's unlock state.
   *
   * @returns True when the main account is available for signing.
   */
  public isMainAccountSignerReady(): boolean {
    return isMainAccountSignerReady(
      this.#deps.accountSigner,
      () => this.#messenger.call('KeyringController:getState').isUnlocked,
    );
  }

  /**
   * Check whether every signature of the selected EVM account needs a user
   * confirmation, as with hardware. The injected account signer's
   * `requiresSignatureConfirmation()` decides when it answers; otherwise the
   * selected account's keyring type does.
   *
   * @returns True when signatures need a confirmation; false otherwise.
   */
  public requiresSignatureConfirmation(): boolean {
    const declared =
      this.#deps.accountSigner?.requiresSignatureConfirmation?.();
    if (declared !== undefined) {
      return declared;
    }

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
    if (!this.isMainAccountSignerReady()) {
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
   * Resolve the selected main account. It is read on every signature so an
   * account switch cannot race a cached adapter.
   *
   * @returns The selected main account address.
   */
  #getSelectedMainAddress(): Hex {
    const evmAccount = getSelectedEvmAccountFromMessenger(this.#messenger);

    if (!evmAccount?.address) {
      throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
    }

    return evmAccount.address as Hex;
  }

  /**
   * Sign typed data with the main account: through the injected account
   * signer when one is set, else through the keyring.
   *
   * @param mainAddress - The selected main account.
   * @param params - The typed data the SDK asked the wallet to sign.
   * @returns The signature.
   */
  async #signWithMainAccount(
    mainAddress: Hex,
    params: PerpsTypedDataPayload,
  ): Promise<Hex> {
    this.#deps.debugLogger.log('HyperLiquidWalletService: Signing typed data', {
      address: mainAddress,
      primaryType: params.primaryType,
      domain: params.domain,
    });

    const { accountSigner } = this.#deps;
    if (accountSigner) {
      if (!isAccountSignerReady(accountSigner)) {
        throw new Error(PERPS_ERROR_CODES.KEYRING_LOCKED);
      }
      try {
        return await accountSigner.signTypedData(mainAddress, params);
      } catch (error) {
        // A signer that locked while signing throws its own error.
        if (!isAccountSignerReady(accountSigner)) {
          throw new Error(PERPS_ERROR_CODES.KEYRING_LOCKED, { cause: error });
        }
        throw error;
      }
    }

    const signature = await this.#signTypedMessage({
      from: mainAddress,
      data: params,
    });

    return signature as Hex;
  }

  /**
   * Create the wallet adapter the HyperLiquid SDK signs with.
   *
   * Every signature is for the currently selected main account. When the
   * agent resolver returns an agent for that account, L1 actions (orders,
   * cancels, leverage, ...) are signed by the agent. User-signed actions
   * (builder fee, withdraw, ...) authorize the main account itself, so the
   * main account always signs them.
   *
   * @returns The wallet adapter with address, signTypedData, and getChainId methods.
   */
  public createWalletAdapter(): HyperLiquidWalletParams {
    return {
      address: this.#getSelectedMainAddress(),
      signTypedData: async (params: PerpsTypedDataPayload): Promise<Hex> => {
        const mainAddress = this.#getSelectedMainAddress();
        const agentSigner =
          this.#resolveAgent && isL1Action(params)
            ? await this.#resolveAgent(mainAddress)
            : null;
        if (!agentSigner) {
          return await this.#signWithMainAccount(mainAddress, params);
        }
        this.#deps.debugLogger.log(
          'HyperLiquidWalletService: Signing L1 action with agent',
          { address: mainAddress, agent: agentSigner.address },
        );
        try {
          return await agentSigner.signTypedData(params);
        } catch (error) {
          // The host could not sign with its agent key (for example it locked
          // after resolving it). Retryable, like a locked keyring.
          throw new AgentSignerUnavailableError(error);
        }
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
