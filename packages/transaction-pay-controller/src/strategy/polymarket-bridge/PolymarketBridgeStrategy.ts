import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyGetRefreshIntervalRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFiatValueFromUsd } from '../../utils/amounts';
import { getPolymarketRelayerUrl } from '../../utils/feature-flags';
import { getTokenFiatRate } from '../../utils/token';
import { updateTransaction } from '../../utils/transaction';
import { PolymarketBridgeApi } from './bridge-api';
import { PUSD_ADDRESS_POLYGON, PUSD_DECIMALS } from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import { extractPolymarketWithdrawIntent } from './intent';
import { PolymarketRelayerApi } from './relayer-api';
import type { PolymarketBridgeQuote } from './types';
import { submitPolymarketBridgeWithdraw } from './withdraw';

const POLYGON_CHAIN_ID = '0x89' as Hex;

const log = createModuleLogger(projectLogger, 'polymarket-bridge-strategy');

const REFRESH_INTERVAL_MS = 25_000;

export class PolymarketBridgeStrategy
  implements PayStrategy<PolymarketBridgeQuote>
{
  readonly #bridgeApi: PolymarketBridgeApi = new PolymarketBridgeApi();

  #buildRelayerApi(
    messenger: TransactionPayControllerMessenger,
  ): PolymarketRelayerApi {
    return new PolymarketRelayerApi(getPolymarketRelayerUrl(messenger));
  }

  supports(_request: PayStrategyGetQuotesRequest): boolean {
    // TODO: restore intent check once transaction shape is verified end-to-end
    return true;
  }

  async getQuotes(
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

    const bridgeQuote = await this.#bridgeApi.getQuote({
      fromAmountBaseUnit: intent.amount.toString(),
      fromChainId: '137',
      fromTokenAddress: PUSD_ADDRESS_POLYGON.toLowerCase(),
      recipientAddress: quoteRequest.from,
      toChainId: parseInt(quoteRequest.targetChainId, 16).toString(),
      toTokenAddress: quoteRequest.targetTokenAddress.toLowerCase(),
    });

    const quote = this.#buildQuote({
      bridgeQuote,
      intent,
      messenger: request.messenger,
      quoteRequest,
    });

    log('Quote built', {
      quoteId: bridgeQuote.quoteId,
      providerUsd: quote.fees.provider.usd,
    });

    return [quote];
  }

  #buildQuote({
    bridgeQuote,
    intent,
    messenger,
    quoteRequest,
  }: {
    bridgeQuote: PolymarketBridgeQuote;
    intent: { amount: bigint };
    messenger: TransactionPayControllerMessenger;
    quoteRequest: PayStrategyGetQuotesRequest['requests'][number];
  }): TransactionPayQuote<PolymarketBridgeQuote> {
    const sourceFiatRate = getTokenFiatRate(
      messenger,
      PUSD_ADDRESS_POLYGON,
      POLYGON_CHAIN_ID,
    );

    const targetFiatRate =
      getTokenFiatRate(
        messenger,
        quoteRequest.targetTokenAddress,
        quoteRequest.targetChainId,
      ) ?? sourceFiatRate;

    const usdToFiatRate =
      sourceFiatRate && new BigNumber(sourceFiatRate.usdRate).isGreaterThan(0)
        ? new BigNumber(sourceFiatRate.fiatRate).dividedBy(
            sourceFiatRate.usdRate,
          )
        : new BigNumber(1);

    const sourceAmount = calculateAmount(
      intent.amount.toString(),
      PUSD_DECIMALS,
      sourceFiatRate,
    );

    const targetAmount = calculateAmount(
      bridgeQuote.toAmount,
      // Polymarket bridge currently only supports USDC-equivalents (6 decimals)
      PUSD_DECIMALS,
      targetFiatRate,
    );

    const providerUsd = new BigNumber(bridgeQuote.estFeeBreakdown.gasUsd)
      .plus(bridgeQuote.estFeeBreakdown.appFeeUsd)
      .plus(bridgeQuote.estFeeBreakdown.swapImpactUsd);

    const provider = getFiatValueFromUsd(providerUsd, usdToFiatRate);

    return {
      original: bridgeQuote,
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
      targetAmount: { fiat: targetAmount.fiat, usd: targetAmount.usd },
      dust: { fiat: '0', usd: '0' },
      estimatedDuration: bridgeQuote.estCheckoutTimeMs / 1000,
      strategy: TransactionPayStrategy.PolymarketBridge,
      request: quoteRequest,
    };
  }

  async execute(
    request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
  ): Promise<{ transactionHash?: Hex }> {
    const quote = request.quotes[0];

    if (!quote) {
      throw new Error('Polymarket bridge execute: no quote provided');
    }

    updateTransaction(
      {
        transactionId: request.transaction.id,
        messenger: request.messenger,
        note: 'Mark intent complete at Polymarket bridge execute start',
      },
      (tx) => {
        tx.isIntentComplete = true;
      },
    );

    const from = quote.request.from;
    const depositWalletAddress = computeDepositWalletAddress(from);

    log('Creating one-shot deposit address');

    const depositAddress = await this.#bridgeApi.createWithdrawAddress({
      address: depositWalletAddress,
      toChainId: parseInt(quote.request.targetChainId, 16).toString(),
      toTokenAddress: quote.request.targetTokenAddress.toLowerCase(),
      recipientAddr: from,
    });

    log('Deposit address created', { depositAddress });

    const result = await submitPolymarketBridgeWithdraw(
      quote,
      from,
      depositWalletAddress,
      depositAddress,
      request.messenger,
      this.#buildRelayerApi(request.messenger),
    );

    log('Relayer confirmed, setting sourceHash', {
      sourceHash: result.relayerTransactionHash,
    });

    updateTransaction(
      {
        transactionId: request.transaction.id,
        messenger: request.messenger,
        note: 'Add source hash from Polymarket relayer',
      },
      (tx) => {
        tx.metamaskPay ??= {};
        tx.metamaskPay.sourceHash = result.relayerTransactionHash;
      },
    );

    return { transactionHash: result.relayerTransactionHash };
  }

  async getBatchTransactions(
    _request: PayStrategyGetBatchRequest<PolymarketBridgeQuote>,
  ): Promise<[]> {
    return [];
  }

  async getRefreshInterval(
    _request: PayStrategyGetRefreshIntervalRequest,
  ): Promise<number> {
    return REFRESH_INTERVAL_MS;
  }
}

function calculateAmount(
  raw: string,
  decimals: number,
  fiatRate:
    | { fiatRate: string; usdRate: string }
    | undefined,
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
