import { Interface } from '@ethersproject/abi';
import { successfulFetch, toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  AcrossGasLimits,
  AcrossQuote,
  AcrossSwapApprovalResponse,
} from './types';
import { NATIVE_TOKEN_ADDRESS, TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  Amount,
  FiatRates,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayAction,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFiatValueFromUsd, sumAmounts } from '../../utils/amounts';
import {
  getFeatureFlags,
  getSlippage,
  getPayStrategiesConfig,
} from '../../utils/feature-flags';
import {
  calculateGasCost,
  estimateGasLimitWithBufferOrFallback,
} from '../../utils/gas';
import { getTokenFiatRate } from '../../utils/token';
import { TOKEN_TRANSFER_FOUR_BYTE } from '../relay/constants';

const log = createModuleLogger(projectLogger, 'across-strategy');

const TOKEN_TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);

const UNSUPPORTED_AUTHORIZATION_LIST_ERROR =
  'Across does not support type-4/EIP-7702 authorization lists yet';
const UNSUPPORTED_DESTINATION_ERROR =
  'Across only supports transfer-style destination flows at the moment';

type AcrossQuoteWithoutGasLimits = Omit<AcrossQuote, 'gasLimits'>;

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
      (singleRequest) =>
        singleRequest.isMaxAmount === true ||
        (singleRequest.targetAmountMinimum !== undefined &&
          singleRequest.targetAmountMinimum !== '0'),
    );

    if (normalizedRequests.length === 0) {
      return [];
    }

    if (request.transaction.txParams?.authorizationList?.length) {
      throw new Error(UNSUPPORTED_AUTHORIZATION_LIST_ERROR);
    }

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
  const featureFlags = getFeatureFlags(messenger);
  const slippageDecimal = getSlippage(
    messenger,
    sourceChainId,
    sourceTokenAddress,
  );

  const amount = isMaxAmount ? sourceTokenAmount : targetAmountMinimum;
  const tradeType = isMaxAmount ? 'exactInput' : 'exactOutput';
  const { actions, recipient } = await getAcrossRequestContext(
    transaction,
    request,
    messenger,
    config.across.postActionsEnabled,
  );

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

  if (featureFlags.metaMaskFee) {
    params.set('appFee', featureFlags.metaMaskFee.fee);
    params.set('appFeeRecipient', featureFlags.metaMaskFee.recipient);
  }

  const response = await requestAcrossApproval(
    config.across.apiBase,
    params,
    actions,
  );

  const quote = (await response.json()) as AcrossSwapApprovalResponse;

  const originalQuote: AcrossQuoteWithoutGasLimits = {
    quote,
    request: {
      amount,
      tradeType,
    },
  };

  return await normalizeQuote(originalQuote, request, fullRequest);
}

type AcrossApprovalRequest = {
  url: string;
  options: RequestInit;
};

function buildAcrossApprovalRequest(
  apiBase: string,
  params: URLSearchParams,
  actions?: TransactionPayAction[],
): AcrossApprovalRequest {
  const normalizedActions = actions ?? [];

  return {
    url: `${apiBase}/swap/approval?${params.toString()}`,
    options: {
      body: JSON.stringify({ actions: normalizedActions }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  };
}

async function requestAcrossApproval(
  apiBase: string,
  params: URLSearchParams,
  actions?: TransactionPayAction[],
): Promise<Response> {
  const { url, options } = buildAcrossApprovalRequest(apiBase, params, actions);
  return successfulFetch(url, options);
}

async function getAcrossRequestContext(
  transaction: TransactionMeta,
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
  postActionsEnabled: boolean,
): Promise<{
  actions?: TransactionPayAction[];
  recipient: Hex;
}> {
  const { txParams } = transaction;
  const { from, isMaxAmount, targetAmountMinimum, targetTokenAddress } =
    request;
  const transferData = getTransferData(transaction);

  if (transferData) {
    return { recipient: getTransferRecipient(transferData) };
  }

  const data = txParams?.data as Hex | undefined;
  const hasNoData = data === undefined || data === '0x';
  const nestedCalldata = getNestedCalldata(transaction);

  if (hasNoData && nestedCalldata.length === 0) {
    return { recipient: from };
  }

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  if (delegation.authorizationList?.length) {
    throw new Error(UNSUPPORTED_AUTHORIZATION_LIST_ERROR);
  }

  if (!postActionsEnabled) {
    throw new Error(UNSUPPORTED_DESTINATION_ERROR);
  }

  if (isMaxAmount) {
    throw new Error('Max amount quotes do not support included transactions');
  }

  if (!delegation.action) {
    throw new Error(UNSUPPORTED_DESTINATION_ERROR);
  }

  const tokenTransferAction = buildTokenTransferAction({
    amountRaw: targetAmountMinimum,
    recipient: from,
    tokenAddress: targetTokenAddress,
  });

  return {
    actions: [tokenTransferAction, delegation.action],
    recipient: from,
  };
}

function getTransferData(transaction: TransactionMeta): Hex | undefined {
  const { nestedTransactions, txParams } = transaction;

  const nestedTransferData = nestedTransactions?.find(
    (nestedTx: { data?: Hex }) =>
      nestedTx.data?.startsWith(TOKEN_TRANSFER_FOUR_BYTE),
  )?.data;

  const data = txParams?.data as Hex | undefined;
  const tokenTransferData = data?.startsWith(TOKEN_TRANSFER_FOUR_BYTE)
    ? data
    : undefined;

  return nestedTransferData ?? tokenTransferData;
}

function getNestedCalldata(transaction: TransactionMeta): Hex[] {
  return (transaction.nestedTransactions ?? [])
    .map(({ data }) => data)
    .filter((data): data is Hex => data !== undefined && data !== '0x');
}

function buildTokenTransferAction({
  amountRaw,
  recipient,
  tokenAddress,
}: {
  amountRaw: string;
  recipient: Hex;
  tokenAddress: Hex;
}): TransactionPayAction {
  if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
    return {
      args: [],
      functionSignature: '',
      isNativeTransfer: true,
      populateCallValueDynamically: false,
      target: recipient,
      value: amountRaw,
    };
  }

  return {
    args: [
      {
        populateDynamically: false,
        value: recipient,
      },
      {
        populateDynamically: false,
        value: amountRaw,
      },
    ],
    functionSignature: 'function transfer(address to, uint256 amount)',
    isNativeTransfer: false,
    target: tokenAddress,
    value: '0',
  };
}

function getTransferRecipient(data: Hex): Hex {
  return TOKEN_TRANSFER_INTERFACE.decodeFunctionData(
    'transfer',
    data,
  ).to.toLowerCase() as Hex;
}

async function normalizeQuote(
  original: AcrossQuoteWithoutGasLimits,
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

  const { sourceNetwork, gasLimits } = await calculateSourceNetworkCost(
    quote,
    messenger,
    request,
  );

  const targetNetwork = getFiatValueFromUsd(new BigNumber(0), usdToFiatRate);

  const inputAmountRaw = quote.inputAmount ?? '0';
  const outputAmountRaw = new BigNumber(
    quote.expectedOutputAmount ??
      quote.minOutputAmount ??
      request.targetAmountMinimum ??
      '0',
  ).toString(10);

  const sourceAmount = getAmountFromTokenAmount({
    amountRaw: inputAmountRaw,
    decimals: quote.inputToken.decimals,
    fiatRate: sourceFiatRate,
  });

  const providerUsd = calculateProviderUsd(
    quote,
    inputAmountRaw,
    sourceFiatRate,
    targetFiatRate,
    quote.expectedOutputAmount,
  );
  const provider = getFiatValueFromUsd(providerUsd, usdToFiatRate);
  const metaMask = getFiatValueFromUsd(
    new BigNumber(quote.fees?.app?.amountUsd ?? '0').abs(),
    usdToFiatRate,
  );

  const targetAmount = getAmountFromTokenAmount({
    amountRaw: outputAmountRaw,
    decimals: quote.outputToken.decimals,
    fiatRate: targetFiatRate,
  });

  return {
    dust,
    estimatedDuration: quote.expectedFillTime ?? 0,
    fees: {
      metaMask,
      provider,
      sourceNetwork,
      targetNetwork,
    },
    original: {
      ...original,
      gasLimits,
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
  const expectedOutputRaw = quote.expectedOutputAmount;

  if (expectedOutputRaw === undefined) {
    return new BigNumber(0);
  }

  const expectedOutput = new BigNumber(expectedOutputRaw);
  const minimumOutput = new BigNumber(
    quote.minOutputAmount ?? request.targetAmountMinimum ?? '0',
  );

  const dustRaw = expectedOutput.minus(minimumOutput).isNegative()
    ? new BigNumber(0)
    : expectedOutput.minus(minimumOutput);
  const dustHuman = dustRaw.shiftedBy(-quote.outputToken.decimals);

  return dustHuman.multipliedBy(targetFiatRate.usdRate);
}

function calculateProviderUsd(
  quote: AcrossSwapApprovalResponse,
  inputAmountRaw: string,
  sourceFiatRate: FiatRates,
  targetFiatRate: FiatRates,
  expectedOutputRaw?: string,
): BigNumber {
  const totalFeeUsd = quote.fees?.total?.amountUsd;

  if (totalFeeUsd !== undefined) {
    return new BigNumber(totalFeeUsd).abs();
  }

  if (expectedOutputRaw === undefined) {
    return new BigNumber(0);
  }

  const expectedOutput = new BigNumber(expectedOutputRaw);

  if (expectedOutput.lte(0)) {
    return new BigNumber(0);
  }

  const inputAmountUsd = new BigNumber(inputAmountRaw)
    .shiftedBy(-quote.inputToken.decimals)
    .multipliedBy(sourceFiatRate.usdRate);
  const expectedOutputUsd = expectedOutput
    .shiftedBy(-quote.outputToken.decimals)
    .multipliedBy(targetFiatRate.usdRate);
  const providerFeeUsd = inputAmountUsd.minus(expectedOutputUsd);

  return providerFeeUsd.isNegative() ? new BigNumber(0) : providerFeeUsd;
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
): Promise<{
  sourceNetwork: TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork'];
  gasLimits: AcrossGasLimits;
}> {
  const { from } = request;
  const approvalTxns = quote.approvalTxns ?? [];
  const { swapTx } = quote;
  const swapChainId = toHex(swapTx.chainId);

  const approvalGasResults = await Promise.all(
    approvalTxns.map(async (approval) => {
      const chainId = toHex(approval.chainId);
      const gas = await estimateGasLimitWithBufferOrFallback({
        chainId,
        data: approval.data,
        from,
        messenger,
        to: approval.to,
        value: approval.value ?? '0x0',
      });

      if (gas.usedFallback) {
        log('Gas estimate failed, using fallback', {
          error: gas.error,
          transactionType: 'approval',
        });
      }

      return { chainId, gas };
    }),
  );

  const swapGas = await estimateGasLimitWithBufferOrFallback({
    chainId: swapChainId,
    data: swapTx.data,
    from,
    messenger,
    to: swapTx.to,
    value: swapTx.value ?? '0x0',
  });

  if (swapGas.usedFallback) {
    log('Gas estimate failed, using fallback', {
      error: swapGas.error,
      transactionType: 'swap',
    });
  }

  const estimate = sumAmounts([
    ...approvalGasResults.map(({ chainId, gas }) =>
      calculateGasCost({
        chainId,
        gas: gas.estimate,
        messenger,
      }),
    ),
    calculateGasCost({
      chainId: swapChainId,
      gas: swapGas.estimate,
      maxFeePerGas: swapTx.maxFeePerGas,
      maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
      messenger,
    }),
  ]);

  const max = sumAmounts([
    ...approvalGasResults.map(({ chainId, gas }) =>
      calculateGasCost({
        chainId,
        gas: gas.max,
        isMax: true,
        messenger,
      }),
    ),
    calculateGasCost({
      chainId: swapChainId,
      gas: swapGas.max,
      isMax: true,
      maxFeePerGas: swapTx.maxFeePerGas,
      maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
      messenger,
    }),
  ]);

  return {
    sourceNetwork: {
      estimate,
      max,
    },
    gasLimits: {
      approval: approvalGasResults.map(({ gas }) => ({
        estimate: gas.estimate,
        max: gas.max,
      })),
      swap: {
        estimate: swapGas.estimate,
        max: swapGas.max,
      },
    },
  };
}
