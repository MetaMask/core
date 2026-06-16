import { defaultAbiCoder } from '@ethersproject/abi';
import { createModuleLogger } from '@metamask/utils';
import type { Hex, Json } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { TransactionPayControllerMessenger } from '../types';
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

const log = createModuleLogger(projectLogger, 'simulation');

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
  constructor(message: string) {
    super(message);
    this.name = 'TransactionPaySimulationError';
  }
}

export async function simulateQuoteTransactions(
  request: SimulationRequest,
): Promise<void> {
  const requestWithOverrides = addSimulationOverrides(request);
  let responseTransactions: SentinelSimulationResponseTransaction[];

  log('Simulating quote transactions', {
    chainId: request.chainId,
    hasMock7702From: Boolean(request.mock7702From),
    transactionCount: request.transactions.length,
  });

  try {
    const response = await simulateTransactions(request.chainId, {
      ...toSentinelRequest(requestWithOverrides),
      withCallTrace: true,
      withGas: true,
      withLogs: true,
    });
    responseTransactions = response.transactions;
  } catch (error) {
    log('Sentinel simulation failed', { error });

    const fallbackResult =
      await getFallbackSimulationResult(requestWithOverrides);
    const fallbackError = fallbackResult?.error;

    if (fallbackResult?.isSupported && !fallbackError) {
      log('RPC fallback simulation passed');
      return;
    }

    if (!fallbackError && isSentinelChainUnsupportedError(error)) {
      log('Skipping validation for Sentinel-unsupported chain');
      return;
    }

    throw new TransactionPaySimulationError(
      fallbackError ?? normalizeSimulationErrorMessage(getErrorMessage(error)),
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

    log('Simulation response transaction failed', {
      error,
      fallbackError,
      index,
    });

    throw new TransactionPaySimulationError(
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
    log('Skipping RPC fallback for multi-transaction simulation', {
      transactionCount: request.transactions.length,
    });

    return undefined;
  }

  const transaction = request.transactions[transactionIndex];

  if (!transaction) {
    log('Skipping RPC fallback for missing simulation transaction', {
      transactionIndex,
    });

    return undefined;
  }

  const debugTraceCallResult = await getDebugTraceCallResult(
    request,
    transaction,
  );

  if (debugTraceCallResult?.isSupported) {
    log('debug_traceCall fallback completed', debugTraceCallResult);

    return debugTraceCallResult;
  }

  const estimateGasResult = await getEstimateGasResult(request, transaction);

  log('eth_estimateGas fallback completed', estimateGasResult);

  return estimateGasResult;
}

async function getDebugTraceCallResult(
  request: SimulationRequestWithOverrides,
  transaction: SimulationTransaction,
): Promise<RpcFallbackSimulationResult | undefined> {
  try {
    log('Running debug_traceCall fallback');

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
    log('debug_traceCall fallback failed', { error });

    return getRpcFallbackErrorResult(error);
  }
}

async function getEstimateGasResult(
  request: SimulationRequestWithOverrides,
  transaction: SimulationTransaction,
): Promise<RpcFallbackSimulationResult | undefined> {
  try {
    log('Running eth_estimateGas fallback');

    await rpcRequest({
      messenger: request.messenger,
      chainId: request.chainId,
      method: 'eth_estimateGas',
      params: getRpcCallParams(transaction, request),
      options: getRpcFallbackRequestOptions(request),
    });
  } catch (error) {
    log('eth_estimateGas fallback failed', { error });

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
  const errors = [
    trace.revertReason,
    decodeRevertData(trace.output),
    trace.error,
  ]
    .filter((error): error is string => error !== undefined)
    .map(normalizeSimulationErrorMessage);

  return errors[0];
}

function getRpcErrorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') {
    return decodeRevertData(error as Hex) ?? error;
  }

  if (error instanceof Error) {
    return error.message.replace(/^Error: /u, '');
  }

  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const { data, message } = error as Record<string, unknown>;

  if (typeof data === 'string') {
    return decodeRevertData(data as Hex) ?? data;
  }

  return typeof message === 'string'
    ? message.replace(/^Error: /u, '')
    : undefined;
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

function isSentinelChainUnsupportedError(error: unknown): boolean {
  return (
    error instanceof SentinelSimulationError &&
    /^Simulation is not supported for chain /iu.test(error.message)
  );
}

function normalizeSimulationErrorMessage(message: string): string {
  return message.replace(QUOTE_SIMULATION_FAILED_PREFIX, '');
}

function getCallTraceError(
  transaction: SentinelSimulationResponseTransaction,
): string | undefined {
  const { callTrace } = transaction;

  if (!callTrace) {
    return undefined;
  }

  return decodeRevertData(callTrace.output) ?? callTrace.error;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getAccountUpgradeOverride(account: Hex): Record<Hex, { code: Hex }> {
  return {
    [account.toLowerCase() as Hex]: {
      code: `${DELEGATION_PREFIX}${EIP7702_DELEGATOR_ADDRESS.slice(2)}` as Hex,
    },
  };
}
