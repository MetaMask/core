import { add0x, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { Step, StepContext } from './step';

/**
 * Submits the EIP-7702 delegation-slot authorization to CHOMP so the Money
 * Account can be upgraded to a smart account pointed at
 * `EIP7702StatelessDeleGatorImpl`.
 *
 * The step:
 *
 * 1. Asks CHOMP whether an upgrade record already exists for the address —
 *    any record (including `status: 'pending'`) means the authorization is
 *    already submitted and CHOMP will apply it before running any intent, so
 *    the step reports `'already-done'`.
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
    const existing = await messenger.call(
      'ChompApiService:getUpgrade',
      address,
    );
    if (existing !== null) {
      return 'already-done';
    }

    const chainIdDecimal = parseInt(chainId, 16);
    const nonce = await fetchNonce(messenger, chainId, address);

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
      address,
      chainId: chainIdDecimal.toString(),
      nonce: nonce.toString(),
    });

    return 'completed';
  },
};

/**
 * Splits a 65-byte ECDSA signature produced by
 * `KeyringController:signEip7702Authorization` into its `r`, `s`, `v`
 * components and derives `yParity` (`0` for `v = 27`, `1` for `v = 28`).
 *
 * @param signature - A 0x-prefixed 132-character hex string.
 * @returns The signature components.
 */
function splitEip7702Signature(signature: string): {
  r: Hex;
  s: Hex;
  v: number;
  yParity: 0 | 1;
} {
  if (!isStrictHexString(signature) || signature.length !== 132) {
    throw new Error(
      `Expected a 0x-prefixed 65-byte signature from signEip7702Authorization, got ${JSON.stringify(signature)}`,
    );
  }

  // eslint-disable-next-line id-length
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    r: signature.slice(0, 66) as Hex,
    s: add0x(signature.slice(66, 130)),
    v,
    yParity: v - 27 === 0 ? 0 : 1,
  };
}

/**
 * Fetches the current on-chain transaction count for the given address on the
 * given chain by resolving the chain's network client and issuing an
 * `eth_getTransactionCount` RPC request.
 *
 * @param messenger - The upgrade controller messenger.
 * @param chainId - The chain to query.
 * @param address - The Money Account address.
 * @returns The current nonce as a decimal number.
 */
async function fetchNonce(
  messenger: StepContext['messenger'],
  chainId: Hex,
  address: Hex,
): Promise<number> {
  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );
  const networkClient = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );

  const nonceHex = await networkClient.provider.request({
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
