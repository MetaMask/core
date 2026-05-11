import type { TransactionMeta } from '@metamask/transaction-controller';
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
  QuoteRequest,
} from '../../types';
import { getFiatValueFromUsd } from '../../utils/amounts';
import {
  getPolymarketRelayerUrl,
  getRelayOriginGasOverhead,
  getSlippage,
  isEIP7702Chain,
  isRelayExecuteEnabled,
} from '../../utils/feature-flags';
import { getTokenFiatRate } from '../../utils/token';
import { updateTransaction } from '../../utils/transaction';
import { fetchRelayQuote } from '../relay/relay-api';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote, RelayQuoteRequest } from '../relay/types';
import { PolymarketBridgeApi } from './bridge-api';
import {
  PUSD_ADDRESS_POLYGON,
  PUSD_DECIMALS,
  USE_RELAY_BRIDGE,
} from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import { extractPolymarketWithdrawIntent } from './intent';
import { PolymarketRelayerApi } from './relayer-api';
import type { PolymarketBridgeQuote } from './types';
import { submitPolymarketBridgeWithdraw } from './withdraw';

const POLYGON_CHAIN_ID = '0x89' as Hex;
const POLYGON_CHAIN_ID_NUMBER = 137;

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

    if (USE_RELAY_BRIDGE) {
      return await this.#getRelayBackedQuote({ request, intent, quoteRequest });
    }

    return await this.#getPolymarketBridgeQuote({
      request,
      intent,
      quoteRequest,
    });
  }

  async #getPolymarketBridgeQuote({
    request,
    intent,
    quoteRequest,
  }: {
    request: PayStrategyGetQuotesRequest;
    intent: { amount: bigint };
    quoteRequest: QuoteRequest;
  }): Promise<TransactionPayQuote<PolymarketBridgeQuote>[]> {
    const bridgeQuote = await this.#bridgeApi.getQuote({
      fromAmountBaseUnit: intent.amount.toString(),
      fromChainId: '137',
      fromTokenAddress: PUSD_ADDRESS_POLYGON.toLowerCase(),
      recipientAddress: quoteRequest.from,
      toChainId: parseInt(quoteRequest.targetChainId, 16).toString(),
      toTokenAddress: quoteRequest.targetTokenAddress.toLowerCase(),
    });

    const quote = this.#buildPolymarketBridgeQuote({
      bridgeQuote,
      intent,
      messenger: request.messenger,
      quoteRequest,
    });

    log('Polymarket bridge quote built', {
      quoteId: bridgeQuote.quoteId,
      providerUsd: quote.fees.provider.usd,
    });

    return [quote];
  }

  async #getRelayBackedQuote({
    request,
    intent,
    quoteRequest,
  }: {
    request: PayStrategyGetQuotesRequest;
    intent: { amount: bigint };
    quoteRequest: QuoteRequest;
  }): Promise<TransactionPayQuote<PolymarketBridgeQuote>[]> {
    const { messenger, accountSupports7702 } = request;
    const depositWalletAddress = computeDepositWalletAddress(quoteRequest.from);

    const useExecute =
      accountSupports7702 &&
      isRelayExecuteEnabled(messenger) &&
      isEIP7702Chain(messenger, POLYGON_CHAIN_ID);

    const slippageDecimal = getSlippage(
      messenger,
      POLYGON_CHAIN_ID,
      PUSD_ADDRESS_POLYGON,
    );
    const slippageTolerance = new BigNumber(
      slippageDecimal * 100 * 100,
    ).toFixed(0);

    const body: RelayQuoteRequest = {
      amount: intent.amount.toString(),
      destinationChainId: parseInt(quoteRequest.targetChainId, 16),
      destinationCurrency: quoteRequest.targetTokenAddress,
      originChainId: POLYGON_CHAIN_ID_NUMBER,
      originCurrency: PUSD_ADDRESS_POLYGON,
      ...(useExecute
        ? { originGasOverhead: getRelayOriginGasOverhead(messenger) }
        : {}),
      recipient: quoteRequest.from,
      refundTo: depositWalletAddress,
      slippageTolerance,
      tradeType: 'EXACT_INPUT',
      user: quoteRequest.from,
    };

    log('Fetching Relay quote (pUSD→target)', {
      destinationChainId: body.destinationChainId,
      destinationCurrency: body.destinationCurrency,
      amount: body.amount,
      useExecute,
    });

    const relayQuote = await fetchRelayQuote(messenger, body, request.signal);

    log('Relay quote fetched', {
      currencyOutAmount: relayQuote.details.currencyOut.amountFormatted,
      totalImpactUsd: relayQuote.details.totalImpact.usd,
      isExecute: relayQuote.metamask?.isExecute,
      stepCount: relayQuote.steps.length,
    });

    const quote = this.#buildRelayBackedQuote({
      relayQuote,
      intent,
      messenger,
      quoteRequest,
    });

    return [quote];
  }

  #buildPolymarketBridgeQuote({
    bridgeQuote,
    intent,
    messenger,
    quoteRequest,
  }: {
    bridgeQuote: PolymarketBridgeQuote;
    intent: { amount: bigint };
    messenger: TransactionPayControllerMessenger;
    quoteRequest: QuoteRequest;
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

  #buildRelayBackedQuote({
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
      POLYGON_CHAIN_ID,
    );

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

    const targetAmountUsd = new BigNumber(
      relayQuote.details.currencyOut.amountUsd,
    );
    const targetAmount = getFiatValueFromUsd(targetAmountUsd, usdToFiatRate);

    const providerFeeUsd = new BigNumber(
      relayQuote.fees.relayer?.amountUsd ?? '0',
    ).plus(relayQuote.fees.app?.amountUsd ?? '0');
    const provider = getFiatValueFromUsd(providerFeeUsd, usdToFiatRate);

    const stub: PolymarketBridgeQuote = {
      quoteId: relayQuote.steps[0]?.requestId ?? '',
      bridgeDepositAddress: null,
      fromAmount: intent.amount.toString(),
      toAmount: relayQuote.details.currencyOut.amount,
      minReceived: relayQuote.details.currencyOut.minimumAmount,
      estCheckoutTimeMs: (relayQuote.details.timeEstimate ?? 30) * 1000,
      estFeeBreakdown: {
        gasUsd: 0,
        appFeeUsd: Number(relayQuote.fees.app?.amountUsd ?? '0'),
        swapImpactUsd: 0,
      },
      relayQuote,
    };

    return {
      original: stub,
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

    if (quote.original.relayQuote) {
      return await this.#executeRelayBacked(request, quote.original.relayQuote);
    }

    return await this.#executePolymarketBridge(request);
  }

  async #executePolymarketBridge(
    request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
  ): Promise<{ transactionHash?: Hex }> {
    const quote = request.quotes[0];
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

    log('Polymarket relayer confirmed, setting sourceHash', {
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

    log('Polling bridge for target-side completion', { depositAddress });

    const bridgeResult =
      await this.#bridgeApi.pollUntilBridgeComplete(depositAddress);

    if (bridgeResult.status !== 'COMPLETED' || !bridgeResult.txHash) {
      log('Bridge did not reach COMPLETED, returning source hash', {
        status: bridgeResult.status,
      });
      return { transactionHash: result.relayerTransactionHash };
    }

    log('Bridge COMPLETED', { targetHash: bridgeResult.txHash });

    return { transactionHash: bridgeResult.txHash as Hex };
  }

  async #executeRelayBacked(
    request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
    relayQuote: RelayQuote,
  ): Promise<{ transactionHash?: Hex }> {
    const quote = request.quotes[0];
    const from = quote.request.from;
    const depositWalletAddress = computeDepositWalletAddress(from);

    log('Step 1: transferring pUSD from deposit wallet to user EOA', {
      depositWalletAddress,
      recipient: from,
    });

    const step1 = await submitPolymarketBridgeWithdraw(
      quote,
      from,
      depositWalletAddress,
      from,
      request.messenger,
      this.#buildRelayerApi(request.messenger),
    );

    log('Step 1 confirmed, recording sourceHash', {
      sourceHash: step1.relayerTransactionHash,
    });

    updateTransaction(
      {
        transactionId: request.transaction.id,
        messenger: request.messenger,
        note: 'Add source hash from Polymarket relayer (deposit→EOA transfer)',
      },
      (tx) => {
        tx.metamaskPay ??= {};
        tx.metamaskPay.sourceHash = step1.relayerTransactionHash;
      },
    );

    log('Step 2: submitting Relay quote from user EOA');

    const relayTransactionPayQuote = buildRelayTransactionPayQuote({
      relayQuote,
      quote,
    });

    const strippedTransaction = stripOriginalTxForRelayBatch(
      request.transaction,
    );

    const targetHash = await submitRelayQuotes({
      quotes: [relayTransactionPayQuote],
      messenger: request.messenger,
      transaction: strippedTransaction,
      accountSupports7702: request.accountSupports7702,
      isSmartTransaction: request.isSmartTransaction,
    });

    log('Step 2 complete', { transactionHash: targetHash.transactionHash });

    return targetHash;
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

function buildRelayTransactionPayQuote({
  relayQuote,
  quote,
}: {
  relayQuote: RelayQuote;
  quote: TransactionPayQuote<PolymarketBridgeQuote>;
}): TransactionPayQuote<RelayQuote> {
  const syntheticRequest: QuoteRequest = {
    ...quote.request,
    from: quote.request.from,
    sourceChainId: POLYGON_CHAIN_ID,
    sourceTokenAddress: PUSD_ADDRESS_POLYGON,
    sourceTokenAmount: quote.sourceAmount.raw,
    sourceBalanceRaw: quote.sourceAmount.raw,
    isPostQuote: true,
    isHyperliquidSource: false,
    isPolymarketDepositWallet: false,
  };

  return {
    ...quote,
    original: relayQuote,
    request: syntheticRequest,
    strategy: TransactionPayStrategy.Relay,
  };
}

function stripOriginalTxForRelayBatch(
  transaction: TransactionMeta,
): TransactionMeta {
  return {
    ...transaction,
    txParams: {
      ...transaction.txParams,
      to: undefined,
      data: undefined,
      value: undefined,
    },
  };
}
