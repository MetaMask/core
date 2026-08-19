/**
 * LighterWalletService
 *
 * Derives and manages the Lighter venue key seed and routes the L1
 * (EVM) signatures Lighter requires.
 *
 * Lighter's protocol needs two kinds of signatures:
 * 1. An EIP-191 `personal_sign` over the ChangePubKey plaintext produced by
 *    the WASM signer — this registers the venue key on the account. The
 *    signature is injected into the L2 transaction (`L1Sig`); the raw EVM
 *    private key is never required, so hardware wallets are supported.
 * 2. Venue-key (Schnorr/ECgFp5) signatures over L2 transactions — produced
 *    inside the WASM signer from a seed.
 *
 * The seed is derived deterministically: the user's account signs a fixed
 * domain message (also EIP-191, deterministic per RFC 6979) and the
 * signature is hashed with SHA-256. The same wallet therefore always
 * derives the same venue key — recoverable across devices with no stored
 * key material.
 *
 * Signature routing mirrors MYXWalletService: through
 * `KeyringController:signPersonalMessage` when a messenger is available,
 * or through an injected `LighterPersonalSigner` for headless use.
 */

import { bytesToHex, hexToBytes, remove0x, sha256 } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  buildLighterKeyDerivationMessage,
  getLighterChainId,
} from '../constants/lighterConfig.js';
import type { PerpsControllerMessenger } from '../PerpsController.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type { PerpsPlatformDependencies } from '../types/index.js';
import type {
  LighterNetwork,
  LighterPersonalSigner,
} from '../types/lighter-types.js';
import { getSelectedEvmAccountFromMessenger } from '../utils/accountUtils.js';

export class LighterWalletService {
  #isTestnet: boolean;

  readonly #deps: PerpsPlatformDependencies;

  readonly #messenger: PerpsControllerMessenger | undefined;

  readonly #personalSigner: LighterPersonalSigner | undefined;

  readonly #l1Address: string | undefined;

  constructor(
    deps: PerpsPlatformDependencies,
    options: {
      isTestnet?: boolean;
      messenger?: PerpsControllerMessenger;
      personalSigner?: LighterPersonalSigner;
      l1Address?: string;
    } = {},
  ) {
    this.#deps = deps;
    this.#messenger = options.messenger;
    this.#personalSigner = options.personalSigner;
    this.#l1Address = options.l1Address;
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
    if (this.#messenger) {
      const evmAccount = getSelectedEvmAccountFromMessenger(this.#messenger);
      if (!evmAccount?.address) {
        throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
      }
      return evmAccount.address;
    }
    if (this.#l1Address) {
      return this.#l1Address;
    }
    throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
  }

  /**
   * Sign an EIP-191 personal message with the user's L1 account.
   *
   * Routes through the keyring when a messenger is present, else the
   * injected headless signer.
   *
   * @param message - Plaintext message to sign.
   * @returns 65-byte signature as 0x-prefixed hex.
   */
  async signPersonalMessage(message: string): Promise<string> {
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

    if (this.#personalSigner) {
      return await this.#personalSigner(message);
    }

    throw new Error(PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED);
  }

  /**
   * Derive the deterministic venue-key seed for a key slot.
   *
   * seed = sha256(personal_sign(derivation message)) — 32 bytes, hex.
   * The WASM signer requires >= 32 bytes of hex seed.
   *
   * @param apiKeyIndex - API key slot the seed is bound to.
   * @returns Seed as 0x-prefixed 32-byte hex string.
   */
  async deriveKeySeed(apiKeyIndex: number): Promise<string> {
    const address = this.getUserAddress();
    const message = buildLighterKeyDerivationMessage({
      address,
      chainId: getLighterChainId(this.network),
      apiKeyIndex,
    });
    const signature = await this.signPersonalMessage(message);
    const seedBytes = await sha256(hexToBytes(signature));
    return bytesToHex(seedBytes);
  }

  /**
   * Derive the seed without the 0x prefix (the WASM `_createClient`
   * strips one, but plain hex keeps parity with the reference SDK usage).
   *
   * @param apiKeyIndex - API key slot the seed is bound to.
   * @returns Seed as plain hex string.
   */
  async deriveKeySeedPlain(apiKeyIndex: number): Promise<string> {
    return remove0x((await this.deriveKeySeed(apiKeyIndex)) as Hex);
  }

  public setTestnetMode(isTestnet: boolean): void {
    this.#isTestnet = isTestnet;
  }

  public isTestnetMode(): boolean {
    return this.#isTestnet;
  }
}
