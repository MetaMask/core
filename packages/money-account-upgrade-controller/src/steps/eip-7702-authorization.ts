import type { Provider } from '@metamask/network-controller';
import { add0x, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { Step, StepContext } from './step';

const EIP_7702_DELEGATION_PREFIX = '0xef0100';
// '0x' (2) + 'ef0100' (6) + 20-byte address (40) = 48 characters.
const EIP_7702_DELEGATED_CODE_LENGTH = 48;

// 65-byte signature: 32-byte r + 32-byte s + 1-byte v.
// '0x' (2) + 32 bytes (64) + 32 bytes (64) + 1 byte (2) = 132 characters.
const SIGNATURE_HEX_LENGTH = 132;
// '0x' + 32-byte r = 66 characters.
const R_END_INDEX = 66;
// r (66 chars) + 32-byte s (64 chars) = 130 characters.
const S_END_INDEX = 130;
const V_END_INDEX = SIGNATURE_HEX_LENGTH;
// v = 27 means yParity = 0; v = 28 means yParity = 1.
const V_BASE = 27;

/**
 * Submits the EIP-7702 delegation-slot authorization to CHOMP so the Money
 * Account can be upgraded to a smart account pointed at the configured
 * delegator impl.
 *
 * The step:
 *
 * 1. Reads the account's on-chain code. If it is already delegated to the
 *    configured `delegatorImplAddress`, reports `'already-done'`. If it is
 *    delegated to a different address, throws rather than silently
 *    overwriting an existing delegation.
 * 2. Fetches the account's current on-chain transaction count — CHOMP
 *    validates the nonce matches when it applies the authorization.
 * 3. Signs the EIP-7702 authorization `{ chainId, delegatorImpl, nonce }`
 *    with the Money Account's key via the keyring.
 * 4. Splits the 65-byte signature into `r`, `s`, `v`, `yParity` and submits
 *    it to `POST /v1/account-upgrade`.
 */
export const eip7702AuthorizationStep: Step = {
  name: 'eip-7702-authorization',
  async run({ messenger, address, chainId, delegatorImplAddress }) {
    const provider = getProvider(messenger, chainId);

    const existingDelegation = await fetchDelegationAddress(provider, address);
    if (existingDelegation !== undefined) {
      if (existingDelegation === delegatorImplAddress.toLowerCase()) {
        return 'already-done';
      }
      throw new Error(
        `Account ${address} is already upgraded to another smart account: ${existingDelegation}.`,
      );
    }

    const chainIdDecimal = parseInt(chainId, 16);
    const nonce = await fetchNonce(provider, address);

    const signature = await messenger.call(
      'KeyringController:signEip7702Authorization',
      {
        chainId: chainIdDecimal,
        contractAddress: delegatorImplAddress,
        nonce,
        from: address,
      },
    );

    const { r, s, v, yParity } = splitEip7702Signature(signature);

    await messenger.call('ChompApiService:createUpgrade', {
      r,
      s,
      v,
      yParity,
      address: delegatorImplAddress,
      chainId,
      nonce: add0x(nonce.toString(16)),
    });

    return 'completed';
  },
};

/**
 * Splits a 65-byte ECDSA signature produced by
 * `KeyringController:signEip7702Authorization` into its `r`, `s`, `v`
 * components and derives `yParity` (`0` for `v = 27`, `1` for `v = 28`).
 *
 * @param signature - A 0x-prefixed 132-character hex string. Accepted in any
 * case; normalized to lowercase before validation.
 * @returns The signature components.
 */
function splitEip7702Signature(signature: unknown): {
  r: Hex;
  s: Hex;
  v: number;
  yParity: 0 | 1;
} {
  const normalized =
    typeof signature === 'string' ? signature.toLowerCase() : signature;

  if (
    !isStrictHexString(normalized) ||
    normalized.length !== SIGNATURE_HEX_LENGTH
  ) {
    throw new Error(
      `Expected a 0x-prefixed 65-byte signature from signEip7702Authorization, got ${JSON.stringify(signature)}`,
    );
  }

  // eslint-disable-next-line id-length
  const v = parseInt(normalized.slice(S_END_INDEX, V_END_INDEX), 16);
  if (v !== 27 && v !== 28) {
    throw new Error(
      `Expected v to be 27 or 28 in signEip7702Authorization signature, got ${v}`,
    );
  }

  return {
    r: normalized.slice(0, R_END_INDEX) as Hex,
    s: add0x(normalized.slice(R_END_INDEX, S_END_INDEX)),
    v,
    yParity: v === V_BASE ? 0 : 1,
  };
}

/**
 * Reads the account's on-chain code and, if the account is currently
 * delegated via EIP-7702, returns the implementation address the delegation
 * points at. Returns `undefined` if the account has no code (a plain EOA).
 * Throws if the code is present but not a valid EIP-7702 delegation, since
 * that means the address is a regular contract and is not eligible for
 * upgrade.
 *
 * @param provider - JSON-RPC provider for the target chain.
 * @param address - The Money Account address.
 * @returns The current delegation address, or `undefined` if none.
 */
async function fetchDelegationAddress(
  provider: Provider,
  address: Hex,
): Promise<Hex | undefined> {
  const code = await provider.request({
    method: 'eth_getCode',
    params: [address, 'latest'],
  });

  if (typeof code !== 'string' || !code.startsWith('0x')) {
    throw new Error(
      `Expected 0x-prefixed hex string from eth_getCode, got ${JSON.stringify(code)}`,
    );
  }

  const normalized = code.toLowerCase();

  if (normalized === '0x') {
    return undefined;
  }

  if (
    normalized.length === EIP_7702_DELEGATED_CODE_LENGTH &&
    normalized.startsWith(EIP_7702_DELEGATION_PREFIX)
  ) {
    return add0x(normalized.slice(EIP_7702_DELEGATION_PREFIX.length));
  }

  throw new Error(
    `Account ${address} has unexpected on-chain code; expected either no code or an EIP-7702 delegation.`,
  );
}

/**
 * Fetches the current on-chain transaction count for the given address by
 * issuing an `eth_getTransactionCount` RPC request.
 *
 * @param provider - JSON-RPC provider for the target chain.
 * @param address - The Money Account address.
 * @returns The current nonce as a decimal number.
 */
async function fetchNonce(provider: Provider, address: Hex): Promise<number> {
  const nonceHex = await provider.request({
    method: 'eth_getTransactionCount',
    params: [address, 'latest'],
  });

  if (!isStrictHexString(nonceHex)) {
    throw new Error(
      `Expected hex string from eth_getTransactionCount, got ${JSON.stringify(nonceHex)}`,
    );
  }

  return parseInt(nonceHex, 16);
}

/**
 * Resolves the JSON-RPC provider for the given chain via NetworkController.
 *
 * @param messenger - The upgrade controller messenger.
 * @param chainId - The chain to query.
 * @returns The provider for that chain.
 */
function getProvider(
  messenger: StepContext['messenger'],
  chainId: Hex,
): Provider {
  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );
  return messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  ).provider;
}
