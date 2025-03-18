import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { bytesToHex, createModuleLogger } from '@metamask/utils';
import { parse, v4 } from 'uuid';

import {
  doesChainSupportEIP7702,
  generateEIP7702BatchTransaction,
  isAccountUpgradedToEIP7702,
} from './eip7702';
import {
  getBatchSizeLimit,
  getEIP7702SupportedChains,
  getEIP7702UpgradeContractAddress,
} from './feature-flags';
import { validateBatchRequest } from './validation';
import {
  determineTransactionType,
  type TransactionBatchRequest,
  type TransactionController,
  type TransactionControllerMessenger,
} from '..';
import { projectLogger } from '../logger';
import type {
  NestedTransactionMetadata,
  TransactionBatchSingleRequest,
} from '../types';
import {
  TransactionEnvelopeType,
  type TransactionBatchResult,
  type TransactionParams,
  TransactionType,
} from '../types';

type AddTransactionBatchRequest = {
  addTransaction: TransactionController['addTransaction'];
  getChainId: (networkClientId: string) => Hex;
  getEthQuery: (networkClientId: string) => EthQuery;
  getInternalAccounts: () => Hex[];
  messenger: TransactionControllerMessenger;
  publicKeyEIP7702?: Hex;
  request: TransactionBatchRequest;
};

type IsAtomicBatchSupportedRequest = {
  address: Hex;
  getEthQuery: (chainId: Hex) => EthQuery;
  messenger: TransactionControllerMessenger;
  publicKeyEIP7702?: Hex;
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
    getInternalAccounts,
    messenger,
    publicKeyEIP7702,
    request: userRequest,
  } = request;

  const sizeLimit = getBatchSizeLimit(messenger);

  validateBatchRequest({
    internalAccounts: getInternalAccounts(),
    request: userRequest,
    sizeLimit,
  });

  const {
    batchId: batchIdOverride,
    from,
    networkClientId,
    requireApproval,
    transactions,
  } = userRequest;

  log('Adding', userRequest);

  const chainId = getChainId(networkClientId);
  const ethQuery = request.getEthQuery(networkClientId);
  const isChainSupported = doesChainSupportEIP7702(chainId, messenger);

  if (!isChainSupported) {
    log('Chain does not support EIP-7702', chainId);
    throw rpcErrors.internal('Chain does not support EIP-7702');
  }

  if (!publicKeyEIP7702) {
    throw rpcErrors.internal('EIP-7702 public key not specified');
  }

  const { delegationAddress, isSupported } = await isAccountUpgradedToEIP7702(
    from,
    chainId,
    publicKeyEIP7702,
    messenger,
    ethQuery,
  );

  log('Account', { delegationAddress, isSupported });

  if (!isSupported && delegationAddress) {
    log('Account upgraded to unsupported contract', from, delegationAddress);
    throw rpcErrors.internal('Account upgraded to unsupported contract');
  }

  const nestedTransactions = await Promise.all(
    transactions.map((tx) =>
      getNestedTransactionMeta(userRequest, tx, ethQuery),
    ),
  );

  const batchParams = generateEIP7702BatchTransaction(from, nestedTransactions);

  const txParams: TransactionParams = {
    from,
    ...batchParams,
  };

  if (!isSupported) {
    const upgradeContractAddress = getEIP7702UpgradeContractAddress(
      chainId,
      messenger,
      publicKeyEIP7702,
    );

    if (!upgradeContractAddress) {
      throw rpcErrors.internal('Upgrade contract address not found');
    }

    txParams.type = TransactionEnvelopeType.setCode;
    txParams.authorizationList = [{ address: upgradeContractAddress }];
  }

  log('Adding batch transaction', txParams, networkClientId);

  const batchId = batchIdOverride ?? generateBatchId();

  const { result } = await addTransaction(txParams, {
    batchId,
    nestedTransactions,
    networkClientId,
    requireApproval,
    type: TransactionType.batch,
  });

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
  const {
    address,
    getEthQuery,
    messenger,
    publicKeyEIP7702: publicKey,
  } = request;

  if (!publicKey) {
    throw rpcErrors.internal('EIP-7702 public key not specified');
  }

  const chainIds7702 = getEIP7702SupportedChains(messenger);
  const chainIds: Hex[] = [];

  for (const chainId of chainIds7702) {
    const ethQuery = getEthQuery(chainId);

    const { isSupported, delegationAddress } = await isAccountUpgradedToEIP7702(
      address,
      chainId,
      publicKey,
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

/**
 * Generate a tranasction batch ID.
 *
 * @returns  A unique batch ID as a hexadecimal string.
 */
function generateBatchId(): Hex {
  const idString = v4();
  const idBytes = new Uint8Array(parse(idString));
  return bytesToHex(idBytes);
}

/**
 * Generate the metadata for a nested transaction.
 *
 * @param request - The batch request.
 * @param singleRequest - The request for a single transaction.
 * @param ethQuery - The EthQuery instance used to interact with the Ethereum blockchain.
 * @returns The metadata for the nested transaction.
 */
async function getNestedTransactionMeta(
  request: TransactionBatchRequest,
  singleRequest: TransactionBatchSingleRequest,
  ethQuery: EthQuery,
): Promise<NestedTransactionMetadata> {
  const { from } = request;
  const { params } = singleRequest;

  const { type } = await determineTransactionType(
    { from, ...params },
    ethQuery,
  );

  return {
    ...params,
    type,
  };
}
