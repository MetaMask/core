import { Contract } from '@ethersproject/contracts';
import { query, toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { createModuleLogger, type Hex, add0x } from '@metamask/utils';

import {
  getEIP7702ContractAddresses,
  getEIP7702SupportedChains,
} from './feature-flags';
import { ABI_SIMPLE_DELEGATE_CONTRACT } from '../abi/SimpleDelegateContract';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type {
  BatchTransactionParams,
  Authorization,
  AuthorizationList,
  TransactionMeta,
} from '../types';

export type KeyringControllerAuthorization = [
  chainId: number,
  contractAddress: string,
  nonce: number,
];

export type KeyringControllerSignAuthorization = {
  type: 'KeyringController:signAuthorization';
  handler: (authorization: KeyringControllerAuthorization) => Promise<string>;
};

export const DELEGATION_PREFIX = '0xef0100';
export const BATCH_FUNCTION_NAME = 'execute';

export type FeatureFlagsEIP7702 = {
  contractAddresses?: Record<Hex, Hex[]>;
  supportedChains?: Hex[];
};

const log = createModuleLogger(projectLogger, 'eip-7702');

/**
 * Determine if a chain supports EIP-7702 using LaunchDarkly feature flag.
 *
 * @param chainId - Hexadecimal ID of the chain.
 * @param messenger - Messenger instance.
 * @returns True if the chain supports EIP-7702.
 */
export function doesChainSupportEIP7702(
  chainId: Hex,
  messenger: TransactionControllerMessenger,
) {
  const supportedChains = getEIP7702SupportedChains(messenger);

  return supportedChains.some(
    (supportedChainId) =>
      supportedChainId.toLowerCase() === chainId.toLowerCase(),
  );
}

/**
 * Determine if an account has been upgraded to a supported EIP-7702 contract.
 *
 * @param address - The EOA address to check.
 * @param chainId - The chain ID.
 * @param messenger - The messenger instance.
 * @param ethQuery - The EthQuery instance to communicate with the blockchain.
 * @returns An object with the results of the check.
 */
export async function isAccountUpgradedToEIP7702(
  address: Hex,
  chainId: Hex,
  messenger: TransactionControllerMessenger,
  ethQuery: EthQuery,
) {
  const contractAddresses = getEIP7702ContractAddresses(chainId, messenger);
  const code = await query(ethQuery, 'eth_getCode', [address]);
  const normalizedCode = add0x(code?.toLowerCase?.() ?? '');

  const hasDelegation =
    code.length === 48 && normalizedCode.startsWith(DELEGATION_PREFIX);

  const delegationAddress = hasDelegation
    ? add0x(normalizedCode.slice(DELEGATION_PREFIX.length))
    : undefined;

  const isSupported = Boolean(
    delegationAddress &&
      contractAddresses.some(
        (contract) =>
          contract.toLowerCase() === delegationAddress.toLowerCase(),
      ),
  );

  return {
    delegationAddress,
    isSupported,
  };
}

/**
 * Generate an EIP-7702 batch transaction.
 *
 * @param from - The sender address.
 * @param transactions - The transactions to batch.
 * @returns The batch transaction.
 */
export function generateEIP7702BatchTransaction(
  from: Hex,
  transactions: BatchTransactionParams[],
): BatchTransactionParams {
  const delegationContract = Contract.getInterface(
    ABI_SIMPLE_DELEGATE_CONTRACT,
  );

  const args = transactions.map((transaction) => {
    const { data, to, value } = transaction;

    return [
      data ?? '0x',
      to ?? '0x0000000000000000000000000000000000000000',
      value ?? '0x0',
    ];
  });

  log('Args', args);

  const data = delegationContract.encodeFunctionData(BATCH_FUNCTION_NAME, [
    args,
  ]) as Hex;

  log('Transaction data', data);

  return {
    data,
    to: from,
  };
}

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
  let index = 0;

  for (const authorization of authorizationList) {
    const signedAuthorization = await signAuthorization(
      authorization,
      transactionMeta,
      messenger,
      index,
    );

    signedAuthorizationList.push(signedAuthorization);
    index += 1;
  }

  return signedAuthorizationList;
}

/**
 * Signs an authorization.
 *
 * @param authorization - The authorization to sign.
 * @param transactionMeta - The associated transaction metadata.
 * @param messenger - The messenger to use for signing.
 * @param index - The index of the authorization in the list.
 * @returns The signed authorization.
 */
async function signAuthorization(
  authorization: Authorization,
  transactionMeta: TransactionMeta,
  messenger: TransactionControllerMessenger,
  index: number,
): Promise<Required<Authorization>> {
  const finalAuthorization = prepareAuthorization(
    authorization,
    transactionMeta,
    index,
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
 * @param index - The index of the authorization in the list.
 * @returns The prepared authorization.
 */
function prepareAuthorization(
  authorization: Authorization,
  transactionMeta: TransactionMeta,
  index: number,
): Authorization & { chainId: Hex; nonce: Hex } {
  const { chainId: existingChainId, nonce: existingNonce } = authorization;
  const { txParams, chainId: transactionChainId } = transactionMeta;
  const { nonce: transactionNonce } = txParams;

  const chainId = existingChainId ?? transactionChainId;
  let nonce = existingNonce;

  if (nonce === undefined) {
    nonce = toHex(parseInt(transactionNonce as string, 16) + 1 + index);
  }

  const result = {
    ...authorization,
    chainId,
    nonce,
  };

  log('Prepared authorization', result);

  return result;
}
