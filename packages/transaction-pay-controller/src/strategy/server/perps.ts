import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  HYPERCORE_USDC_DECIMALS,
  USDC_DECIMALS,
} from '../../constants';
import type { QuoteRequest } from '../../types';

export const SERVER_HYPERCORE_USDC_PERPS_ADDRESS =
  '0x2100000000000000000000000000000000000000' as Hex;

const HYPERLIQUID_BRIDGE_ADDRESS_LOWER =
  '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';

const HYPERLIQUID_BRIDGE_CALLDATA_FRAGMENT =
  HYPERLIQUID_BRIDGE_ADDRESS_LOWER.slice(2);

export function isServerPerpsDepositRequest(
  request: Pick<
    QuoteRequest,
    'isPostQuote' | 'targetChainId' | 'targetTokenAddress'
  >,
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): boolean {
  if (
    request.isPostQuote === true ||
    request.targetChainId !== CHAIN_ID_ARBITRUM ||
    request.targetTokenAddress.toLowerCase() !==
      ARBITRUM_USDC_ADDRESS.toLowerCase()
  ) {
    return false;
  }

  return transactionDataReferencesBridge(transaction);
}

export function normalizeServerPerpsRequest(
  request: QuoteRequest,
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): QuoteRequest {
  if (request.isHyperliquidSource) {
    return normalizePerpsWithdrawRequest(request);
  }

  if (!isServerPerpsDepositRequest(request, transaction)) {
    return request;
  }

  return {
    ...request,
    targetAmountMinimum: new BigNumber(request.targetAmountMinimum)
      .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
      .toFixed(0),
    targetChainId: CHAIN_ID_HYPERCORE,
    targetTokenAddress: SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
  };
}

function normalizePerpsWithdrawRequest(request: QuoteRequest): QuoteRequest {
  return {
    ...request,
    sourceChainId: CHAIN_ID_HYPERCORE,
    sourceTokenAddress: SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
    sourceTokenAmount: new BigNumber(request.sourceTokenAmount)
      .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
      .toFixed(0),
  };
}

function transactionDataReferencesBridge(
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): boolean {
  const fragments: (string | undefined)[] = [
    transaction.txParams?.to,
    ...(transaction.nestedTransactions ?? []).map((tx) => tx.to),
  ];

  return fragments.some(
    (value) =>
      typeof value === 'string' &&
      value.toLowerCase().includes(HYPERLIQUID_BRIDGE_CALLDATA_FRAGMENT),
  );
}
