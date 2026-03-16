import { Interface } from '@ethersproject/abi';
import { successfulFetch, toHex } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getAcrossOrderedTransactions } from './transactions';
import type {
  AcrossAction,
  AcrossActionRequestBody,
  AcrossGasLimits,
  AcrossQuote,
  AcrossSwapApprovalResponse,
} from './types';
import { TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  Amount,
  FiatRates,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFiatValueFromUsd, sumAmounts } from '../../utils/amounts';
import { getPayStrategiesConfig, getSlippage } from '../../utils/feature-flags';
import { calculateGasCost } from '../../utils/gas';
import { estimateQuoteGasLimits } from '../../utils/quote-gas';
import { getTokenFiatRate } from '../../utils/token';
import { TOKEN_TRANSFER_FOUR_BYTE } from '../relay/constants';

const log = createModuleLogger(projectLogger, 'across-strategy');

const TOKEN_TRANSFER_SIGNATURE = 'function transfer(address to, uint256 value)';
const CREATE_PROXY_SIGNATURE =
  'function createProxy(address paymentToken, uint256 payment, address payable paymentReceiver, (uint8 v, bytes32 r, bytes32 s) createSig)';
const SAFE_EXEC_TRANSACTION_SIGNATURE =
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)';

const TOKEN_TRANSFER_INTERFACE = new Interface([TOKEN_TRANSFER_SIGNATURE]);
const CREATE_PROXY_INTERFACE = new Interface([CREATE_PROXY_SIGNATURE]);
const SAFE_EXEC_TRANSACTION_INTERFACE = new Interface([
  SAFE_EXEC_TRANSACTION_SIGNATURE,
]);

const UNSUPPORTED_AUTHORIZATION_LIST_ERROR =
  'Across does not support type-4/EIP-7702 authorization lists yet';
const UNSUPPORTED_DESTINATION_ERROR =
  'Across only supports transfer-style destination flows at the moment';

type AcrossQuoteWithoutMetaMask = Omit<AcrossQuote, 'metamask'>;

type AcrossDestination = {
  actions: AcrossAction[];
  recipient: Hex;
};

type AcrossDestinationCall = {
  data: Hex;
  target?: Hex;
};

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
  const slippageDecimal = getSlippage(
    messenger,
    sourceChainId,
    sourceTokenAddress,
  );

  const amount = isMaxAmount ? sourceTokenAmount : targetAmountMinimum;
  const tradeType = isMaxAmount ? 'exactInput' : 'exactOutput';
  const destination = getAcrossDestination(transaction, request);
  const quote = await requestAcrossApproval({
    actions: destination.actions,
    amount,
    apiBase: config.across.apiBase,
    depositor: from,
    destinationChainId: targetChainId,
    inputToken: sourceTokenAddress,
    originChainId: sourceChainId,
    outputToken: targetTokenAddress,
    recipient: destination.recipient,
    slippage: slippageDecimal,
    tradeType,
  });

  const originalQuote: AcrossQuoteWithoutMetaMask = {
    quote,
    request: {
      amount,
      tradeType,
    },
  };

  return await normalizeQuote(originalQuote, request, fullRequest);
}

type AcrossApprovalRequest = {
  actions: AcrossAction[];
  amount: string;
  apiBase: string;
  depositor: Hex;
  destinationChainId: Hex;
  inputToken: Hex;
  originChainId: Hex;
  outputToken: Hex;
  recipient: Hex;
  slippage?: number;
  tradeType: 'exactInput' | 'exactOutput';
};

async function requestAcrossApproval(
  request: AcrossApprovalRequest,
): Promise<AcrossSwapApprovalResponse> {
  const {
    actions,
    amount,
    apiBase,
    depositor,
    destinationChainId,
    inputToken,
    originChainId,
    outputToken,
    recipient,
    slippage,
    tradeType,
  } = request;

  const params = new URLSearchParams();
  params.set('tradeType', tradeType);
  params.set('amount', amount);
  params.set('inputToken', inputToken);
  params.set('outputToken', outputToken);
  params.set('originChainId', String(parseInt(originChainId, 16)));
  params.set('destinationChainId', String(parseInt(destinationChainId, 16)));
  params.set('depositor', depositor);
  params.set('recipient', recipient);

  if (slippage !== undefined) {
    params.set('slippage', String(slippage));
  }

  const body: AcrossActionRequestBody = { actions };
  const url = `${apiBase}/swap/approval?${params.toString()}`;
  const options: RequestInit = {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  };
  const response = await successfulFetch(url, options);

  return (await response.json()) as AcrossSwapApprovalResponse;
}

function getAcrossDestination(
  transaction: TransactionMeta,
  request: QuoteRequest,
): AcrossDestination {
  const { from } = request;
  const destinationCalls = getDestinationCalls(transaction);
  const transferCall = destinationCalls.find((call) =>
    isTransferCall(call.data),
  );

  if (transaction.type === TransactionType.predictDeposit) {
    if (destinationCalls.length === 0) {
      return {
        actions: [],
        recipient: from,
      };
    }

    if (destinationCalls.length === 1 && transferCall) {
      return {
        actions: [],
        recipient: getTransferRecipient(transferCall.data),
      };
    }

    return {
      actions: destinationCalls.map((call) =>
        buildAcrossActionFromCall(call, request),
      ),
      recipient: from,
    };
  }

  if (transferCall) {
    return {
      actions: [],
      recipient: getTransferRecipient(transferCall.data),
    };
  }

  if (destinationCalls.length === 0) {
    return {
      actions: [],
      recipient: from,
    };
  }

  throw new Error(UNSUPPORTED_DESTINATION_ERROR);
}

function buildAcrossActionFromCall(
  call: AcrossDestinationCall,
  request: QuoteRequest,
): AcrossAction {
  if (isTransferCall(call.data)) {
    return buildAcrossTransferAction(call, request);
  }

  if (isCreateProxyCall(call.data)) {
    return buildCreateProxyAction(call);
  }

  if (isSafeExecTransactionCall(call.data)) {
    return buildSafeExecTransactionAction(call);
  }

  throw new Error(UNSUPPORTED_DESTINATION_ERROR);
}

function buildAcrossTransferAction(
  call: AcrossDestinationCall,
  request: QuoteRequest,
): AcrossAction {
  return {
    args: [
      {
        populateDynamically: false,
        value: getTransferRecipient(call.data),
      },
      {
        balanceSourceToken: request.targetTokenAddress,
        populateDynamically: true,
        value: '0',
      },
    ],
    functionSignature: TOKEN_TRANSFER_SIGNATURE,
    isNativeTransfer: false,
    target: call.target ?? request.targetTokenAddress,
    value: '0',
  };
}

function buildCreateProxyAction(call: AcrossDestinationCall): AcrossAction {
  if (!call.target) {
    throw new Error(UNSUPPORTED_DESTINATION_ERROR);
  }

  const [paymentToken, payment, paymentReceiver, createSig] =
    CREATE_PROXY_INTERFACE.decodeFunctionData('createProxy', call.data) as [
      Hex,
      BigNumber,
      Hex,
      { r: Hex; s: Hex; v: number },
    ];

  return {
    args: [
      {
        populateDynamically: false,
        value: normalizeHexString(paymentToken),
      },
      {
        populateDynamically: false,
        value: payment.toString(),
      },
      {
        populateDynamically: false,
        value: normalizeHexString(paymentReceiver),
      },
      {
        populateDynamically: false,
        value: [
          String(createSig.v),
          normalizeHexString(createSig.r),
          normalizeHexString(createSig.s),
        ],
      },
    ],
    functionSignature: CREATE_PROXY_SIGNATURE,
    isNativeTransfer: false,
    target: call.target,
    value: '0',
  };
}

function buildSafeExecTransactionAction(
  call: AcrossDestinationCall,
): AcrossAction {
  if (!call.target) {
    throw new Error(UNSUPPORTED_DESTINATION_ERROR);
  }

  const [
    to,
    value,
    data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
    signatures,
  ] = SAFE_EXEC_TRANSACTION_INTERFACE.decodeFunctionData(
    'execTransaction',
    call.data,
  ) as [
    Hex,
    BigNumber,
    Hex,
    number,
    BigNumber,
    BigNumber,
    BigNumber,
    Hex,
    Hex,
    Hex,
  ];

  return {
    args: [
      {
        populateDynamically: false,
        value: normalizeHexString(to),
      },
      {
        populateDynamically: false,
        value: value.toString(),
      },
      {
        populateDynamically: false,
        value: normalizeHexString(data),
      },
      {
        populateDynamically: false,
        value: String(operation),
      },
      {
        populateDynamically: false,
        value: safeTxGas.toString(),
      },
      {
        populateDynamically: false,
        value: baseGas.toString(),
      },
      {
        populateDynamically: false,
        value: gasPrice.toString(),
      },
      {
        populateDynamically: false,
        value: normalizeHexString(gasToken),
      },
      {
        populateDynamically: false,
        value: normalizeHexString(refundReceiver),
      },
      {
        populateDynamically: false,
        value: normalizeHexString(signatures),
      },
    ],
    functionSignature: SAFE_EXEC_TRANSACTION_SIGNATURE,
    isNativeTransfer: false,
    target: call.target,
    value: '0',
  };
}

function getDestinationCalls(
  transaction: TransactionMeta,
): AcrossDestinationCall[] {
  const nestedCalls = (
    transaction.nestedTransactions ?? []
  ).flatMap<AcrossDestinationCall>((nestedTx: { data?: Hex; to?: Hex }) =>
    nestedTx.data !== undefined && nestedTx.data !== '0x'
      ? [{ data: nestedTx.data, target: nestedTx.to }]
      : [],
  );

  if (nestedCalls.length > 0) {
    return nestedCalls;
  }

  const data = transaction.txParams?.data as Hex | undefined;

  if (data === undefined || data === '0x') {
    return [];
  }

  return [
    {
      data,
      target: transaction.txParams?.to as Hex | undefined,
    },
  ];
}

function isTransferCall(data: Hex): boolean {
  return data.startsWith(TOKEN_TRANSFER_FOUR_BYTE);
}

function isCreateProxyCall(data: Hex): boolean {
  return data.startsWith(CREATE_PROXY_INTERFACE.getSighash('createProxy'));
}

function isSafeExecTransactionCall(data: Hex): boolean {
  return data.startsWith(
    SAFE_EXEC_TRANSACTION_INTERFACE.getSighash('execTransaction'),
  );
}

function getTransferRecipient(data: Hex): Hex {
  return TOKEN_TRANSFER_INTERFACE.decodeFunctionData(
    'transfer',
    data,
  ).to.toLowerCase() as Hex;
}

function normalizeHexString(value: string): string {
  return value.toLowerCase();
}

async function normalizeQuote(
  original: AcrossQuoteWithoutMetaMask,
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

  const { gasLimits, is7702, sourceNetwork } = await calculateSourceNetworkCost(
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
  const metaMaskFee = getFiatValueFromUsd(
    new BigNumber(quote.fees?.app?.amountUsd ?? '0').abs(),
    usdToFiatRate,
  );

  const targetAmount = getAmountFromTokenAmount({
    amountRaw: outputAmountRaw,
    decimals: quote.outputToken.decimals,
    fiatRate: targetFiatRate,
  });

  const metamask = {
    gasLimits,
    is7702,
  };

  return {
    dust,
    estimatedDuration: quote.expectedFillTime ?? 0,
    fees: {
      metaMask: metaMaskFee,
      provider,
      sourceNetwork,
      targetNetwork,
    },
    original: {
      ...original,
      metamask,
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
  is7702: boolean;
}> {
  const acrossFallbackGas =
    getPayStrategiesConfig(messenger).across.fallbackGas;
  const { from } = request;
  const orderedTransactions = getAcrossOrderedTransactions({ quote });
  const { swapTx } = quote;
  const swapChainId = toHex(swapTx.chainId);
  const gasEstimates = await estimateQuoteGasLimits({
    fallbackGas: acrossFallbackGas,
    messenger,
    transactions: orderedTransactions.map((transaction) => ({
      chainId: toHex(transaction.chainId),
      data: transaction.data,
      from,
      gas: transaction.gas,
      to: transaction.to,
      value: transaction.value ?? '0x0',
    })),
  });
  const { batchGasLimit, is7702 } = gasEstimates;

  if (is7702) {
    if (!batchGasLimit) {
      throw new Error('Across combined batch gas estimate missing');
    }

    const estimate = calculateGasCost({
      chainId: swapChainId,
      gas: batchGasLimit.estimate,
      maxFeePerGas: swapTx.maxFeePerGas,
      maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
      messenger,
    });
    const max = calculateGasCost({
      chainId: swapChainId,
      gas: batchGasLimit.max,
      isMax: true,
      maxFeePerGas: swapTx.maxFeePerGas,
      maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
      messenger,
    });

    return {
      sourceNetwork: {
        estimate,
        max,
      },
      is7702: true,
      gasLimits: [
        {
          estimate: batchGasLimit.estimate,
          max: batchGasLimit.max,
        },
      ],
    };
  }

  const transactionGasLimits = orderedTransactions.map(
    (transaction, index) => ({
      gasEstimate: gasEstimates.gasLimits[index],
      transaction,
    }),
  );

  const estimate = sumAmounts(
    transactionGasLimits.map(({ gasEstimate, transaction }) =>
      calculateGasCost({
        chainId: toHex(transaction.chainId),
        gas: gasEstimate.estimate,
        maxFeePerGas: transaction.maxFeePerGas,
        maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
        messenger,
      }),
    ),
  );

  const max = sumAmounts(
    transactionGasLimits.map(({ gasEstimate, transaction }) =>
      calculateGasCost({
        chainId: toHex(transaction.chainId),
        gas: gasEstimate.max,
        isMax: true,
        maxFeePerGas: transaction.maxFeePerGas,
        maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
        messenger,
      }),
    ),
  );

  return {
    sourceNetwork: {
      estimate,
      max,
    },
    is7702: false,
    gasLimits: transactionGasLimits.map(({ gasEstimate }) => ({
      estimate: gasEstimate.estimate,
      max: gasEstimate.max,
    })),
  };
}
