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

// The SDK signs every L1 action (orders, cancels, leverage, ...) as this
// primary type over this domain; only these may be signed by an agent.
const L1_ACTION_PRIMARY_TYPE = 'Agent';
const L1_ACTION_DOMAIN_NAME = 'Exchange';

/**
 * Whether a signing request is an L1 action.
 *
 * @param params - The typed data the SDK asked the wallet to sign.
 * @returns True for L1 actions.
 */
function isL1Action(params: PerpsTypedDataPayload): boolean {
  return (
    params.primaryType === L1_ACTION_PRIMARY_TYPE &&
    params.domain.name === L1_ACTION_DOMAIN_NAME
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
      return await accountSigner.signTypedData(mainAddress, params);
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
   * Every signature is for the currently selected main account. When
   * `resolveAgent` returns an agent for that account, L1 actions (orders,
   * cancels, leverage, ...), which the SDK signs as primary type `Agent`
   * over the `Exchange` domain, are signed by the agent. User-signed actions
   * (builder fee, withdraw, ...) authorize the main account itself, so the
   * main account always signs them.
   *
   * @param resolveAgent - Returns the agent for a main account, or null.
   * @returns The wallet adapter with address, signTypedData, and getChainId methods.
   */
  public createWalletAdapter(
    resolveAgent?: (mainAddress: Hex) => Promise<PerpsAgentSigner | null>,
  ): HyperLiquidWalletParams {
    return {
      address: this.#getSelectedMainAddress(),
      signTypedData: async (params: PerpsTypedDataPayload): Promise<Hex> => {
        const mainAddress = this.#getSelectedMainAddress();
        const agentSigner =
          resolveAgent && isL1Action(params)
            ? await resolveAgent(mainAddress)
            : null;
        if (!agentSigner) {
          return await this.#signWithMainAccount(mainAddress, params);
        }
        this.#deps.debugLogger.log(
          'HyperLiquidWalletService: Signing L1 action with agent',
          { address: mainAddress, agent: agentSigner.address },
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
