import type { QuoteRequest } from '../../../types';
import type { RelayQuoteRequest } from '../types';
import { USDC_E_ADDRESS_POLYGON } from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';

export function applyPolymarketDepositWalletOverrides(
  body: RelayQuoteRequest,
  request: QuoteRequest,
): void {
  const depositWalletAddress = computeDepositWalletAddress(request.from);

  body.originCurrency = USDC_E_ADDRESS_POLYGON;
  body.user = depositWalletAddress;
  body.refundTo = depositWalletAddress;
  body.useDepositAddress = true;
}
