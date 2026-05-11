import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

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
import { getPolymarketRelayerUrl } from '../../utils/feature-flags';
import { updateTransaction } from '../../utils/transaction';
import { PolymarketBridgeApi } from './bridge-api';
import { PUSD_ADDRESS_POLYGON, PUSD_DECIMALS } from './constants';
import { extractPolymarketWithdrawIntent } from './intent';
import { PolymarketRelayerApi } from './relayer-api';
import type { PolymarketBridgeQuote } from './types';
import { submitPolymarketBridgeWithdraw } from './withdraw';

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

    const humanAmount = formatBaseUnits(intent.amount, PUSD_DECIMALS);

    const quote: TransactionPayQuote<PolymarketBridgeQuote> = {
      original: bridgeQuote,
      fees: {
        metaMask: { fiat: '0', usd: '0' },
        provider: { fiat: '0', usd: '0' },
        sourceNetwork: {
          estimate: { fiat: '0', usd: '0', human: '0', raw: '0' },
          max: { fiat: '0', usd: '0', human: '0', raw: '0' },
        },
        targetNetwork: { fiat: '0', usd: '0' },
      },
      sourceAmount: {
        fiat: '0',
        usd: '0',
        human: humanAmount,
        raw: intent.amount.toString(),
      },
      targetAmount: { fiat: '0', usd: '0' },
      dust: { fiat: '0', usd: '0' },
      estimatedDuration: bridgeQuote.estCheckoutTimeMs / 1000,
      strategy: TransactionPayStrategy.PolymarketBridge,
      request: quoteRequest,
    };

    log('Quote built', { quoteId: bridgeQuote.quoteId });

    return [quote];
  }

  async execute(
    request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
  ): Promise<{ transactionHash?: Hex }> {
    const intent = extractPolymarketWithdrawIntent(request.transaction);

    if (!intent) {
      throw new Error(
        'Polymarket bridge execute: transaction is not a deposit-wallet predictWithdraw',
      );
    }

    const quote = request.quotes[0];

    if (!quote) {
      throw new Error('Polymarket bridge execute: no quote provided');
    }

    const from = request.transaction.txParams.from as Hex;

    log('Creating one-shot deposit address');

    const depositAddress = await this.#bridgeApi.createWithdrawAddress({
      address: intent.depositWalletAddress,
      toChainId: parseInt(quote.request.targetChainId, 16).toString(),
      toTokenAddress: quote.request.targetTokenAddress.toLowerCase(),
      recipientAddr: from,
    });

    log('Deposit address created', { depositAddress });

    const result = await submitPolymarketBridgeWithdraw(
      quote,
      from,
      intent.depositWalletAddress,
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

    log('Polling bridge for target-side completion', { depositAddress });

    const bridgeResult =
      await this.#bridgeApi.pollUntilBridgeComplete(depositAddress);

    if (bridgeResult.status === 'FAILED') {
      throw new Error(
        `Polymarket bridge failed on target chain for deposit ${depositAddress}`,
      );
    }

    const targetHash = (bridgeResult.txHash ?? result.relayerTransactionHash) as Hex;

    log('Bridge complete', { targetHash, status: bridgeResult.status });

    updateTransaction(
      {
        transactionId: request.transaction.id,
        messenger: request.messenger,
        note: 'Intent complete after Polymarket bridge completion',
      },
      (tx) => {
        tx.isIntentComplete = true;
      },
    );

    return { transactionHash: targetHash };
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

function formatBaseUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const paddedRemainder = remainder.toString().padStart(decimals, '0');

  return `${whole}.${paddedRemainder}`;
}
