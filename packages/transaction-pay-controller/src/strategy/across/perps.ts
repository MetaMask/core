import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  HYPERCORE_USDC_DECIMALS,
  NATIVE_TOKEN_ADDRESS,
  USDC_DECIMALS,
} from '../../constants';
import type { QuoteRequest } from '../../types';

export const ACROSS_HYPERCORE_USDC_PERPS_ADDRESS =
  '0x2100000000000000000000000000000000000000' as Hex;

function isAcrossPerpsDirectDepositRequest(
  request: Pick<QuoteRequest, 'targetChainId' | 'targetTokenAddress'>,
): boolean {
  return (
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      ARBITRUM_USDC_ADDRESS.toLowerCase()
  );
}

function isAcrossPerpsGasTopUpRequest(
  request: Pick<QuoteRequest, 'targetChainId' | 'targetTokenAddress'>,
): boolean {
  return (
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      NATIVE_TOKEN_ADDRESS.toLowerCase()
  );
}

/**
 * Detect the quote-time parent transaction shape that Across can support for
 * HyperCore perps deposits.
 *
 * The parent transaction remains `perpsDeposit` while quotes are being
 * selected. `perpsAcrossDeposit` is only assigned later to the generated
 * Across submission transaction(s). At quote time Across can support:
 * - the direct HyperCore USDC deposit leg
 * - the destination-chain native gas top-up leg
 *
 * @param request - Transaction pay quote request.
 * @param parentTransactionType - Parent transaction type before Across
 * execution.
 * @returns Whether the request matches a supported perps deposit leg.
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
    (isAcrossPerpsDirectDepositRequest(request) ||
      isAcrossPerpsGasTopUpRequest(request))
  );
}

/**
 * Convert the transaction-pay request into the Across route shape required for
 * direct perps deposits.
 *
 * Transaction pay starts from the required on-chain asset identity
 * (Arbitrum USDC, 6 decimals), while Across expects the HyperCore
 * USDC-PERPS destination token (8 decimals) for the USDC deposit leg.
 *
 * @param request - Transaction pay quote request.
 * @param parentTransactionType - Parent transaction type before Across
 * execution.
 * @returns Normalized request for Across quoting.
 */
export function normalizeAcrossRequest(
  request: QuoteRequest,
  parentTransactionType?: TransactionType,
): QuoteRequest {
  if (
    parentTransactionType !== TransactionType.perpsDeposit ||
    !isAcrossPerpsDirectDepositRequest(request)
  ) {
    return request;
  }

  return {
    ...request,
    targetAmountMinimum: new BigNumber(request.targetAmountMinimum)
      .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
      .toFixed(0),
    targetChainId: CHAIN_ID_HYPERCORE,
    targetTokenAddress: ACROSS_HYPERCORE_USDC_PERPS_ADDRESS,
  };
}
