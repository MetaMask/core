import {
  hasProperty,
  isValidHexAddress,
  parseCaipAccountId,
} from '@metamask/utils';
import type { CaipAccountId, Hex } from '@metamask/utils';

import { getChainId } from '../constants/hyperLiquidConfig.js';
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
import { isAccountSignerReady } from './accountSigner.js';
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
 * Service for MetaMask wallet integration with HyperLiquid SDK
 * Provides wallet adapter that implements AbstractWindowEthereum interface
 */
export class HyperLiquidWalletService {
  #isTestnet: boolean;

  // Platform dependencies for observability
  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessengerBase;

  constructor(
    deps: PerpsPlatformDependencies,
    messenger: PerpsControllerMessengerBase,
    options: { isTestnet?: boolean } = {},
  ) {
    this.#deps = deps;
    this.#messenger = messenger;
    this.#isTestnet = options.isTestnet ?? false;
  }

  /**
   * Check whether the main account can sign now: the injected account
   * signer's readiness when one is set, else the keyring's unlock state.
   *
   * @returns True when the main account is available for signing.
   */
  public isKeyringUnlocked(): boolean {
    const { accountSigner } = this.#deps;
    if (accountSigner) {
      return isAccountSignerReady(accountSigner);
    }
    return this.#messenger.call('KeyringController:getState').isUnlocked;
  }

  /**
   * Check whether the selected EVM account is backed by hardware. The
   * injected account signer's `isHardwareWallet()` decides when it answers;
   * otherwise the selected account's keyring type does.
   *
   * @returns True for hardware-backed accounts; false for software accounts.
   */
  public isSelectedHardwareWallet(): boolean {
    const declared = this.#deps.accountSigner?.isHardwareWallet?.();
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
   * Sign typed data with the selected main account: through the injected
   * account signer when one is set, else through the keyring. The account is
   * resolved on every call so an account switch cannot race a cached adapter.
   *
   * @param params - The typed data the SDK asked the wallet to sign.
   * @returns The signature.
   */
  async #signWithMainAccount(params: PerpsTypedDataPayload): Promise<Hex> {
    const currentEvmAccount = getSelectedEvmAccountFromMessenger(
      this.#messenger,
    );

    if (!currentEvmAccount?.address) {
      throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
    }

    const currentAddress = currentEvmAccount.address as Hex;

    this.#deps.debugLogger.log('HyperLiquidWalletService: Signing typed data', {
      address: currentAddress,
      primaryType: params.primaryType,
      domain: params.domain,
    });

    const { accountSigner } = this.#deps;
    if (accountSigner) {
      if (!isAccountSignerReady(accountSigner)) {
        throw new Error(PERPS_ERROR_CODES.KEYRING_LOCKED);
      }
      return await accountSigner.signTypedData(currentAddress, params);
    }

    const signature = await this.#signTypedMessage({
      from: currentAddress,
      data: params,
    });

    return signature as Hex;
  }

  /**
   * Create the wallet adapter the HyperLiquid SDK signs with, backed by the
   * selected main account.
   *
   * @returns The wallet adapter with address, signTypedData, and getChainId methods.
   */
  public createWalletAdapter(): HyperLiquidWalletParams & { address: Hex } {
    const evmAccount = getSelectedEvmAccountFromMessenger(this.#messenger);

    if (!evmAccount?.address) {
      throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
    }

    return {
      address: evmAccount.address as Hex,
      signTypedData: async (params: PerpsTypedDataPayload): Promise<Hex> =>
        await this.#signWithMainAccount(params),
      getChainId: async (): Promise<number> =>
        parseInt(getChainId(this.#isTestnet), 10),
    };
  }

  /**
   * Create a wallet adapter backed by an approved agent.
   *
   * HyperLiquid lets an agent sign only L1 actions (orders, cancels,
   * leverage, ...), which the SDK signs as primary type `Agent` over the
   * `Exchange` domain. Every other request is a user-signed action that
   * authorizes the main account (builder fee, withdraw, ...), so it goes to
   * the main account.
   *
   * @param agentSigner - The host-owned agent signer.
   * @returns The wallet adapter with the agent as its signing address.
   */
  public createAgentWalletAdapter(
    agentSigner: PerpsAgentSigner,
  ): HyperLiquidWalletParams & { address: Hex } {
    return {
      address: agentSigner.address,
      signTypedData: async (params: PerpsTypedDataPayload): Promise<Hex> => {
        if (
          params.primaryType !== 'Agent' ||
          params.domain.name !== 'Exchange'
        ) {
          return await this.#signWithMainAccount(params);
        }
        this.#deps.debugLogger.log(
          'HyperLiquidWalletService: Signing L1 action with agent',
          { agent: agentSigner.address },
        );
        return await agentSigner.signTypedData(params);
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
