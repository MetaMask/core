import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type {
  Authorization,
  AuthorizationList,
  TransactionMeta,
} from '../types';
import { toHex } from '../../../controller-utils/src';

export type KeyringControllerAuthorization = [
  chainId: number,
  contractAddress: string,
  nonce: number,
];

export type KeyringControllerSignAuthorization = {
  type: 'KeyringController:signAuthorization';
  handler: (authorization: KeyringControllerAuthorization) => Promise<string>;
};

const log = createModuleLogger(projectLogger, 'eip-7702');

/**
 * Sign an authorization list.
 *
 * @param options - Options bag.
 * @param options.authorizationList - The authorization list to sign.
 * @param options.messenger - The controller messenger.
 * @param options.transactionMeta - The transaction metadata.
 * @returns The signed authorization list.
 */
export async function signAuthorizationList({
  authorizationList,
  messenger,
  transactionMeta,
}: {
  authorizationList?: AuthorizationList;
  messenger: TransactionControllerMessenger;
  transactionMeta: TransactionMeta;
}): Promise<Required<AuthorizationList | undefined>> {
  if (!authorizationList) {
    return undefined;
  }

  const signedAuthorizationList: Required<AuthorizationList> = [];

  for (const authorization of authorizationList) {
    signedAuthorizationList.push(
      await signAuthorization(authorization, transactionMeta, messenger),
    );
  }

  return signedAuthorizationList;
}

/**
 * Signs an authorization.
 *
 * @param authorization - The authorization to sign.
 * @param transactionMeta - The associated transaction metadata.
 * @param messenger - The messenger to use for signing.
 * @returns The signed authorization.
 */
async function signAuthorization(
  authorization: Authorization,
  transactionMeta: TransactionMeta,
  messenger: TransactionControllerMessenger,
): Promise<Required<Authorization>> {
  const finalAuthorization = prepareAuthorization(
    authorization,
    transactionMeta,
  );

  const { address, chainId, nonce } = finalAuthorization;
  const chainIdDecimal = parseInt(chainId, 16);
  const nonceDecimal = parseInt(nonce, 16);

  const signature = await messenger.call(
    'KeyringController:signAuthorization',
    [chainIdDecimal, address, nonceDecimal],
  );

  const r = signature.slice(0, 66) as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);
  const yParity = v - 27 === 0 ? '0x' : '0x1';
  const finalNonce = nonceDecimal === 0 ? '0x' : nonce;

  const result: Required<Authorization> = {
    address,
    chainId,
    nonce: finalNonce,
    r,
    s,
    yParity,
  };

  log('Signed authorization', result);

  return result;
}

/**
 * Prepares an authorization for signing by populating the chainId and nonce.
 *
 * @param authorization - The authorization to prepare.
 * @param transactionMeta - The associated transaction metadata.
 * @returns The prepared authorization.
 */
function prepareAuthorization(
  authorization: Authorization,
  transactionMeta: TransactionMeta,
): Authorization & { chainId: Hex; nonce: Hex } {
  const { chainId: existingChainId, nonce: existingNonce } = authorization;
  const { txParams, chainId: transactionChainId } = transactionMeta;
  const { nonce: transactionNonce } = txParams;

  const chainId = existingChainId ?? transactionChainId;
  let nonce = existingNonce;

  if (nonce === undefined) {
    nonce = toHex(parseInt(transactionNonce as string, 16) + 1);
  }

  const result = {
    ...authorization,
    chainId,
    nonce,
  };

  log('Prepared authorization', result);

  return result;
}
