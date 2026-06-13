import { defaultAbiCoder } from '@ethersproject/abi';
import type { Hex, Json } from '@metamask/utils';

import type {
  TransactionPayControllerMessenger,
  TransactionPayQuoteValidationErrorCode,
} from '../types';
import { isChainExcludedFromInfura } from './feature-flags';
import { rpcRequest } from './provider';
import {
  SentinelSimulationError,
  SentinelSimulationResponseTransaction,
  SentinelSimulationTransaction,
  simulateTransactions,
} from './sentinel';

const DELEGATION_PREFIX = '0xef0100';
const ERROR_STRING_SELECTOR = '0x08c379a0';
const EIP7702_DELEGATOR_ADDRESS =
  '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b' as Hex;
const LATEST_BLOCK = 'latest';
const PANIC_SELECTOR = '0x4e487b71';
const QUOTE_SIMULATION_FAILED_PREFIX = /^Quote simulation failed\s*[-:]\s*/iu;
const RPC_FALLBACK_UNSUPPORTED_REGEX =
  /(does not exist|invalid argument|invalid params|method .*not|not supported|too many arguments|unsupported)/iu;

export type SimulationTransaction = SentinelSimulationTransaction;

export type SimulationRequest = {
  chainId: Hex;
  messenger: TransactionPayControllerMessenger;
  mock7702From?: Hex;
  transactions: SimulationTransaction[];
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

type SimulationRequestWithOverrides = SimulationRequest & {
  overrides?: Record<Hex, { code: Hex }>;
};

export class TransactionPaySimulationError extends Error {
  readonly code: TransactionPayQuoteValidationErrorCode;

  constructor(code: TransactionPayQuoteValidationErrorCode, message: string) {
    super(message);
    this.name = 'TransactionPaySimulationError';
    this.code = code;
  }
}

export async function simulateQuoteTransactions(
  request: SimulationRequest,
): Promise<void> {
  const requestWithOverrides = addSimulationOverrides(request);
  let responseTransactions: SentinelSimulationResponseTransaction[];

  try {
    const response = await simulateTransactions(request.chainId, {
      ...toSentinelRequest(requestWithOverrides),
      withCallTrace: true,
      withGas: true,
      withLogs: true,
    });
    responseTransactions = response.transactions;
  } catch (error) {
    const fallbackResult =
      await getFallbackSimulationResult(requestWithOverrides);
    const fallbackError = fallbackResult?.error;

    if (fallbackResult?.isSupported && !fallbackError) {
      return;
    }

    if (!fallbackError && isSentinelChainUnsupportedError(error)) {
      return;
    }

    const { message } = error as Error;
    const code =
      fallbackError ||
      isQuoteSimulationFailure(error) ||
      !(error instanceof SentinelSimulationError)
        ? 'quote_simulation_failed'
        : 'quote_validation_unavailable';

    throw new TransactionPaySimulationError(
      code,
      fallbackError ?? normalizeSimulationErrorMessage(message),
    );
  }

  await validateSimulationResponse(requestWithOverrides, responseTransactions);
}

async function validateSimulationResponse(
  request: SimulationRequestWithOverrides,
  responseTransactions: SentinelSimulationResponseTransaction[],
): Promise<void> {
  for (const [index, responseTransaction] of responseTransactions.entries()) {
    const error =
      responseTransaction.error ?? getCallTraceError(responseTransaction);

    if (!error) {
      continue;
    }

    const fallbackError = (await getFallbackSimulationResult(request, index))
      ?.error;

    throw new TransactionPaySimulationError(
      'quote_simulation_failed',
      fallbackError ?? normalizeSimulationErrorMessage(error),
    );
  }
}

function addSimulationOverrides(
  request: SimulationRequest,
): SimulationRequestWithOverrides {
  const { mock7702From } = request;

  if (!mock7702From) {
    return request;
  }

  return {
    ...request,
    overrides: getAccountUpgradeOverride(mock7702From),
  };
}

function toSentinelRequest(request: SimulationRequestWithOverrides): {
  overrides?: Record<Hex, { code: Hex }>;
  transactions: SimulationTransaction[];
} {
  return {
    ...(request.overrides ? { overrides: request.overrides } : {}),
    transactions: request.transactions,
  };
}

async function getFallbackSimulationResult(
  request: SimulationRequestWithOverrides,
  transactionIndex = 0,
): Promise<RpcFallbackSimulationResult | undefined> {
  if (request.transactions.length !== 1) {
    return undefined;
  }

  const transaction = request.transactions[transactionIndex];

  if (!transaction) {
    return undefined;
  }

  const debugTraceCallResult = await getDebugTraceCallResult(
    request,
    transaction,
  );

  if (debugTraceCallResult?.isSupported) {
    return debugTraceCallResult;
  }

  return await getEstimateGasResult(request, transaction);
}

async function getDebugTraceCallResult(
  request: SimulationRequestWithOverrides,
  transaction: SimulationTransaction,
): Promise<RpcFallbackSimulationResult | undefined> {
  try {
    const trace = await rpcRequest<RpcCallTrace>({
      messenger: request.messenger,
      chainId: request.chainId,
      method: 'debug_traceCall',
      params: [
        toRpcCallTransaction(transaction),
        LATEST_BLOCK,
        {
          tracer: 'callTracer',
          ...(request.overrides ? { stateOverrides: request.overrides } : {}),
        },
      ],
      options: getRpcFallbackRequestOptions(request),
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
  request: SimulationRequestWithOverrides,
  transaction: SimulationTransaction,
): Promise<RpcFallbackSimulationResult | undefined> {
  try {
    await rpcRequest({
      messenger: request.messenger,
      chainId: request.chainId,
      method: 'eth_estimateGas',
      params: getRpcCallParams(transaction, request),
      options: getRpcFallbackRequestOptions(request),
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

function getRpcFallbackRequestOptions(request: SimulationRequest): {
  preferInfura: boolean;
} {
  return {
    preferInfura: !isChainExcludedFromInfura(
      request.messenger,
      request.chainId,
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
  transaction: SimulationTransaction,
  request: SimulationRequestWithOverrides,
): Json[] {
  const rpcTransaction = toRpcCallTransaction(transaction) as Json;

  return request.overrides
    ? [rpcTransaction, LATEST_BLOCK, request.overrides as Json]
    : [rpcTransaction, LATEST_BLOCK];
}

function toRpcCallTransaction(
  transaction: SimulationTransaction,
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

function getAccountUpgradeOverride(account: Hex): Record<Hex, { code: Hex }> {
  return {
    [account.toLowerCase() as Hex]: {
      code: `${DELEGATION_PREFIX}${EIP7702_DELEGATOR_ADDRESS.slice(2)}` as Hex,
    },
  };
}
