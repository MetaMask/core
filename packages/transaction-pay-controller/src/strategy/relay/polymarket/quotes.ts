import { BigNumber } from 'bignumber.js';

import { CHAIN_ID_POLYGON } from '../../../constants';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../../types';
import { getSlippage } from '../../../utils/feature-flags';
import type { RelayQuoteRequest } from '../types';
import { USDC_E_ADDRESS_POLYGON } from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';

const POLYGON_CHAIN_ID_NUMBER = 137;

export function buildPolymarketDepositWalletQuoteBody(
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): RelayQuoteRequest {
  const depositWalletAddress = computeDepositWalletAddress(request.from);

  const slippageTolerance = new BigNumber(
    getSlippage(messenger, CHAIN_ID_POLYGON, USDC_E_ADDRESS_POLYGON) *
      100 *
      100,
  ).toFixed(0);

  return {
    amount: request.sourceTokenAmount,
    destinationChainId: parseInt(request.targetChainId, 16),
    destinationCurrency: request.targetTokenAddress,
    originChainId: POLYGON_CHAIN_ID_NUMBER,
    originCurrency: USDC_E_ADDRESS_POLYGON,
    recipient: request.from,
    refundTo: depositWalletAddress,
    slippageTolerance,
    tradeType: 'EXACT_INPUT',
    useDepositAddress: true,
    user: depositWalletAddress,
  };
}
