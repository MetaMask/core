import { TransactionType } from '@metamask/transaction-controller';
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
import { isPerpsWithdrawTransaction } from '../../utils/transaction';

export const ACROSS_HYPERCORE_USDC_PERPS_ADDRESS =
  '0x2100000000000000000000000000000000000000' as Hex;

/**
 * Detect the quote-time parent transaction shape that Across can map to the
 * new HyperCore USDC-PERPS direct-deposit route.
 *
 * The parent transaction remains `perpsDeposit` while quotes are being
 * selected. `perpsAcrossDeposit` is only assigned later to the generated
 * Across submission transaction(s).
 *
 * @param request - Transaction pay quote request.
 * @param parentTransactionType - Parent transaction type before Across
 * execution.
 * @returns Whether the request matches the supported direct-deposit path.
 */
export function isSupportedAcrossPerpsDepositRequest(
  request: Pick<
    QuoteRequest,
    'isPostQuote' | 'targetChainId' | 'targetTokenAddress'
  >,
  parentTransactionType?: TransactionType,
): boolean {
  return (
    parentTransactionType === TransactionType.perpsDeposit &&
    request.isPostQuote !== true &&
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      ARBITRUM_USDC_ADDRESS.toLowerCase()
  );
}

/**
 * Detect the quote-time parent transaction shape that Across can map to a
 * HyperCore USDC-PERPS source withdrawal.
 *
 * @param request - Transaction pay quote request.
 * @param parentTransaction - Parent transaction before Across execution.
 * @returns Whether the request matches the supported withdraw path.
 */
export function isSupportedAcrossPerpsWithdrawRequest(
  request: Pick<QuoteRequest, 'isHyperliquidSource' | 'isPostQuote'>,
  parentTransaction: TransactionMeta,
): boolean {
  return (
    request.isHyperliquidSource === true &&
    request.isPostQuote === true &&
    isPerpsWithdrawTransaction(parentTransaction)
  );
}

/**
 * Convert the transaction-pay request into the Across route shape required for
 * direct perps deposits and withdraws.
 *
 * Transaction pay starts from the required on-chain asset identity
 * (Arbitrum USDC, 6 decimals), while Across now expects the HyperCore
 * USDC-PERPS token (8 decimals).
 *
 * @param request - Transaction pay quote request.
 * @param parentTransaction - Parent transaction before Across execution.
 * @returns Normalized request for Across quoting.
 */
export function normalizeAcrossRequest(
  request: QuoteRequest,
  parentTransaction: TransactionMeta,
): QuoteRequest {
  if (isSupportedAcrossPerpsWithdrawRequest(request, parentTransaction)) {
    return {
      ...request,
      sourceBalanceRaw: shiftUsdcAmountToHyperCore(request.sourceBalanceRaw),
      sourceChainId: CHAIN_ID_HYPERCORE,
      sourceTokenAddress: ACROSS_HYPERCORE_USDC_PERPS_ADDRESS,
      sourceTokenAmount: shiftUsdcAmountToHyperCore(request.sourceTokenAmount),
    };
  }

  if (!isSupportedAcrossPerpsDepositRequest(request, parentTransaction.type)) {
    return request;
  }

  return {
    ...request,
    targetAmountMinimum: shiftUsdcAmountToHyperCore(
      request.targetAmountMinimum,
    ),
    targetChainId: CHAIN_ID_HYPERCORE,
    targetTokenAddress: ACROSS_HYPERCORE_USDC_PERPS_ADDRESS,
  };
}

function shiftUsdcAmountToHyperCore(amount: string): string {
  return new BigNumber(amount)
    .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
    .toFixed(0);
}
