import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { CHAIN_ID_HYPERCORE } from '../../constants.js';
import type { QuoteRequest } from '../../types.js';
import { normalizePerpsDepositRequest } from '../../utils/perps.js';
import type { AcrossSwapApprovalResponse } from './types.js';

export const ACROSS_HYPERCORE_USDC_PERPS_ADDRESS =
  '0x2100000000000000000000000000000000000000' as Hex;

/**
 * Decimals Across uses for HyperCore USDC-PERPS. This differs from the 8
 * decimals of HyperCore USDC used by other strategies, as the HyperCore perps
 * ledger accounts in 6 decimals.
 */
export const ACROSS_HYPERCORE_USDC_PERPS_DECIMALS = 6;

/**
 * Convert the transaction-pay request into the Across route shape required for
 * direct perps deposits, targeting the HyperCore USDC-PERPS token.
 *
 * @param request - Transaction pay quote request.
 * @param transaction - Parent transaction whose calls are inspected.
 * @returns Normalized request for Across quoting.
 */
export function normalizeAcrossRequest(
  request: QuoteRequest,
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): QuoteRequest {
  return normalizePerpsDepositRequest(
    request,
    transaction,
    ACROSS_HYPERCORE_USDC_PERPS_ADDRESS,
    ACROSS_HYPERCORE_USDC_PERPS_DECIMALS,
  );
}

/**
 * Ensure an Across quote for a HyperCore USDC-PERPS deposit uses the decimals
 * the request amount was scaled to.
 *
 * If Across changes the USDC-PERPS decimals again, the requested amount would
 * be misinterpreted by orders of magnitude. Throwing lets the strategy loop
 * fall back to the next strategy instead of presenting a mispriced quote.
 *
 * @param request - Normalized Across quote request.
 * @param quote - Across swap approval response.
 */
export function validateAcrossPerpsQuote(
  request: Pick<QuoteRequest, 'targetChainId' | 'targetTokenAddress'>,
  quote: AcrossSwapApprovalResponse,
): void {
  const isPerpsDeposit =
    request.targetChainId === CHAIN_ID_HYPERCORE &&
    request.targetTokenAddress.toLowerCase() ===
      ACROSS_HYPERCORE_USDC_PERPS_ADDRESS.toLowerCase();

  if (!isPerpsDeposit) {
    return;
  }

  const { decimals } = quote.outputToken;

  if (decimals !== ACROSS_HYPERCORE_USDC_PERPS_DECIMALS) {
    throw new Error(
      `Unexpected Across USDC-PERPS decimals - Expected: ${ACROSS_HYPERCORE_USDC_PERPS_DECIMALS} | Received: ${decimals}`,
    );
  }
}
