import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { QuoteRequest } from '../../types.js';
import {
  normalizePerpsDepositRequest,
  normalizePerpsWithdrawRequest,
} from '../../utils/perps.js';

/**
 * Shared 20-byte sentinel address emitted by the server strategy to flag a
 * Hyperliquid perps deposit. Backend providers translate this to their own
 * on-chain destination (e.g. Relay's 16-byte HyperCore USDC sentinel, Across's
 * native USDC-PERPS token at the same address).
 */
export const SERVER_HYPERCORE_USDC_PERPS_ADDRESS =
  '0x2100000000000000000000000000000000000000' as Hex;

/**
 * Translate a Hyperliquid perps deposit or withdraw quote request into the
 * HyperCore shape with a provider-agnostic sentinel address. Backend providers
 * detect the sentinel and rewrite it to their respective on-chain addresses.
 *
 * @param request - Quote request from the transaction-pay controller.
 * @param transaction - Parent transaction whose calls are inspected.
 * @returns Normalized request, or the original request if not a perps flow.
 */
export function normalizeServerPerpsRequest(
  request: QuoteRequest,
  transaction: Pick<TransactionMeta, 'txParams' | 'nestedTransactions'>,
): QuoteRequest {
  if (request.isHyperliquidSource) {
    return normalizePerpsWithdrawRequest(
      request,
      SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
    );
  }

  return normalizePerpsDepositRequest(
    request,
    transaction,
    SERVER_HYPERCORE_USDC_PERPS_ADDRESS,
  );
}
