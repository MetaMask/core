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
import { getLiveTokenBalance, getTokenFiatRate } from '../../utils/token';
import { updateTransaction } from '../../utils/transaction';
import { fetchRelayQuote, getRelayStatus } from '../relay/relay-api';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote, RelayQuoteRequest } from '../relay/types';
import { PolymarketBridgeApi } from './bridge-api';
import {
  FORCE_SKIP_RELAY_POLL,
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
  PUSD_ADDRESS_POLYGON,
  PUSD_DECIMALS,
  USDC_E_ADDRESS_POLYGON,
  USE_RELAY_BRIDGE,
  USE_RELAY_DEPOSIT_ADDRESS,
} from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import { extractPolymarketWithdrawIntent } from './intent';
import { PolymarketRelayerApi } from './relayer-api';
import type { PolymarketBridgeQuote } from './types';
import {
  submitDepositWalletBatch,
  submitPolymarketBridgeWithdraw,
} from './withdraw';

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

    const body = USE_RELAY_DEPOSIT_ADDRESS
      ? this.#buildRelayDepositAddressRequest({
          intent,
          quoteRequest,
          depositWalletAddress,
          messenger,
        })
      : this.#buildRelayEoaRequest({
          intent,
          quoteRequest,
          depositWalletAddress,
          accountSupports7702,
          messenger,
        });

    log('Fetching Relay quote', {
      originCurrency: body.originCurrency,
      destinationChainId: body.destinationChainId,
      destinationCurrency: body.destinationCurrency,
      amount: body.amount,
      useDepositAddress: USE_RELAY_DEPOSIT_ADDRESS,
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

  #buildRelayEoaRequest({
    intent,
    quoteRequest,
    depositWalletAddress,
    accountSupports7702,
    messenger,
  }: {
    intent: { amount: bigint };
    quoteRequest: QuoteRequest;
    depositWalletAddress: Hex;
    accountSupports7702: boolean;
    messenger: TransactionPayControllerMessenger;
  }): RelayQuoteRequest {
    const useExecute =
      accountSupports7702 &&
      isRelayExecuteEnabled(messenger) &&
      isEIP7702Chain(messenger, POLYGON_CHAIN_ID);

    const slippageTolerance = new BigNumber(
      getSlippage(messenger, POLYGON_CHAIN_ID, PUSD_ADDRESS_POLYGON) *
        100 *
        100,
    ).toFixed(0);

    return {
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
  }

  #buildRelayDepositAddressRequest({
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
      getSlippage(messenger, POLYGON_CHAIN_ID, USDC_E_ADDRESS_POLYGON) *
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
    if (USE_RELAY_DEPOSIT_ADDRESS) {
      return await this.#executeRelayDepositAddress(request, relayQuote);
    }

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

  async #executeRelayDepositAddress(
    request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
    relayQuote: RelayQuote,
  ): Promise<{ transactionHash?: Hex }> {
    const quote = request.quotes[0];
    const from = quote.request.from;
    const depositWalletAddress = computeDepositWalletAddress(from);

    const depositStep = relayQuote.steps.find((step) => step.id === 'deposit');

    if (!depositStep || depositStep.kind !== 'transaction') {
      throw new Error(
        'Polymarket bridge (Relay deposit-address): no deposit step found',
      );
    }

    const depositItemData = depositStep.items[0]?.data;
    const depositCallData =
      depositItemData && 'data' in depositItemData
        ? depositItemData.data
        : undefined;

    if (!depositCallData) {
      throw new Error(
        'Polymarket bridge (Relay deposit-address): missing deposit calldata',
      );
    }

    const relayDepositAddress = extractTransferRecipient(depositCallData);
    const amount = BigInt(quote.sourceAmount.raw);

    log('Building approve + unwrap batch', {
      depositWalletAddress,
      relayDepositAddress,
      amount: amount.toString(),
    });

    const approveData = encodeApproveCalldata(
      POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
      amount,
    );
    const unwrapData = encodeUnwrapCalldata({
      asset: USDC_E_ADDRESS_POLYGON,
      recipient: relayDepositAddress,
      amount,
    });

    const result = await submitDepositWalletBatch({
      from,
      depositWalletAddress,
      calls: [
        {
          target: PUSD_ADDRESS_POLYGON,
          value: 0n,
          data: approveData,
        },
        {
          target: POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
          value: 0n,
          data: unwrapData,
        },
      ],
      messenger: request.messenger,
      relayerApi: this.#buildRelayerApi(request.messenger),
    });

    log('Relayer batch confirmed, setting sourceHash', {
      sourceHash: result.relayerTransactionHash,
    });

    updateTransaction(
      {
        transactionId: request.transaction.id,
        messenger: request.messenger,
        note: 'Add source hash from Polymarket relayer (approve+unwrap batch)',
      },
      (tx) => {
        tx.metamaskPay ??= {};
        tx.metamaskPay.sourceHash = result.relayerTransactionHash;
      },
    );

    const requestId = depositStep.requestId;

    const relayOutcome = FORCE_SKIP_RELAY_POLL
      ? ({ kind: 'skipped' } as const)
      : await pollRelayStatusUntilTerminal(requestId);

    if (FORCE_SKIP_RELAY_POLL) {
      log('FORCE_SKIP_RELAY_POLL is true: skipping Relay status poll');
    } else {
      log('Relay polling complete', { kind: relayOutcome.kind });
    }

    await this.#wrapDepositWalletUsdce({
      request,
      depositWalletAddress,
      from,
    });

    if (relayOutcome.kind === 'success') {
      return { transactionHash: relayOutcome.targetHash };
    }

    return { transactionHash: result.relayerTransactionHash };
  }

  async #wrapDepositWalletUsdce({
    request,
    depositWalletAddress,
    from,
  }: {
    request: PayStrategyExecuteRequest<PolymarketBridgeQuote>;
    depositWalletAddress: Hex;
    from: Hex;
  }): Promise<void> {
    let usdceBalance: bigint;
    try {
      const raw = await getLiveTokenBalance(
        request.messenger,
        depositWalletAddress,
        POLYGON_CHAIN_ID,
        USDC_E_ADDRESS_POLYGON,
      );
      usdceBalance = BigInt(raw);
    } catch (error) {
      log('USDC.e sweep: failed to read deposit wallet balance', { error });
      return;
    }

    log('USDC.e sweep: deposit wallet balance', {
      depositWalletAddress,
      balance: usdceBalance.toString(),
    });

    if (usdceBalance === 0n) {
      log('USDC.e sweep: nothing to wrap');
      return;
    }

    log('USDC.e sweep: submitting approve + wrap batch', {
      amount: usdceBalance.toString(),
    });

    const approveData = encodeApproveCalldata(
      POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
      usdceBalance,
    );
    const wrapData = encodeWrapCalldata({
      asset: USDC_E_ADDRESS_POLYGON,
      recipient: depositWalletAddress,
      amount: usdceBalance,
    });

    try {
      const result = await submitWithBusyRetry({
        from,
        depositWalletAddress,
        calls: [
          {
            target: USDC_E_ADDRESS_POLYGON,
            value: 0n,
            data: approveData,
          },
          {
            target: POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
            value: 0n,
            data: wrapData,
          },
        ],
        messenger: request.messenger,
        relayerApi: this.#buildRelayerApi(request.messenger),
      });

      log('USDC.e sweep: complete', {
        transactionHash: result.relayerTransactionHash,
      });
    } catch (error) {
      log('USDC.e sweep: batch submission failed', { error });
    }
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

function extractTransferRecipient(data: Hex): Hex {
  const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';
  if (!data.startsWith(ERC20_TRANSFER_SELECTOR)) {
    throw new Error(
      `Expected ERC-20 transfer calldata, got selector ${data.slice(0, 10)}`,
    );
  }
  return `0x${data.slice(34, 74)}` as Hex;
}

function encodeApproveCalldata(spender: Hex, amount: bigint): Hex {
  const selector = '095ea7b3';
  const paddedAddress = spender.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return `0x${selector}${paddedAddress}${paddedAmount}` as Hex;
}

function encodeUnwrapCalldata({
  asset,
  recipient,
  amount,
}: {
  asset: Hex;
  recipient: Hex;
  amount: bigint;
}): Hex {
  const selector = '8cc7104f';
  const paddedAsset = asset.slice(2).toLowerCase().padStart(64, '0');
  const paddedRecipient = recipient.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return `0x${selector}${paddedAsset}${paddedRecipient}${paddedAmount}` as Hex;
}

const RELAY_STATUS_POLL_INTERVAL_MS = 5_000;
const RELAY_STATUS_POLL_MAX_ATTEMPTS = 120;

type RelayPollOutcome =
  | { kind: 'success'; targetHash: Hex }
  | { kind: 'refunded' }
  | { kind: 'failure' }
  | { kind: 'timeout' };

async function pollRelayStatusUntilTerminal(
  requestId: string,
): Promise<RelayPollOutcome> {
  for (let attempt = 0; attempt < RELAY_STATUS_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      const status = await getRelayStatus(requestId);
      log('Relay status', {
        attempt,
        status: status.status,
        txHashes: status.txHashes,
      });

      if (status.status === 'success' && status.txHashes?.length) {
        return {
          kind: 'success',
          targetHash: status.txHashes[status.txHashes.length - 1] as Hex,
        };
      }

      if (status.status === 'refunded') {
        return { kind: 'refunded' };
      }

      if (status.status === 'failure') {
        return { kind: 'failure' };
      }
    } catch (error) {
      log('Relay status poll error', { attempt, error });
    }

    await new Promise((resolve) =>
      setTimeout(resolve, RELAY_STATUS_POLL_INTERVAL_MS),
    );
  }

  return { kind: 'timeout' };
}

const WALLET_BUSY_RETRY_ATTEMPTS = 5;
const WALLET_BUSY_RETRY_DELAY_MS = 3_000;

async function submitWithBusyRetry(
  args: Parameters<typeof submitDepositWalletBatch>[0],
): Promise<{ relayerTransactionHash: Hex }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= WALLET_BUSY_RETRY_ATTEMPTS; attempt++) {
    try {
      return await submitDepositWalletBatch(args);
    } catch (error) {
      lastError = error;

      const message =
        (error instanceof Error ? error.message : String(error)) ?? '';
      const isWalletBusy =
        message.toLowerCase().includes('wallet busy') ||
        message.toLowerCase().includes('active action');

      log('submitWithBusyRetry caught error', {
        attempt,
        isWalletBusy,
        errorName: (error as Error)?.name,
        message,
      });

      if (!isWalletBusy || attempt === WALLET_BUSY_RETRY_ATTEMPTS) {
        throw error;
      }

      log('Wallet busy, retrying', { attempt, delayMs: WALLET_BUSY_RETRY_DELAY_MS });
      await new Promise((resolve) =>
        setTimeout(resolve, WALLET_BUSY_RETRY_DELAY_MS),
      );
    }
  }

  throw lastError;
}

function encodeWrapCalldata({
  asset,
  recipient,
  amount,
}: {
  asset: Hex;
  recipient: Hex;
  amount: bigint;
}): Hex {
  const selector = '62355638';
  const paddedAsset = asset.slice(2).toLowerCase().padStart(64, '0');
  const paddedRecipient = recipient.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = amount.toString(16).padStart(64, '0');
  return `0x${selector}${paddedAsset}${paddedRecipient}${paddedAmount}` as Hex;
}
