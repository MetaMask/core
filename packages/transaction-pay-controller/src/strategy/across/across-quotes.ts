import { Interface } from '@ethersproject/abi';
import { successfulFetch, toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  AcrossAction,
  AcrossActionRequestBody,
  AcrossQuote,
  AcrossSwapApprovalResponse,
} from './types';
import { NATIVE_TOKEN_ADDRESS, TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  Amount,
  FiatRates,
  FiatValue,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getSlippage, getPayStrategiesConfig } from '../../utils/feature-flags';
import {
  calculateGasCost,
  estimateGasWithBufferOrFallback,
} from '../../utils/gas';
import { getTokenFiatRate } from '../../utils/token';
import { TOKEN_TRANSFER_FOUR_BYTE } from '../relay/constants';

const log = createModuleLogger(projectLogger, 'across-strategy');

const TOKEN_TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);

/**
 * Fetch Across quotes.
 *
 * @param request - Request object.
 * @returns Array of quotes.
 */
export async function getAcrossQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>[]> {
  const { requests } = request;

  log('Fetching quotes', requests);

  try {
    const normalizedRequests = requests.filter(
      (singleRequest) => singleRequest.targetAmountMinimum !== '0',
    );

    return await Promise.all(
      normalizedRequests.map((singleRequest) =>
        getSingleQuote(singleRequest, request),
      ),
    );
  } catch (error) {
    log('Error fetching quotes', { error });
    throw new Error(`Failed to fetch Across quotes: ${String(error)}`);
  }
}

async function getSingleQuote(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>> {
  const start = Date.now();
  const { messenger, transaction } = fullRequest;
  const {
    from,
    isMaxAmount,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetAmountMinimum,
    targetChainId,
    targetTokenAddress,
  } = request;

  const config = getPayStrategiesConfig(messenger);
  const slippageDecimal = getSlippage(
    messenger,
    sourceChainId,
    sourceTokenAddress,
  );

  const amount = isMaxAmount ? sourceTokenAmount : targetAmountMinimum;
  const tradeType = isMaxAmount ? 'exactInput' : 'exactOutput';

  const { actions, recipient } = await buildAcrossActions(
    transaction,
    request,
    messenger,
  );

  if (actions?.length && isMaxAmount) {
    throw new Error('Max amount quotes do not support included transactions');
  }

  const params = new URLSearchParams();
  params.set('tradeType', tradeType);
  params.set('amount', amount);
  params.set('inputToken', sourceTokenAddress);
  params.set('outputToken', targetTokenAddress);
  params.set('originChainId', String(parseInt(sourceChainId, 16)));
  params.set('destinationChainId', String(parseInt(targetChainId, 16)));
  params.set('depositor', from);
  params.set('recipient', recipient);

  if (slippageDecimal !== undefined) {
    params.set('slippage', String(slippageDecimal));
  }

  if (config.across.integratorId) {
    params.set('integratorId', config.across.integratorId);
  }

  if (config.across.appFee) {
    params.set('appFee', config.across.appFee);
    if (config.across.appFeeRecipient) {
      params.set('appFeeRecipient', config.across.appFeeRecipient);
    }
  }

  const url = `${config.across.apiBase}/swap/approval?${params.toString()}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (config.across.apiKey) {
    const header = config.across.apiKeyHeader ?? 'Authorization';
    const value = config.across.apiKeyPrefix
      ? `${config.across.apiKeyPrefix} ${config.across.apiKey}`
      : config.across.apiKey;
    headers[header] = value;
  }

  const hasActions = Boolean(actions?.length);

  const response = await successfulFetch(url, {
    method: hasActions ? 'POST' : 'GET',
    headers: {
      ...headers,
      ...(hasActions ? { 'Content-Type': 'application/json' } : undefined),
    },
    ...(hasActions
      ? { body: JSON.stringify({ actions } as AcrossActionRequestBody) }
      : undefined),
  });

  const quote = (await response.json()) as AcrossSwapApprovalResponse;

  const originalQuote: AcrossQuote = {
    quote,
    request: {
      amount,
      tradeType,
    },
  };

  const normalized = await normalizeQuote(originalQuote, request, fullRequest);
  normalized.original.metrics = {
    latency: Date.now() - start,
  };

  return normalized;
}

async function buildAcrossActions(
  transaction: TransactionMeta,
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<{ actions?: AcrossAction[]; recipient: Hex }> {
  const { nestedTransactions, txParams } = transaction;
  const { targetTokenAddress, targetAmountMinimum, from } = request;

  const data = txParams?.data as Hex | undefined;
  const singleData =
    nestedTransactions?.length === 1 ? nestedTransactions[0].data : data;

  const isTokenTransfer = Boolean(
    singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE),
  );

  const tokenTransferData = nestedTransactions?.find((nestedTx) =>
    nestedTx.data?.startsWith(TOKEN_TRANSFER_FOUR_BYTE),
  )?.data;

  let recipient = from;

  if (isTokenTransfer && singleData) {
    recipient = getTransferRecipient(singleData);
  }

  if (tokenTransferData) {
    recipient = getTransferRecipient(tokenTransferData);
  }

  const hasNoData = singleData === undefined || singleData === '0x';

  if (hasNoData || isTokenTransfer) {
    return { recipient };
  }

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  if (delegation.authorizationList?.length) {
    // TODO: Enable type-4/EIP-7702 authorization lists when Across supports first-time Polymarket deposits.
    throw new Error(
      'Across does not support type-4/EIP-7702 authorization lists yet',
    );
  }

  const tokenTransferAction = buildTokenTransferAction({
    amountRaw: targetAmountMinimum,
    recipient: from,
    tokenAddress: targetTokenAddress,
  });

  if (!delegation.action) {
    throw new Error('Delegation action missing from client callback');
  }

  return {
    actions: [tokenTransferAction, delegation.action],
    recipient,
  };
}

function buildTokenTransferAction({
  amountRaw,
  recipient,
  tokenAddress,
}: {
  amountRaw: string;
  recipient: Hex;
  tokenAddress: Hex;
}): AcrossAction {
  if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
    return {
      target: recipient,
      functionSignature: '',
      args: [],
      value: amountRaw,
      isNativeTransfer: true,
      populateCallValueDynamically: false,
    };
  }

  return {
    target: tokenAddress,
    functionSignature: 'function transfer(address to, uint256 amount)',
    args: [
      {
        value: recipient,
        populateDynamically: false,
      },
      {
        value: amountRaw,
        populateDynamically: false,
      },
    ],
    value: '0',
    isNativeTransfer: false,
  };
}

function getTransferRecipient(data: Hex): Hex {
  return TOKEN_TRANSFER_INTERFACE.decodeFunctionData(
    'transfer',
    data,
  ).to.toLowerCase() as Hex;
}

async function normalizeQuote(
  original: AcrossQuote,
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>> {
  const { messenger } = fullRequest;
  const { quote } = original;

  const { usdToFiatRate, sourceFiatRate, targetFiatRate } = getFiatRates(
    messenger,
    quote,
  );

  const dustUsd = calculateDustUsd(quote, request, targetFiatRate);
  const dust = getFiatValueFromUsd(dustUsd, usdToFiatRate);

  const sourceNetwork = await calculateSourceNetworkCost(
    quote,
    messenger,
    request,
  );

  const targetNetworkUsd = new BigNumber(
    quote.fees?.destinationGas?.amountUsd ?? '0',
  );

  const targetNetwork = getFiatValueFromUsd(targetNetworkUsd, usdToFiatRate);

  const inputAmountRaw = quote.inputAmount ?? '0';
  const expectedOutputRaw = new BigNumber(
    quote.expectedOutputAmount ??
      quote.minOutputAmount ??
      request.targetAmountMinimum ??
      '0',
  );
  const minOutputRaw = new BigNumber(
    quote.minOutputAmount ?? request.targetAmountMinimum ?? '0',
  );
  const outputAmountRaw = expectedOutputRaw.toString(10);

  const sourceAmount = getAmountFromTokenAmount({
    amountRaw: inputAmountRaw,
    decimals: quote.inputToken.decimals,
    fiatRate: sourceFiatRate,
  });

  const expectedOutputUsd = expectedOutputRaw.gt(0)
    ? expectedOutputRaw
        .shiftedBy(-quote.outputToken.decimals)
        .multipliedBy(targetFiatRate.usdRate)
    : new BigNumber(0);

  const impactUsd = calculateImpactUsd(
    quote,
    expectedOutputRaw,
    minOutputRaw,
    targetFiatRate,
  );

  let impact: ReturnType<typeof getFiatValueFromUsd> | undefined;

  if (impactUsd !== undefined) {
    impact = getFiatValueFromUsd(impactUsd, usdToFiatRate);
  }

  let impactRatio: string | undefined;

  if (impactUsd !== undefined && expectedOutputUsd.gt(0)) {
    impactRatio = impactUsd.dividedBy(expectedOutputUsd).toString(10);
  }

  const providerUsd = impactUsd ?? new BigNumber(0);
  const provider = getFiatValueFromUsd(providerUsd, usdToFiatRate);

  const targetAmount = getAmountFromTokenAmount({
    amountRaw: outputAmountRaw,
    decimals: quote.outputToken.decimals,
    fiatRate: targetFiatRate,
  });

  return {
    dust,
    estimatedDuration: quote.expectedFillTime ?? 0,
    fees: {
      impact,
      impactRatio,
      provider,
      sourceNetwork,
      targetNetwork,
    },
    original: {
      ...original,
    },
    request,
    sourceAmount,
    targetAmount,
    strategy: TransactionPayStrategy.Across,
  } as TransactionPayQuote<AcrossQuote>;
}

function getFiatRates(
  messenger: TransactionPayControllerMessenger,
  quote: AcrossSwapApprovalResponse,
): {
  sourceFiatRate: FiatRates;
  targetFiatRate: FiatRates;
  usdToFiatRate: BigNumber;
} {
  const sourceFiatRate = getTokenFiatRate(
    messenger,
    quote.inputToken.address,
    toHex(quote.inputToken.chainId),
  );

  if (!sourceFiatRate) {
    throw new Error('Source token fiat rate not found');
  }

  const targetFiatRate =
    getTokenFiatRate(
      messenger,
      quote.outputToken.address,
      toHex(quote.outputToken.chainId),
    ) ?? sourceFiatRate;

  const usdToFiatRate = new BigNumber(sourceFiatRate.fiatRate).dividedBy(
    sourceFiatRate.usdRate,
  );

  return { sourceFiatRate, targetFiatRate, usdToFiatRate };
}

function calculateDustUsd(
  quote: AcrossSwapApprovalResponse,
  request: QuoteRequest,
  targetFiatRate: FiatRates,
): BigNumber {
  const expectedOutput = new BigNumber(quote.expectedOutputAmount ?? '0');
  const minimumOutput = new BigNumber(
    quote.minOutputAmount ?? request.targetAmountMinimum,
  );

  const dustRaw = expectedOutput.minus(minimumOutput);
  const dustHuman = dustRaw.shiftedBy(-quote.outputToken.decimals);

  return dustHuman.multipliedBy(targetFiatRate.usdRate);
}

function calculateImpactUsd(
  quote: AcrossSwapApprovalResponse,
  expectedOutputRaw: BigNumber,
  minOutputRaw: BigNumber,
  targetFiatRate: FiatRates,
): BigNumber | undefined {
  const swapImpactUsd = quote.fees?.swapImpact?.amountUsd;

  if (swapImpactUsd !== undefined) {
    return new BigNumber(swapImpactUsd).abs();
  }

  if (expectedOutputRaw.lte(0)) {
    return undefined;
  }

  const rawImpact = expectedOutputRaw.minus(minOutputRaw);
  const normalizedRawImpact = rawImpact.isNegative()
    ? new BigNumber(0)
    : rawImpact;

  const impactHuman = normalizedRawImpact.shiftedBy(
    -quote.outputToken.decimals,
  );

  return impactHuman.multipliedBy(targetFiatRate.usdRate);
}

function getFiatValueFromUsd(
  usdValue: BigNumber,
  usdToFiatRate: BigNumber,
): FiatValue {
  const fiatValue = usdValue.multipliedBy(usdToFiatRate);

  return {
    usd: usdValue.toString(10),
    fiat: fiatValue.toString(10),
  };
}

function getAmountFromTokenAmount({
  amountRaw,
  decimals,
  fiatRate,
}: {
  amountRaw: string;
  decimals: number;
  fiatRate: FiatRates;
}): Amount {
  const rawValue = new BigNumber(amountRaw);
  const raw = rawValue.toString(10);

  const humanValue = rawValue.shiftedBy(-decimals);
  const human = humanValue.toString(10);

  const usd = humanValue.multipliedBy(fiatRate.usdRate).toString(10);
  const fiat = humanValue.multipliedBy(fiatRate.fiatRate).toString(10);

  return {
    fiat,
    human,
    raw,
    usd,
  };
}

async function calculateSourceNetworkCost(
  quote: AcrossSwapApprovalResponse,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): Promise<TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork']> {
  const { from } = request;
  const { swapTx } = quote;
  const chainId = toHex(swapTx.chainId);

  const gasResult = await estimateGasWithBufferOrFallback({
    chainId,
    data: swapTx.data,
    from,
    messenger,
    to: swapTx.to,
    value: swapTx.value ?? '0x0',
  });

  if (gasResult.usedFallback) {
    log('Gas estimate failed, using fallback', { error: gasResult.error });
  }

  const gasLimit = gasResult.estimate;

  const estimate = calculateGasCost({
    chainId,
    gas: gasLimit,
    maxFeePerGas: swapTx.maxFeePerGas,
    maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
    messenger,
  });

  const max = calculateGasCost({
    chainId,
    gas: gasLimit,
    isMax: true,
    messenger,
  });

  return {
    estimate,
    max,
  };
}
