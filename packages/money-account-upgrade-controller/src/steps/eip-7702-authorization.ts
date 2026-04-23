import { add0x, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { Step } from './step';

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

    const signature = (await messenger.call(
      'KeyringController:signEip7702Authorization',
      {
        chainId: chainIdDecimal,
        contractAddress: delegatorImplAddress,
        nonce,
        from: address,
      },
    )) as Hex;

    // eslint-disable-next-line id-length
    const r = signature.slice(0, 66) as Hex;
    // eslint-disable-next-line id-length
    const s = add0x(signature.slice(66, 130));
    // eslint-disable-next-line id-length
    const v = parseInt(signature.slice(130, 132), 16);
    const yParity = v - 27;

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
  messenger: Parameters<Step['run']>[0]['messenger'],
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
