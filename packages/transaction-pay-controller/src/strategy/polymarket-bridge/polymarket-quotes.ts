import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { CHAIN_ID_POLYGON, TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFiatValueFromUsd } from '../../utils/amounts';
import { getSlippage } from '../../utils/feature-flags';
import { getTokenFiatRate } from '../../utils/token';
import { fetchRelayQuote } from '../relay/relay-api';
import type { RelayQuote, RelayQuoteRequest } from '../relay/types';
import {
  PUSD_ADDRESS_POLYGON,
  PUSD_DECIMALS,
  USDC_E_ADDRESS_POLYGON,
} from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import { extractPolymarketWithdrawIntent } from './intent';
import type { PolymarketBridgeQuote } from './types';

const log = createModuleLogger(projectLogger, 'polymarket-bridge-quotes');

const POLYGON_CHAIN_ID_NUMBER = 137;

export async function getPolymarketBridgeQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<PolymarketBridgeQuote>[]> {
  const intent = extractPolymarketWithdrawIntent(request.transaction);
  if (!intent) {
    return [];
  }

  const quoteRequest = request.requests[0];
  if (!quoteRequest) {
    return [];
  }

  const depositWalletAddress = computeDepositWalletAddress(quoteRequest.from);

  const body = buildRelayQuoteRequest({
    intent,
    quoteRequest,
    depositWalletAddress,
    messenger: request.messenger,
  });

  log('Fetching Relay quote', {
    originCurrency: body.originCurrency,
    destinationChainId: body.destinationChainId,
    destinationCurrency: body.destinationCurrency,
    amount: body.amount,
  });

  const relayQuote = await fetchRelayQuote(
    request.messenger,
    body,
    request.signal,
  );

  log('Relay quote fetched', {
    currencyOutAmount: relayQuote.details.currencyOut.amountFormatted,
    totalImpactUsd: relayQuote.details.totalImpact.usd,
    stepCount: relayQuote.steps.length,
  });

  return [
    buildTransactionPayQuote({
      relayQuote,
      intent,
      messenger: request.messenger,
      quoteRequest,
    }),
  ];
}

function buildRelayQuoteRequest({
  intent,
  quoteRequest,
  depositWalletAddress,
  messenger,
}: {
  intent: { amount: bigint };
  quoteRequest: QuoteRequest;
  depositWalletAddress: Hex;
  messenger: TransactionPayControllerMessenger;
}): RelayQuoteRequest {
  const slippageTolerance = new BigNumber(
    getSlippage(messenger, CHAIN_ID_POLYGON, USDC_E_ADDRESS_POLYGON) *
      100 *
      100,
  ).toFixed(0);

  return {
    amount: intent.amount.toString(),
    destinationChainId: parseInt(quoteRequest.targetChainId, 16),
    destinationCurrency: quoteRequest.targetTokenAddress,
    originChainId: POLYGON_CHAIN_ID_NUMBER,
    originCurrency: USDC_E_ADDRESS_POLYGON,
    recipient: quoteRequest.from,
    refundTo: depositWalletAddress,
    slippageTolerance,
    tradeType: 'EXACT_INPUT',
    useDepositAddress: true,
    user: depositWalletAddress,
  };
}

function buildTransactionPayQuote({
  relayQuote,
  intent,
  messenger,
  quoteRequest,
}: {
  relayQuote: RelayQuote;
  intent: { amount: bigint };
  messenger: TransactionPayControllerMessenger;
  quoteRequest: QuoteRequest;
}): TransactionPayQuote<PolymarketBridgeQuote> {
  const sourceFiatRate = getTokenFiatRate(
    messenger,
    PUSD_ADDRESS_POLYGON,
    CHAIN_ID_POLYGON,
  );

  const usdToFiatRate =
    sourceFiatRate && new BigNumber(sourceFiatRate.usdRate).isGreaterThan(0)
      ? new BigNumber(sourceFiatRate.fiatRate).dividedBy(sourceFiatRate.usdRate)
      : new BigNumber(1);

  const sourceAmount = buildAmount(
    intent.amount.toString(),
    PUSD_DECIMALS,
    sourceFiatRate,
  );

  const targetAmountUsd = new BigNumber(
    relayQuote.details.currencyOut.amountUsd,
  );
  const targetAmount = getFiatValueFromUsd(targetAmountUsd, usdToFiatRate);

  const providerFeeUsd = new BigNumber(
    relayQuote.fees.relayer?.amountUsd ?? '0',
  ).plus(relayQuote.fees.app?.amountUsd ?? '0');
  const provider = getFiatValueFromUsd(providerFeeUsd, usdToFiatRate);

  return {
    original: { relayQuote },
    fees: {
      metaMask: { fiat: '0', usd: '0' },
      provider,
      sourceNetwork: {
        estimate: { fiat: '0', usd: '0', human: '0', raw: '0' },
        max: { fiat: '0', usd: '0', human: '0', raw: '0' },
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    sourceAmount,
    targetAmount,
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: relayQuote.details.timeEstimate ?? 30,
    strategy: TransactionPayStrategy.PolymarketBridge,
    request: quoteRequest,
  };
}

function buildAmount(
  raw: string,
  decimals: number,
  fiatRate: { fiatRate: string; usdRate: string } | undefined,
): { fiat: string; human: string; raw: string; usd: string } {
  const humanValue = new BigNumber(raw).shiftedBy(-decimals);
  const human = humanValue.toString(10);
  const usd = fiatRate
    ? humanValue.multipliedBy(fiatRate.usdRate).toString(10)
    : '0';
  const fiat = fiatRate
    ? humanValue.multipliedBy(fiatRate.fiatRate).toString(10)
    : '0';
  return { fiat, human, raw, usd };
}
