import type {
  V1TransactionByHashResponse,
  V5TransactionFee,
  V5TransactionRecord,
  V5TransactionValueTransfer,
} from '@metamask/core-backend';
import type { CaipChainId } from '@metamask/utils';
import {
  KnownCaipNamespace,
  parseCaipAccountId,
  parseCaipAssetType,
  parseCaipChainId,
  toCaipChainId,
} from '@metamask/utils';

import type { Fee, Status } from '../../types.js';
import { getFees } from './transactions.js';

/**
 * Value transfer in the shape the API mapper classifies, independent of the
 * Accounts API version it came from.
 *
 * `transferType` uses the V1 vocabulary (`normal`, `internal`, `erc20`,
 * `erc721`, `erc1155`). `assetId` is only set when it can't be derived from
 * `contractAddress` (non-EVM assets).
 */
export type IndexedValueTransfer = {
  from: string;
  to: string;
  transferType: string;
  amount?: string | number;
  decimal?: number;
  contractAddress?: string;
  symbol?: string;
  name?: string;
  assetId?: string;
};

export type IndexedTransaction = {
  hash: string;
  chainId: CaipChainId;
  status: Status;
  timestamp: number;
  from: string;
  to: string;
  value?: string;
  methodId?: string;
  transactionCategory?: string;
  transactionProtocol?: string;
  valueTransfers?: IndexedValueTransfer[];
  fees?: Fee[];
};

export function fromV1Transaction(
  transaction: V1TransactionByHashResponse,
): IndexedTransaction {
  return {
    hash: transaction.hash,
    chainId: toCaipChainId(
      KnownCaipNamespace.Eip155,
      transaction.chainId.toString(),
    ),
    status: transaction.isError ? 'failed' : 'success',
    timestamp: new Date(transaction.timestamp).getTime(),
    from: transaction.from,
    to: transaction.to,
    value: transaction.value,
    methodId: transaction.methodId,
    transactionCategory: transaction.transactionCategory,
    transactionProtocol: transaction.transactionProtocol,
    valueTransfers: transaction.valueTransfers,
    fees: getFees(transaction),
  };
}

const evmContractTokenNamespaces = new Set(['erc20', 'erc721', 'erc1155']);

function getTransferType(assetClass: string, assetNamespace: string): string {
  if (assetClass === 'eip155Internal') {
    return 'internal';
  }

  if (assetNamespace === 'slip44') {
    return 'normal';
  }

  return assetNamespace;
}

function fromV5ValueTransfer({
  assetClass,
  assetId,
  from,
  to,
  amount,
  decimal,
  symbol,
  name,
}: V5TransactionValueTransfer): IndexedValueTransfer {
  const { chain, assetNamespace, assetReference } = parseCaipAssetType(assetId);
  const isEvm = chain.namespace === KnownCaipNamespace.Eip155;
  const isContractToken =
    isEvm && evmContractTokenNamespaces.has(assetNamespace);

  return {
    from,
    to,
    transferType: getTransferType(assetClass, assetNamespace),
    amount,
    decimal,
    symbol,
    name,
    ...(isContractToken ? { contractAddress: assetReference } : {}),
    ...(isEvm ? {} : { assetId }),
  };
}

function fromV5Status(status: string): Status {
  if (status === 'confirmed') {
    return 'success';
  }

  if (status === 'failed') {
    return 'failed';
  }

  return 'pending';
}

function fromV5Fee(fee: V5TransactionFee | null): Fee[] | undefined {
  if (!fee) {
    return undefined;
  }

  const { assetId, amount, decimals, symbol } = fee.asset;

  return [
    {
      type: 'base',
      amount,
      decimals,
      assetType: 'native',
      assetId,
      ...(symbol ? { symbol } : {}),
    },
  ];
}

export function fromV5TransactionRecord(record: V5TransactionRecord): {
  transaction: IndexedTransaction;
  subjectAddress: string;
} {
  const { tx, valueTransfers, fee } = record;

  return {
    subjectAddress: parseCaipAccountId(record.accountId).address,
    transaction: {
      hash: tx.id,
      chainId: tx.chainId,
      status: fromV5Status(tx.status),
      timestamp: tx.timestamp,
      from: tx.from,
      to: tx.to ?? '',
      value: tx.value,
      methodId: tx.methodId ?? undefined,
      transactionCategory: tx.transactionCategory,
      transactionProtocol: tx.transactionProtocol,
      valueTransfers: valueTransfers.map(fromV5ValueTransfer),
      fees: fromV5Fee(fee),
    },
  };
}

export function toHexChainId(chainId: CaipChainId): string | undefined {
  const { namespace, reference } = parseCaipChainId(chainId);

  return namespace === KnownCaipNamespace.Eip155
    ? `0x${Number(reference).toString(16)}`
    : undefined;
}
