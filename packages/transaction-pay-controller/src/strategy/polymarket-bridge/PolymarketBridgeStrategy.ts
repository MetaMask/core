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
  TransactionPayQuote,
} from '../../types';
import { PolymarketBridgeApi } from './bridge-api';
import { PUSD_ADDRESS_POLYGON, PUSD_DECIMALS } from './constants';
import { extractPolymarketWithdrawIntent } from './intent';
import { PolymarketRelayerApi } from './relayer-api';
import type { RelayerCredentials } from './relayer-api';
import type {
  PolymarketBridgeQuote,
  PolymarketBridgeStrategyOptions,
} from './types';
import { submitPolymarketBridgeWithdraw } from './withdraw';

const log = createModuleLogger(projectLogger, 'polymarket-bridge-strategy');

const REFRESH_INTERVAL_MS = 25_000;

export class PolymarketBridgeStrategy
  implements PayStrategy<PolymarketBridgeQuote>
{
  readonly #bridgeApi: PolymarketBridgeApi;

  readonly #relayerApi: PolymarketRelayerApi;

  constructor(options: PolymarketBridgeStrategyOptions) {
    this.#bridgeApi = new PolymarketBridgeApi(options.environment);

    const creds: RelayerCredentials =
      options.authType === 'relayer-api-key'
        ? {
            type: 'relayer-api-key',
            apiKey: options.relayerApiKey,
            address: options.relayerApiKeyAddress,
          }
        : {
            type: 'builder',
            apiKey: options.builderApiKey,
            secret: options.builderSecret,
            passphrase: options.builderPassphrase ?? '',
          };

    this.#relayerApi = new PolymarketRelayerApi(options.environment, creds);
  }

  supports(request: PayStrategyGetQuotesRequest): boolean {
    const intent = extractPolymarketWithdrawIntent(request.transaction);

    if (!intent) {
      return false;
    }

    log('Supports deposit-wallet predictWithdraw', {
      depositWallet: intent.depositWalletAddress,
      amount: intent.amount.toString(),
    });

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

    quote.original.bridgeDepositAddress = depositAddress;

    log('Deposit address created', { depositAddress });

    const result = await submitPolymarketBridgeWithdraw(
      quote,
      from,
      intent.depositWalletAddress,
      request.messenger,
      this.#relayerApi,
    );

    // Fire-and-forget bridge status poll for telemetry.
    this.#bridgeApi.getStatus(depositAddress).catch((error) => {
      log('Bridge status poll failed (telemetry)', error);
    });

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

function formatBaseUnits(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const paddedRemainder = remainder.toString().padStart(decimals, '0');

  return `${whole}.${paddedRemainder}`;
}
