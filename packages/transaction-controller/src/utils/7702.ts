/* eslint-disable jsdoc/require-jsdoc */
import { Contract } from '@ethersproject/contracts';
import { query, toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { signEIP7702Authorization } from '@metamask/eth-sig-util';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { SimpleDelgateContractAbi } from '../contracts/SimpleDelegateContract';
import { projectLogger } from '../logger';
import type {
  Authorization,
  AuthorizationList,
  TransactionBatchRequest,
  TransactionParams,
} from '../types';

export const CONTRACT_ADDRESS_7702 =
  '0x663F3ad617193148711d28f5334eE4Ed07016602';

const FUNCTION_NAME = 'execute';
const DELEGATION_CODE = '0xef0100663f3ad617193148711d28f5334ee4ed07016602';
const SUPPORTED_CHAIN_IDS = ['0x7a69'];

const log = createModuleLogger(projectLogger, 'eip-7702');

export async function supports7702(chainId: Hex): Promise<boolean> {
  return SUPPORTED_CHAIN_IDS.includes(chainId.toLowerCase());
}

export async function has7702Delegation(
  address: string,
  ethQuery: EthQuery,
): Promise<boolean> {
  const code = await query(ethQuery, 'eth_getCode', [address, 'latest']);
  return code === DELEGATION_CODE;
}

export function get7702Transaction(
  batchRequest: TransactionBatchRequest,
): TransactionParams {
  const simpleDelegateContract = Contract.getInterface(
    SimpleDelgateContractAbi,
  );

  const { from } = batchRequest.requests[0].params;

  const args = batchRequest.requests.map((entry) => {
    const { params } = entry;
    const { data, to, value } = params;

    return [data ?? '0x', to, value ?? '0x0'];
  });

  log('Args', args);

  const data = simpleDelegateContract.encodeFunctionData(FUNCTION_NAME, [args]);

  log('Transaction data', data);

  return {
    data,
    from,
    to: from,
  };
}

export function normalizeAuthorizationList({
  authorizationList,
  nextNonce,
  transactionChainId,
}: {
  authorizationList: AuthorizationList;
  nextNonce: Hex;
  transactionChainId: Hex;
}): Required<AuthorizationList> {
  return authorizationList.map((authorization, index) =>
    normalizeAuthorization({
      authorization,
      nextNonce: toHex(parseInt(nextNonce, 16) + 1 + index),
      transactionChainId,
    }),
  );
}

function normalizeAuthorization({
  authorization,
  nextNonce,
  transactionChainId,
}: {
  authorization: Authorization;
  nextNonce: Hex;
  transactionChainId: Hex;
}): Required<Authorization> {
  const {
    address,
    chainId: existingChainId,
    nonce: existingNonce,
    r,
  } = authorization;

  if (r) {
    return authorization as Required<Authorization>;
  }

  const chainId = existingChainId ?? transactionChainId;
  const nonce = existingNonce ?? nextNonce;

  return sign7702Authorization(address, chainId, nonce);
}

function sign7702Authorization(
  address: Hex,
  chainId: Hex,
  nonce: Hex,
): Required<Authorization> {
  const privateKey = process.env.PRIVATE_KEY as unknown as Buffer;
  const chainIdDecimnal = parseInt(chainId, 16);
  const nonceDecimal = parseInt(nonce, 16);

  // Temporary, in production this would be retrieved via a KeyringController messenger action.
  const rawSignature = signEIP7702Authorization({
    privateKey,
    authorization: [chainIdDecimnal, address, nonceDecimal],
  });

  const r = rawSignature.slice(0, 66) as Hex;
  const s = `0x${rawSignature.slice(66, 130)}` as Hex;
  const v = parseInt(rawSignature.slice(130, 132), 16);
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
