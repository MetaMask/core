import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  HYPERCORE_USDC_DECIMALS,
  USDC_DECIMALS,
} from '../constants.js';
import type { QuoteRequest } from '../types.js';
import { getCaipAccountId } from './account.js';
import { extractErc20TransferRecipient } from './polymarket/calldata.js';
import { buildCaipAssetType } from './token.js';

const HYPERLIQUID_BRIDGE_ADDRESS_LOWER =
  '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';

type PerpsTransaction = Pick<
  TransactionMeta,
  'txParams' | 'nestedTransactions'
>;

/**
 * Detect whether a transaction is a Hyperliquid perps deposit by inspecting
 * the parent transaction (and any nested transactions) for a call to the
 * Hyperliquid bridge or an ERC-20 transfer to it.
 *
 * Transaction type is intentionally NOT consulted so that any caller
 * funnelling a bridge deposit through Pay is supported.
 *
 * @param transaction - Parent transaction whose calls are inspected.
 * @returns Whether the transaction deposits into the Hyperliquid bridge.
 */
export function isPerpsDepositTransaction(
  transaction: PerpsTransaction | undefined,
): boolean {
  if (!transaction) {
    return false;
  }

  const calls = [
    transaction.txParams,
    ...(transaction.nestedTransactions ?? []),
  ];

  return calls.some(
    (call) =>
      isBridgeAddress(call?.to) ||
      isBridgeAddress(getTransferRecipient(call?.data)),
  );
}

/**
 * Detect whether a quote request is a Hyperliquid perps deposit, meaning the
 * parent transaction deposits into the Hyperliquid bridge and the request
 * targets the Arbitrum USDC it requires.
 *
 * @param request - Quote request from the transaction-pay controller.
 * @param transaction - Parent transaction whose calls are inspected.
 * @returns Whether the request matches a Hyperliquid perps deposit.
 */
export function isPerpsDepositRequest(
  request: Pick<
    QuoteRequest,
    'isPostQuote' | 'targetChainId' | 'targetTokenAddress'
  >,
  transaction: PerpsTransaction | undefined,
): boolean {
  return (
    request.isPostQuote !== true &&
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      ARBITRUM_USDC_ADDRESS.toLowerCase() &&
    isPerpsDepositTransaction(transaction)
  );
}

/**
 * Rewrite a Hyperliquid perps-deposit quote request into a HyperCore direct
 * deposit.
 *
 * Transaction pay starts from the parent on-chain asset (Arbitrum USDC,
 * 6 decimals), so the target amount is shifted to the decimals the strategy's
 * quote API uses for the HyperCore token. This defaults to the 8 decimals of
 * HyperCore USDC, but providers may represent it differently (e.g. Across
 * quotes USDC-PERPS in 6 decimals).
 *
 * @param request - Quote request from the transaction-pay controller.
 * @param transaction - Parent transaction whose calls are inspected.
 * @param hypercoreUsdcAddress - Strategy-specific HyperCore USDC address to
 * set as the target token.
 * @param targetDecimals - Decimals of the HyperCore token in the strategy's
 * quote API.
 * @returns Normalized request, or the original request if not a perps deposit.
 */
export function normalizePerpsDepositRequest(
  request: QuoteRequest,
  transaction: PerpsTransaction | undefined,
  hypercoreUsdcAddress: Hex,
  targetDecimals: number = HYPERCORE_USDC_DECIMALS,
): QuoteRequest {
  if (!isPerpsDepositRequest(request, transaction)) {
    return request;
  }

  return {
    ...request,
    targetAmountMinimum: new BigNumber(request.targetAmountMinimum)
      .shiftedBy(targetDecimals - USDC_DECIMALS)
      .toFixed(0),
    targetChainId: CHAIN_ID_HYPERCORE,
    targetTokenAddress: hypercoreUsdcAddress,
  };
}

/**
 * Rewrite a Hyperliquid perps-withdraw quote request so the source is
 * HyperCore USDC rather than Arbitrum USDC.
 *
 * The source amount is provided in 6 decimals and shifted to the 8 decimals
 * HyperCore expects.
 *
 * @param request - Quote request from the transaction-pay controller.
 * @param hypercoreUsdcAddress - Strategy-specific HyperCore USDC address to
 * set as the source token.
 * @returns Normalized request, or the original request if not a perps withdraw.
 */
export function normalizePerpsWithdrawRequest(
  request: QuoteRequest,
  hypercoreUsdcAddress: Hex,
): QuoteRequest {
  if (!request.isHyperliquidSource) {
    return request;
  }

  const sourceAssetId = buildCaipAssetType(
    CHAIN_ID_HYPERCORE,
    hypercoreUsdcAddress,
  );

  return {
    ...request,
    sourceAccountId: getCaipAccountId(sourceAssetId, request.from),
    sourceAssetId,
    sourceTokenAmount: request.sourceTokenAmount
      ? toHypercoreAmount(request.sourceTokenAmount)
      : request.sourceTokenAmount,
  };
}

function getTransferRecipient(data: string | undefined): Hex | undefined {
  if (!data) {
    return undefined;
  }

  try {
    return extractErc20TransferRecipient(data as Hex);
  } catch {
    return undefined;
  }
}

function isBridgeAddress(address: string | undefined): boolean {
  return address?.toLowerCase() === HYPERLIQUID_BRIDGE_ADDRESS_LOWER;
}

function toHypercoreAmount(amount: string): string {
  return new BigNumber(amount)
    .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
    .toFixed(0);
}
