import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { QuoteRequest } from '../../types.js';
import {
  normalizePerpsDepositRequest,
  normalizePerpsWithdrawRequest,
} from '../../utils/perps.js';

/**
 * Placeholder token address for the Hyperliquid perps margin account on
 * HyperCore. Only used within the quote request, as the server strategy sends
 * any HyperCore asset as `SERVER_HYPERLIQUID_PERPS_USDC_ASSET`.
 */
export const SERVER_HYPERCORE_USDC_PERPS_ADDRESS =
  '0x2100000000000000000000000000000000000000' as Hex;

/**
 * Translate a Hyperliquid perps deposit or withdraw quote request into the
 * HyperCore shape, so it is sent as the Hyperliquid perps asset.
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
