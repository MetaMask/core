/**
 * LighterWalletService
 *
 * Routes the L1 signatures Lighter requires. The client-owned signer bridge
 * creates and stores the venue key; Core never receives its seed or private
 * key.
 *
 * Lighter's protocol needs two kinds of signatures:
 * 1. An EIP-191 `personal_sign` over the ChangePubKey plaintext produced by
 *    the WASM signer — this registers the venue key on the account. The
 *    signature is injected into the L2 transaction (`L1Sig`); the raw EVM
 *    private key is never required, so hardware wallets are supported.
 * 2. Venue-key (Schnorr/ECgFp5) signatures over L2 transactions, produced
 *    inside the injected signer bridge from client-managed key material.
 *
 * Signature routing goes through the injected `accountSigner` when one is
 * set, else `KeyringController:signPersonalMessage`. The L1 address always
 * comes from the messenger's selected account.
 */

import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { PerpsControllerMessenger } from '../PerpsController.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type { PerpsPlatformDependencies } from '../types/index.js';
import type { LighterNetwork } from '../types/lighter-types.js';
import { getSelectedEvmAccountFromMessenger } from '../utils/accountUtils.js';
import { isAccountSignerReady } from './accountSigner.js';

export class LighterWalletService {
  #isTestnet: boolean;

  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessenger | undefined;

  constructor(
    deps: PerpsPlatformDependencies,
    options: {
      isTestnet?: boolean;
      messenger?: PerpsControllerMessenger;
    } = {},
  ) {
    this.#deps = deps;
    this.#messenger = options.messenger;
    this.#isTestnet = options.isTestnet ?? true;
  }

  get network(): LighterNetwork {
    return this.#isTestnet ? 'testnet' : 'mainnet';
  }

  /**
   * Resolve the L1 address whose account owns the Lighter account.
   *
   * @returns The EVM address.
   */
  getUserAddress(): string {
    const evmAccount = this.#messenger
      ? getSelectedEvmAccountFromMessenger(this.#messenger)
      : undefined;
    if (!evmAccount?.address) {
      throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
    }
    return evmAccount.address;
  }

  /**
   * Sign an EIP-191 personal message with the user's L1 account.
   *
   * Routes through the injected account signer when one is set, else the
   * keyring.
   *
   * @param message - Plaintext message to sign.
   * @returns 65-byte signature as 0x-prefixed hex.
   */
  async signPersonalMessage(message: string): Promise<string> {
    const { accountSigner } = this.#deps;
    if (accountSigner) {
      if (!isAccountSignerReady(accountSigner)) {
        throw new Error(PERPS_ERROR_CODES.KEYRING_LOCKED);
      }
      const address = this.getUserAddress() as Hex;
      this.#deps.debugLogger.log('LighterWalletService: personal_sign', {
        address,
      });
      return await accountSigner.signPersonalMessage(address, message);
    }

    if (this.#messenger) {
      const { isUnlocked } = this.#messenger.call('KeyringController:getState');
      if (!isUnlocked) {
        throw new Error(PERPS_ERROR_CODES.KEYRING_LOCKED);
      }
      const address = this.getUserAddress() as Hex;
      this.#deps.debugLogger.log('LighterWalletService: personal_sign', {
        address,
      });
      // KeyringController:signPersonalMessage expects hex-encoded data.
      const data = bytesToHex(new TextEncoder().encode(message));
      return await this.#messenger.call(
        'KeyringController:signPersonalMessage',
        { from: address, data },
      );
    }

    throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
  }

  public setTestnetMode(isTestnet: boolean): void {
    this.#isTestnet = isTestnet;
  }

  public isTestnetMode(): boolean {
    return this.#isTestnet;
  }
}
