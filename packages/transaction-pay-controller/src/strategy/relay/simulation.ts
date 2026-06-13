import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../../constants';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayQuoteValidationError,
} from '../../types';
import { isChainExcludedFromInfura } from '../../utils/feature-flags';
import { rpcRequest } from '../../utils/provider';
import {
  SentinelSimulationError,
  SentinelSimulationResponse,
  SentinelSimulationResponseTransaction,
  SentinelSimulationTransaction,
  simulateTransactions,
} from '../../utils/sentinel';
import {
  getLiveTokenBalance,
  getNativeToken,
  normalizeTokenAddress,
  TokenAddressTarget,
} from '../../utils/token';
import {
  buildRelayExecuteRequest,
  buildRelaySubmitParams,
} from './relay-submit';
import type { RelayExecuteRequest, RelayQuote } from './types';

const DELEGATION_PREFIX = '0xef0100';
const ERC7579_CALL_TYPE_BATCH = '01';
const ERC7579_EXEC_TYPE_DEFAULT = '00';
const ERROR_STRING_SELECTOR = '0x08c379a0';
const CALLS_SIGNATURE = '(address,uint256,bytes)[]';
const LATEST_BLOCK = 'latest';
const PANIC_SELECTOR = '0x4e487b71';
const QUOTE_SIMULATION_FAILED_PREFIX = /^Quote simulation failed\s*[-:]\s*/iu;
const RPC_FALLBACK_UNSUPPORTED_REGEX =
  /(does not exist|invalid argument|invalid params|method .*not|not supported|too many arguments|unsupported)/iu;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex;

const erc20Interface = new Interface(abiERC20);
const erc7821Interface = new Interface([
  'function execute(bytes32 mode, bytes executionData)',
]);

type ValidateRelayQuoteRequest = {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  signal?: AbortSignal;
  transaction: TransactionMeta;
};

type RelaySimulationRequest = {
  overrides?: Record<Hex, { code: Hex }>;
  transactions: SentinelSimulationTransaction[];
};

type RpcCallTransaction = {
  data?: Hex;
  from: Hex;
  gas?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  to?: Hex;
  value?: Hex;
};

type RpcCallTrace = {
  calls?: RpcCallTrace[] | null;
  error?: string;
  output?: Hex;
  revertReason?: string;
};

type RpcFallbackSimulationResult = {
  error?: string;
  isSupported: boolean;
};

export class RelayQuoteValidationError extends Error {
  readonly validationError: TransactionPayQuoteValidationError;

  constructor(validationError: TransactionPayQuoteValidationError) {
    super(validationError.message);
    this.name = 'RelayQuoteValidationError';
    this.validationError = validationError;
  }
}

export async function validateRelayQuote({
  messenger,
  quote,
  signal,
  transaction,
}: ValidateRelayQuoteRequest): Promise<void> {
  if (shouldSkipValidation(quote)) {
    return;
  }

  throwIfAborted(signal);

  const liveBalance = await getLiveSourceBalance(quote, messenger);

  throwIfAborted(signal);

  validateRequiredSourceAmount(quote, liveBalance);

  const simulationRequest = await buildRelaySimulationRequest({
    messenger,
    quote,
    transaction,
  });

  validateDecodedSourceTransfers(
    quote,
    liveBalance,
    simulationRequest.transactions,
  );

  throwIfAborted(signal);

  const response = await simulateRelayQuote({
    messenger,
    quote,
    request: simulationRequest,
  });

  throwIfAborted(signal);

  await validateSimulationResponse({
    messenger,
    quote,
    request: simulationRequest,
    responseTransactions: response.transactions,
  });
}

export function isRelayQuoteValidationError(
  error: unknown,
): error is RelayQuoteValidationError {
  return error instanceof RelayQuoteValidationError;
}

function shouldSkipValidation(quote: TransactionPayQuote<RelayQuote>): boolean {
  const { request } = quote;

  return Boolean(
    request.isHyperliquidSource ?? request.isPolymarketDepositWallet ?? false,
  );
}

async function getLiveSourceBalance(
  quote: TransactionPayQuote<RelayQuote>,
  messenger: TransactionPayControllerMessenger,
): Promise<string> {
  const { from, sourceChainId, sourceTokenAddress } = quote.request;
  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  try {
    return await getLiveTokenBalance(
      messenger,
      from,
      sourceChainId,
      normalizedSourceTokenAddress,
    );
  } catch (error) {
    throw new RelayQuoteValidationError({
      chainId: sourceChainId,
      code: 'source_balance_unavailable',
      message: `Cannot validate payment token balance - ${
        (error as Error).message
      }`,
      strategy: TransactionPayStrategy.Relay,
      tokenAddress: normalizedSourceTokenAddress,
    });
  }
}

function validateRequiredSourceAmount(
  quote: TransactionPayQuote<RelayQuote>,
  liveBalance: string,
): void {
  if (quote.request.isPostQuote || quote.request.paymentOverride) {
    return;
  }

  const requiredAmount = new BigNumber(quote.sourceAmount.raw);
  const balance = new BigNumber(liveBalance);

  if (balance.isGreaterThanOrEqualTo(requiredAmount)) {
    return;
  }

  throwInsufficientBalanceError(
    quote,
    liveBalance,
    requiredAmount.toString(10),
    'Insufficient quote source amount',
  );
}

function validateDecodedSourceTransfers(
  quote: TransactionPayQuote<RelayQuote>,
  liveBalance: string,
  transactions: SentinelSimulationTransaction[],
): void {
  const transferAmounts = getDecodedSourceTransferAmounts(quote, transactions);
  const balance = new BigNumber(liveBalance);

  for (const transferAmount of transferAmounts) {
    if (balance.isLessThan(transferAmount)) {
      throwInsufficientBalanceError(
        quote,
        liveBalance,
        transferAmount,
        'Insufficient balance for decoded quote amount',
      );
    }
  }
}

function getDecodedSourceTransferAmounts(
  quote: TransactionPayQuote<RelayQuote>,
  transactions: SentinelSimulationTransaction[],
): string[] {
  const { sourceChainId, sourceTokenAddress } = quote.request;
  const isNativeSource =
    sourceTokenAddress.toLowerCase() ===
    getNativeToken(sourceChainId).toLowerCase();

  if (isNativeSource) {
    return [];
  }

  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  ).toLowerCase();

  return transactions
    .filter(
      (transaction) =>
        transaction.to &&
        normalizeTokenAddress(
          transaction.to,
          sourceChainId,
          TokenAddressTarget.MetaMask,
        ).toLowerCase() === normalizedSourceTokenAddress,
    )
    .map((transaction) =>
      transaction.data ? decodeTransferAmount(transaction.data) : undefined,
    )
    .filter((amount): amount is string => amount !== undefined);
}

function decodeTransferAmount(data: Hex): string | undefined {
  try {
    const result = erc20Interface.decodeFunctionData('transfer', data);
    return new BigNumber(result._value.toString()).toString(10);
  } catch {
    return undefined;
  }
}

async function buildRelaySimulationRequest({
  messenger,
  quote,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<RelaySimulationRequest> {
  const { allParams } = await buildRelaySubmitParams({
    messenger,
    quote,
    transaction,
  });

  if (quote.original.metamask.isExecute) {
    return await buildRelayExecuteSimulationRequest({
      allParams,
      messenger,
      quote,
      transaction,
    });
  }

  if (quote.original.metamask.is7702) {
    return buildRelay7702BatchSimulationRequest(quote, allParams);
  }

  return {
    transactions: allParams.map(toSentinelTransaction),
  };
}

async function buildRelayExecuteSimulationRequest({
  allParams,
  messenger,
  quote,
  transaction,
}: {
  allParams: TransactionParams[];
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<RelaySimulationRequest> {
  const executeRequest = await buildRelayExecuteRequest({
    allParams,
    messenger,
    quote,
    transaction,
  });
  validateAuthorizationList(executeRequest, quote);

  const authorizationAddress =
    executeRequest.data.authorizationList?.[0]?.address;
  const transactionToSimulate = {
    data: executeRequest.data.data,
    from: quote.request.from,
    to: executeRequest.data.to,
    value: decimalToHex(executeRequest.data.value),
  };

  return {
    ...(authorizationAddress
      ? {
          overrides: getAccountUpgradeOverride(
            quote.request.from,
            authorizationAddress,
          ),
        }
      : {}),
    transactions: [transactionToSimulate],
  };
}

function buildRelay7702BatchSimulationRequest(
  quote: TransactionPayQuote<RelayQuote>,
  allParams: TransactionParams[],
): RelaySimulationRequest {
  const { from } = quote.request;
  const authorizationAddress =
    quote.original.request.authorizationList?.[0]?.address;
  const batchTransaction = buildEip7702BatchTransaction(from, allParams, quote);

  return {
    ...(authorizationAddress
      ? { overrides: getAccountUpgradeOverride(from, authorizationAddress) }
      : {}),
    transactions: [batchTransaction],
  };
}

function buildEip7702BatchTransaction(
  from: Hex,
  allParams: TransactionParams[],
  quote: TransactionPayQuote<RelayQuote>,
): SentinelSimulationTransaction {
  const calls = allParams.map((params) => [
    (params.to as Hex | undefined) ?? ZERO_ADDRESS,
    params.value ?? '0x0',
    params.data ?? '0x',
  ]);
  const mode =
    `0x${ERC7579_CALL_TYPE_BATCH}${ERC7579_EXEC_TYPE_DEFAULT}`.padEnd(
      66,
      '0',
    ) as Hex;
  const executionData = defaultAbiCoder.encode(
    [CALLS_SIGNATURE],
    [calls],
  ) as Hex;
  const gas = quote.original.metamask.gasLimits[0];

  return {
    data: erc7821Interface.encodeFunctionData('execute', [
      mode,
      executionData,
    ]) as Hex,
    from,
    ...(gas === undefined ? {} : { gas: toHex(gas) }),
    to: from,
    value: '0x0',
  };
}

function validateAuthorizationList(
  executeRequest: RelayExecuteRequest,
  quote: TransactionPayQuote<RelayQuote>,
): void {
  for (const authorization of executeRequest.data.authorizationList ?? []) {
    if (
      authorization.address === undefined ||
      authorization.chainId === undefined ||
      authorization.nonce === undefined ||
      authorization.r === undefined ||
      authorization.s === undefined ||
      authorization.yParity === undefined
    ) {
      throw new RelayQuoteValidationError({
        chainId: quote.request.sourceChainId,
        code: 'quote_authorization_invalid',
        message: 'Relay execute authorization list is incomplete',
        strategy: TransactionPayStrategy.Relay,
        tokenAddress: quote.request.sourceTokenAddress,
      });
    }
  }
}

async function simulateRelayQuote({
  messenger,
  quote,
  request,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  request: RelaySimulationRequest;
}): Promise<SentinelSimulationResponse> {
  try {
    return await simulateTransactions(quote.request.sourceChainId, {
      ...request,
      withCallTrace: true,
      withGas: true,
      withLogs: true,
    });
  } catch (error) {
    const fallbackResult = await getFallbackSimulationResult({
      messenger,
      quote,
      request,
    });
    const fallbackError = fallbackResult?.error;

    if (fallbackResult?.isSupported && !fallbackError) {
      return { transactions: [{}] };
    }

    if (!fallbackError && isSentinelChainUnsupportedError(error)) {
      return { transactions: [{}] };
    }

    const { message } = error as Error;
    const code =
      fallbackError ||
      isQuoteSimulationFailure(error) ||
      !(error instanceof SentinelSimulationError)
        ? 'quote_simulation_failed'
        : 'quote_validation_unavailable';

    throw new RelayQuoteValidationError({
      chainId: quote.request.sourceChainId,
      code,
      message: fallbackError ?? normalizeSimulationErrorMessage(message),
      strategy: TransactionPayStrategy.Relay,
      tokenAddress: quote.request.sourceTokenAddress,
    });
  }
}

async function validateSimulationResponse({
  messenger,
  quote,
  request,
  responseTransactions,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  request: RelaySimulationRequest;
  responseTransactions: SentinelSimulationResponseTransaction[];
}): Promise<void> {
  for (const [index, responseTransaction] of responseTransactions.entries()) {
    const error =
      responseTransaction.error ?? getCallTraceError(responseTransaction);

    if (!error) {
      continue;
    }

    const fallbackError = (
      await getFallbackSimulationResult({
        messenger,
        quote,
        request,
        transactionIndex: index,
      })
    )?.error;

    throw new RelayQuoteValidationError({
      chainId: quote.request.sourceChainId,
      code: 'quote_simulation_failed',
      message: fallbackError ?? normalizeSimulationErrorMessage(error),
      strategy: TransactionPayStrategy.Relay,
      tokenAddress: quote.request.sourceTokenAddress,
    });
  }
}

async function getFallbackSimulationResult({
  messenger,
  quote,
  request,
  transactionIndex = 0,
}: {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  request: RelaySimulationRequest;
  transactionIndex?: number;
}): Promise<RpcFallbackSimulationResult | undefined> {
  if (request.transactions.length !== 1) {
    return undefined;
  }

  const transaction = request.transactions[transactionIndex];

  if (!transaction) {
    return undefined;
  }

  const debugTraceCallResult = await getDebugTraceCallResult(
    messenger,
    quote,
    request,
    transaction,
  );

  if (debugTraceCallResult?.isSupported) {
    return debugTraceCallResult;
  }

  return await getEstimateGasResult(messenger, quote, request, transaction);
}

async function getDebugTraceCallResult(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<RelayQuote>,
  request: RelaySimulationRequest,
  transaction: SentinelSimulationTransaction,
): Promise<RpcFallbackSimulationResult | undefined> {
  try {
    const trace = await rpcRequest<RpcCallTrace>({
      messenger,
      chainId: quote.request.sourceChainId,
      method: 'debug_traceCall',
      params: [
        toRpcCallTransaction(transaction),
        LATEST_BLOCK,
        {
          tracer: 'callTracer',
          ...(request.overrides ? { stateOverrides: request.overrides } : {}),
        },
      ],
      options: getRpcFallbackRequestOptions(messenger, quote),
    });

    return {
      error: getRpcCallTraceError(trace),
      isSupported: true,
    };
  } catch (error) {
    return getRpcFallbackErrorResult(error);
  }
}

async function getEstimateGasResult(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<RelayQuote>,
  request: RelaySimulationRequest,
  transaction: SentinelSimulationTransaction,
): Promise<RpcFallbackSimulationResult | undefined> {
  try {
    await rpcRequest({
      messenger,
      chainId: quote.request.sourceChainId,
      method: 'eth_estimateGas',
      params: getRpcCallParams(transaction, request),
      options: getRpcFallbackRequestOptions(messenger, quote),
    });
  } catch (error) {
    return getRpcFallbackErrorResult(error);
  }

  return { isSupported: true };
}

function getRpcFallbackErrorResult(
  error: unknown,
): RpcFallbackSimulationResult | undefined {
  const message = getRpcErrorMessage(error);

  if (!message || RPC_FALLBACK_UNSUPPORTED_REGEX.test(message)) {
    return undefined;
  }

  return {
    error: normalizeSimulationErrorMessage(message),
    isSupported: true,
  };
}

function getRpcFallbackRequestOptions(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<RelayQuote>,
): { preferInfura: boolean } {
  return {
    preferInfura: !isChainExcludedFromInfura(
      messenger,
      quote.request.sourceChainId,
    ),
  };
}

function getRpcCallTraceError(trace: RpcCallTrace): string | undefined {
  const ownErrors = [
    trace.revertReason,
    decodeRevertData(trace.output),
    trace.error,
  ];
  const nestedErrors = (trace.calls ?? [])
    .map((call) => getRpcCallTraceError(call))
    .filter((error): error is string => error !== undefined);
  const errors = [...ownErrors, ...nestedErrors]
    .filter((error): error is string => error !== undefined)
    .map(normalizeSimulationErrorMessage);

  return errors.find((error) => !isGenericSimulationError(error)) ?? errors[0];
}

function getRpcErrorMessage(error: unknown): string | undefined {
  return (
    decodeRevertData(findRevertData(error)) ??
    findErrorMessage(error)?.replace(/^Error: /u, '')
  );
}

function findRevertData(value: unknown): Hex | undefined {
  if (typeof value === 'string') {
    return isRevertData(value) ? (value as Hex) : undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const valueRecord = value as Record<string, unknown>;

  return (
    findRevertData(valueRecord.data) ??
    findRevertData(valueRecord.error) ??
    findRevertData(valueRecord.originalError)
  );
}

function findErrorMessage(value: unknown): string | undefined {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const valueRecord = value as Record<string, unknown>;

  return (
    findErrorMessage(valueRecord.message) ??
    findErrorMessage(valueRecord.data) ??
    findErrorMessage(valueRecord.error) ??
    findErrorMessage(valueRecord.originalError)
  );
}

function decodeRevertData(data?: Hex): string | undefined {
  if (!data) {
    return undefined;
  }

  try {
    if (data.startsWith(ERROR_STRING_SELECTOR)) {
      return defaultAbiCoder
        .decode(['string'], `0x${data.slice(ERROR_STRING_SELECTOR.length)}`)[0]
        .toString();
    }

    if (data.startsWith(PANIC_SELECTOR)) {
      const [code] = defaultAbiCoder.decode(
        ['uint256'],
        `0x${data.slice(PANIC_SELECTOR.length)}`,
      );

      return `Panic(${code.toString()})`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getRpcCallParams(
  transaction: SentinelSimulationTransaction,
  request: RelaySimulationRequest,
): Json[] {
  const rpcTransaction = toRpcCallTransaction(transaction) as Json;

  return request.overrides
    ? [rpcTransaction, LATEST_BLOCK, request.overrides as Json]
    : [rpcTransaction, LATEST_BLOCK];
}

function toRpcCallTransaction(
  transaction: SentinelSimulationTransaction,
): RpcCallTransaction {
  return {
    data: transaction.data,
    from: transaction.from,
    gas: transaction.gas,
    maxFeePerGas: transaction.maxFeePerGas,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
    to: transaction.to,
    value: transaction.value ?? '0x0',
  };
}

function isQuoteSimulationFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return QUOTE_SIMULATION_FAILED_PREFIX.test(message);
}

function isSentinelChainUnsupportedError(error: unknown): boolean {
  return (
    error instanceof SentinelSimulationError &&
    /^Simulation is not supported for chain /iu.test(error.message)
  );
}

function normalizeSimulationErrorMessage(message: string): string {
  return message.replace(QUOTE_SIMULATION_FAILED_PREFIX, '');
}

function isGenericSimulationError(message: string): boolean {
  return /^(execution reverted|reverted)$/iu.test(message.trim());
}

function isRevertData(value: string): boolean {
  return (
    value.startsWith(ERROR_STRING_SELECTOR) || value.startsWith(PANIC_SELECTOR)
  );
}

function getCallTraceError(
  transaction: SentinelSimulationResponseTransaction,
): string | undefined {
  return findCallTraceError(transaction.callTrace);
}

function findCallTraceError(
  callTrace: SentinelSimulationResponseTransaction['callTrace'],
): string | undefined {
  if (!callTrace) {
    return undefined;
  }

  if (callTrace.error) {
    return callTrace.error;
  }

  for (const nestedCall of callTrace.calls ?? []) {
    const error = findCallTraceError(nestedCall);

    if (error) {
      return error;
    }
  }

  return undefined;
}

function toSentinelTransaction(
  params: TransactionParams,
): SentinelSimulationTransaction {
  return {
    data: params.data as Hex | undefined,
    from: params.from as Hex,
    gas: params.gas as Hex | undefined,
    maxFeePerGas: params.maxFeePerGas as Hex | undefined,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
    to: params.to as Hex | undefined,
    value: (params.value as Hex | undefined) ?? '0x0',
  };
}

function getAccountUpgradeOverride(
  account: Hex,
  delegationAddress: Hex,
): Record<Hex, { code: Hex }> {
  return {
    [account.toLowerCase() as Hex]: {
      code: `${DELEGATION_PREFIX}${delegationAddress.slice(2)}` as Hex,
    },
  };
}

function decimalToHex(value: string): Hex {
  return new BigNumber(value).toString(16).replace(/^/u, '0x') as Hex;
}

function throwInsufficientBalanceError(
  quote: TransactionPayQuote<RelayQuote>,
  liveBalance: string,
  requiredAmountRaw: string,
  message: string,
): never {
  const { sourceChainId, sourceTokenAddress } = quote.request;
  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  throw new RelayQuoteValidationError({
    availableAmountRaw: liveBalance,
    chainId: sourceChainId,
    code: 'insufficient_source_balance',
    message,
    requiredAmountRaw,
    strategy: TransactionPayStrategy.Relay,
    tokenAddress: normalizedSourceTokenAddress,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Quote validation aborted');
  }
}
