import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import {
  doesChainSupportEIP7702,
  generateEIP7702BatchTransaction,
  isAccountUpgradedToEIP7702,
} from './eip7702';
import {
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
} from './feature-flags';
import type { TransactionController, TransactionControllerMessenger } from '..';
import { projectLogger } from '../logger';
import {
  TransactionEnvelopeType,
  type TransactionBatchRequest,
  type TransactionBatchResult,
  type TransactionParams,
} from '../types';

type AddTransactionBatchRequest = {
  addTransaction: TransactionController['addTransaction'];
  getChainId: (networkClientId: string) => Hex;
  getEthQuery: (networkClientId: string) => EthQuery;
  messenger: TransactionControllerMessenger;
  request: TransactionBatchRequest;
};

type IsAtomicBatchSupportedRequest = {
  address: Hex;
  getEthQuery: (chainId: Hex) => EthQuery;
  messenger: TransactionControllerMessenger;
};

const log = createModuleLogger(projectLogger, 'batch');

/**
 * Add a batch transaction.
 *
 * @param request - The request object including the user request and necessary callbacks.
 * @returns The batch result object including the batch ID.
 */
export async function addTransactionBatch(
  request: AddTransactionBatchRequest,
): Promise<TransactionBatchResult> {
  const {
    addTransaction,
    getChainId,
    messenger,
    request: userRequest,
  } = request;

  const { from, networkClientId, requireApproval, transactions } = userRequest;

  log('Adding', userRequest);

  const chainId = getChainId(networkClientId);
  const ethQuery = request.getEthQuery(networkClientId);
  const isChainSupported = doesChainSupportEIP7702(chainId, messenger);

  if (!isChainSupported) {
    log('Chain does not support EIP-7702', chainId);
    throw rpcErrors.internal('Chain does not support EIP-7702');
  }

  const { delegationAddress, isSupported } = await isAccountUpgradedToEIP7702(
    from,
    chainId,
    messenger,
    ethQuery,
  );

  log('Account', { delegationAddress, isSupported });

  if (!isSupported && delegationAddress) {
    log('Account upgraded to unsupported contract', from, delegationAddress);
    throw rpcErrors.internal('Account upgraded to unsupported contract');
  }

  const nestedTransactions = transactions.map((tx) => tx.params);
  const batchParams = generateEIP7702BatchTransaction(from, nestedTransactions);

  const txParams: TransactionParams = {
    from,
    ...batchParams,
  };

  if (!isSupported) {
    const upgradeContractAddress = getEIP7702UpgradeContractAddress(
      chainId,
      messenger,
    );

    if (!upgradeContractAddress) {
      throw rpcErrors.internal('Upgrade contract address not found');
    }

    txParams.type = TransactionEnvelopeType.setCode;
    txParams.authorizationList = [{ address: upgradeContractAddress }];
  }

  log('Adding batch transaction', txParams, networkClientId);

  const { transactionMeta, result } = await addTransaction(txParams, {
    nestedTransactions,
    networkClientId,
    requireApproval,
  });

  const batchId = transactionMeta.id;

  // Wait for the transaction to be published.
  await result;

  return {
    batchId,
  };
}

/**
 * Determine which chains support atomic batch transactions for the given account.
 *
 * @param request - The request object including the account address and necessary callbacks.
 * @returns The chain IDs that support atomic batch transactions.
 */
export async function isAtomicBatchSupported(
  request: IsAtomicBatchSupportedRequest,
): Promise<Hex[]> {
  const { address, getEthQuery, messenger } = request;

  const chainIds7702 = getEIP7702SupportedChains(messenger);
  const chainIds: Hex[] = [];

  for (const chainId of chainIds7702) {
    const ethQuery = getEthQuery(chainId);

    const { isSupported, delegationAddress } = await isAccountUpgradedToEIP7702(
      address,
      chainId,
      messenger,
      ethQuery,
    );

    if (!delegationAddress || isSupported) {
      chainIds.push(chainId);
    }
  }

  log('Atomic batch supported chains', chainIds);

  return chainIds;
}
