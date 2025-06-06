import type { Fragment, LogDescription, Result } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import { hexToBN, query, toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { abiERC20, abiERC721, abiERC1155 } from '@metamask/metamask-eth-abis';
import { createModuleLogger, type Hex } from '@metamask/utils';
import BN from 'bn.js';

import { simulateTransactions } from '../api/simulation-api';
import type {
  SimulationResponseLog,
  SimulationRequestTransaction,
  SimulationResponse,
  SimulationResponseCallTrace,
  SimulationResponseTransaction,
  SimulationRequest,
} from '../api/simulation-api';
import {
  ABI_SIMULATION_ERC20_WRAPPED,
  ABI_SIMULATION_ERC721_LEGACY,
} from '../constants';
import {
  SimulationError,
  SimulationInvalidResponseError,
  SimulationRevertedError,
} from '../errors';
import { projectLogger } from '../logger';
import type {
  SimulationBalanceChange,
  SimulationData,
  SimulationTokenBalanceChange,
  SimulationToken,
  TransactionParams,
  NestedTransactionMetadata,
} from '../types';
import { SimulationTokenStandard } from '../types';

export enum SupportedToken {
  ERC20 = 'erc20',
  ERC721 = 'erc721',
  ERC1155 = 'erc1155',
  ERC20_WRAPPED = 'erc20Wrapped',
  ERC721_LEGACY = 'erc721Legacy',
}

type ABI = Fragment[];

export type GetBalanceChangesRequest = {
  blockTime?: number;
  chainId: Hex;
  ethQuery: EthQuery;
  nestedTransactions?: NestedTransactionMetadata[];
  txParams: TransactionParams;
};

type ParsedEvent = {
  contractAddress: Hex;
  tokenStandard: SimulationTokenStandard;
  name: string;
  args: Record<string, Hex | Hex[]>;
  abi: ABI;
};

const log = createModuleLogger(projectLogger, 'balance-changes');

const SUPPORTED_EVENTS = [
  'Transfer',
  'TransferSingle',
  'TransferBatch',
  'Deposit',
  'Withdrawal',
];

const SUPPORTED_TOKEN_ABIS = {
  [SupportedToken.ERC20]: {
    abi: abiERC20,
    standard: SimulationTokenStandard.erc20,
  },
  [SupportedToken.ERC721]: {
    abi: abiERC721,
    standard: SimulationTokenStandard.erc721,
  },
  [SupportedToken.ERC1155]: {
    abi: abiERC1155,
    standard: SimulationTokenStandard.erc1155,
  },
  [SupportedToken.ERC20_WRAPPED]: {
    abi: ABI_SIMULATION_ERC20_WRAPPED,
    standard: SimulationTokenStandard.erc20,
  },
  [SupportedToken.ERC721_LEGACY]: {
    abi: ABI_SIMULATION_ERC721_LEGACY,
    standard: SimulationTokenStandard.erc721,
  },
};

const REVERTED_ERRORS = ['execution reverted', 'insufficient funds for gas'];

type BalanceTransactionMap = Map<SimulationToken, SimulationRequestTransaction>;

/**
 * Generate simulation data for a transaction.
 *
 * @param request - The transaction to simulate.
 * @param request.chainId - The chain ID of the transaction.
 * @param request.from - The sender of the transaction.
 * @param request.to - The recipient of the transaction.
 * @param request.value - The value of the transaction.
 * @param request.data - The data of the transaction.
 * @returns The simulation data.
 */
export async function getBalanceChanges(
  request: GetBalanceChangesRequest,
): Promise<SimulationData> {
  log('Request', request);

  try {
    const response = await baseRequest({
      request,
      params: {
        withCallTrace: true,
        withLogs: true,
      },
    });

    const transactionError = response.transactions?.[0]?.error;

    if (transactionError) {
      throw new SimulationError(transactionError);
    }

    const nativeBalanceChange = getNativeBalanceChange(request, response);
    const events = getEvents(response);

    log('Parsed events', events);

    const tokenBalanceChanges = await getTokenBalanceChanges(request, events);

    const simulationData = {
      nativeBalanceChange,
      tokenBalanceChanges,
    };

    return simulationData;
  } catch (error) {
    log('Failed to get balance changes', error, request);

    let simulationError = error as SimulationError;

    if (
      REVERTED_ERRORS.some((revertErrorMessage) =>
        simulationError.message?.includes(revertErrorMessage),
      )
    ) {
      simulationError = new SimulationRevertedError();
    }

    const { code, message } = simulationError;

    return {
      tokenBalanceChanges: [],
      error: {
        code,
        message,
      },
    };
  }
}

/**
 * Extract the native balance change from a simulation response.
 *
 * @param request - Simulation request.
 * @param response - Simulation response.
 * @returns Native balance change or undefined if unchanged.
 */
function getNativeBalanceChange(
  request: GetBalanceChangesRequest,
  response: SimulationResponse,
): SimulationBalanceChange | undefined {
  const transactionResponse = response.transactions[0];

  /* istanbul ignore next */
  if (!transactionResponse) {
    return undefined;
  }

  const { txParams } = request;
  const userAddress = txParams.from as Hex;
  const { stateDiff } = transactionResponse;
  const previousBalance = stateDiff?.pre?.[userAddress]?.balance;
  const newBalance = stateDiff?.post?.[userAddress]?.balance;

  if (!previousBalance || !newBalance) {
    return undefined;
  }

  return getSimulationBalanceChange(
    previousBalance,
    newBalance,
    transactionResponse.gasCost,
  );
}

/**
 * Extract events from a simulation response.
 *
 * @param response - The simulation response.
 * @returns The parsed events.
 */
function getEvents(response: SimulationResponse): ParsedEvent[] {
  /* istanbul ignore next */
  const logs = extractLogs(
    response.transactions[0]?.callTrace ?? ({} as SimulationResponseCallTrace),
  );

  log('Extracted logs', logs);

  const interfaces = getContractInterfaces();

  return logs
    .map((currentLog) => {
      const event = parseLog(currentLog, interfaces);

      if (!event) {
        log('Failed to parse log', currentLog);
        return undefined;
      }

      /* istanbul ignore next */
      const inputs = event.abi.find((e) => e.name === event.name)?.inputs;

      /* istanbul ignore if */
      if (!inputs) {
        log('Failed to find inputs for event', event);
        return undefined;
      }

      if (!SUPPORTED_EVENTS.includes(event.name)) {
        log('Ignoring unsupported event', event.name, event);
        return undefined;
      }

      log('Normalizing event args', event.name, event);

      const args = normalizeEventArgs(event.args, inputs);

      return {
        contractAddress: currentLog.address,
        tokenStandard: event.standard,
        name: event.name,
        args,
        abi: event.abi,
      };
    })
    .filter((e) => e !== undefined) as ParsedEvent[];
}

/**
 * Normalize event arguments using ABI input definitions.
 *
 * @param args - The raw event arguments.
 * @param abiInputs - The ABI input definitions.
 * @returns The normalized event arguments.
 */
function normalizeEventArgs(
  args: Result,
  abiInputs: { name: string }[],
): Record<string, Hex | Hex[]> {
  return args.reduce((result, arg, index) => {
    const name = abiInputs[index].name.replace('_', '');
    const value = normalizeEventArgValue(arg);

    result[name] = value;

    return result;
  }, {});
}

/**
 * Normalize an event argument value.
 *
 * @param value - The event argument value.
 * @returns The normalized event argument value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEventArgValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(normalizeEventArgValue);
  }

  let normalizedValue = value;

  normalizedValue = normalizedValue.toHexString?.() ?? normalizedValue;
  normalizedValue = normalizedValue.toLowerCase?.() ?? normalizedValue;

  return normalizedValue;
}

/**
 * Generate token balance changes from parsed events.
 *
 * @param request - The transaction that was simulated.
 * @param events - The parsed events.
 * @returns An array of token balance changes.
 */
async function getTokenBalanceChanges(
  request: GetBalanceChangesRequest,
  events: ParsedEvent[],
): Promise<SimulationTokenBalanceChange[]> {
  const { txParams } = request;
  const from = txParams.from as Hex;
  const balanceTxs = getTokenBalanceTransactions(request, events);

  log('Generated balance transactions', [...balanceTxs.after.values()]);

  const transactionCount = balanceTxs.before.size + balanceTxs.after.size + 1;

  if (transactionCount === 1) {
    return [];
  }

  const response = await baseRequest({
    request,
    before: [...balanceTxs.before.values()],
    after: [...balanceTxs.after.values()],
  });

  log('Balance simulation response', response);

  if (response.transactions.length !== transactionCount) {
    throw new SimulationInvalidResponseError();
  }

  let prevBalanceTxIndex = 0;
  return [...balanceTxs.after.keys()]
    .map((token, index) => {
      const previousBalanceCheckSkipped = !balanceTxs.before.get(token);
      const previousBalance = previousBalanceCheckSkipped
        ? '0x0'
        : getAmountFromBalanceTransactionResult(
            from,
            token,
            // eslint-disable-next-line no-plusplus
            response.transactions[prevBalanceTxIndex++],
          );

      const newBalance = getAmountFromBalanceTransactionResult(
        from,
        token,
        response.transactions[index + balanceTxs.before.size + 1],
      );

      const balanceChange = getSimulationBalanceChange(
        previousBalance,
        newBalance,
      );

      if (!balanceChange) {
        return undefined;
      }

      return {
        ...token,
        ...balanceChange,
      };
    })
    .filter((change) => change !== undefined) as SimulationTokenBalanceChange[];
}

/**
 * Generate transactions to check token balances.
 *
 * @param request - The transaction that was simulated.
 * @param events - The parsed events.
 * @returns A map of token balance transactions keyed by token.
 */
function getTokenBalanceTransactions(
  request: GetBalanceChangesRequest,
  events: ParsedEvent[],
): {
  before: BalanceTransactionMap;
  after: BalanceTransactionMap;
} {
  const tokenKeys = new Set();
  const before = new Map();
  const after = new Map();
  const from = request.txParams.from as Hex;

  const userEvents = events.filter((event) =>
    [event.args.from, event.args.to].includes(from),
  );

  log('Filtered user events', userEvents);

  for (const event of userEvents) {
    const tokenIds = getEventTokenIds(event);

    log('Extracted token IDs', tokenIds);

    for (const tokenId of tokenIds) {
      const simulationToken: SimulationToken = {
        address: event.contractAddress,
        standard: event.tokenStandard,
        id: tokenId,
      };

      const tokenKey = JSON.stringify(simulationToken);

      if (tokenKeys.has(tokenKey)) {
        log(
          'Ignoring additional event with same contract and token ID',
          simulationToken,
        );
        continue;
      }

      tokenKeys.add(tokenKey);

      const data = getBalanceTransactionData(
        event.tokenStandard,
        from,
        tokenId,
      );

      const transaction: SimulationRequestTransaction = {
        from,
        to: event.contractAddress,
        data,
      };

      if (skipPriorBalanceCheck(event)) {
        after.set(simulationToken, transaction);
      } else {
        before.set(simulationToken, transaction);
        after.set(simulationToken, transaction);
      }
    }
  }

  return { before, after };
}

/**
 * Check if an event needs to check the previous balance.
 *
 * @param event - The parsed event.
 * @returns True if the prior balance check should be skipped.
 */
function skipPriorBalanceCheck(event: ParsedEvent): boolean {
  // In the case of an NFT mint, we cannot check the NFT owner before the mint
  // as the balance check transaction would revert.
  return (
    event.name === 'Transfer' &&
    event.tokenStandard === SimulationTokenStandard.erc721 &&
    parseInt(event.args.from as string, 16) === 0
  );
}

/**
 * Extract token IDs from a parsed event.
 *
 * @param event - The parsed event.
 * @returns An array of token IDs.
 */
function getEventTokenIds(event: ParsedEvent): (Hex | undefined)[] {
  if (event.tokenStandard === SimulationTokenStandard.erc721) {
    return [event.args.tokenId as Hex];
  }

  if (
    event.tokenStandard === SimulationTokenStandard.erc1155 &&
    event.name === 'TransferSingle'
  ) {
    return [event.args.id as Hex];
  }

  if (
    event.tokenStandard === SimulationTokenStandard.erc1155 &&
    event.name === 'TransferBatch'
  ) {
    return event.args.ids as Hex[];
  }

  // ERC-20 does not have a token ID so default to undefined.
  return [undefined];
}

/**
 * Get the interface for a token standard.
 *
 * @param tokenStandard - The token standard.
 * @returns The interface for the token standard.
 */
function getContractInterface(
  tokenStandard: SimulationTokenStandard,
): Interface {
  switch (tokenStandard) {
    case SimulationTokenStandard.erc721:
      return new Interface(abiERC721);
    case SimulationTokenStandard.erc1155:
      return new Interface(abiERC1155);
    default:
      return new Interface(abiERC20);
  }
}

/**
 * Extract the value from a balance transaction response using the correct ABI.
 *
 * @param from - The address to check the balance of.
 * @param token - The token to check the balance of.
 * @param response - The balance transaction response.
 * @returns The value of the balance transaction as Hex.
 */
function getAmountFromBalanceTransactionResult(
  from: Hex,
  token: SimulationToken,
  response: SimulationResponseTransaction,
): Hex {
  const contract = getContractInterface(token.standard);

  try {
    if (token.standard === SimulationTokenStandard.erc721) {
      const result = contract.decodeFunctionResult('ownerOf', response.return);
      const owner = result[0];
      return owner.toLowerCase() === from.toLowerCase() ? '0x1' : '0x0';
    }

    const result = contract.decodeFunctionResult('balanceOf', response.return);
    return toHex(result[0]);
  } catch (error) {
    log('Failed to decode balance transaction', error, { token, response });
    throw new SimulationError(
      `Failed to decode balance transaction for token ${
        token.address
      }: ${String(error)}`,
    );
  }
}

/**
 * Generate the balance transaction data for a token.
 *
 * @param tokenStandard - The token standard.
 * @param from - The address to check the balance of.
 * @param tokenId - The token ID to check the balance of.
 * @returns The balance transaction data.
 */
function getBalanceTransactionData(
  tokenStandard: SimulationTokenStandard,
  from: Hex,
  tokenId?: Hex,
): Hex {
  const contract = getContractInterface(tokenStandard);
  switch (tokenStandard) {
    case SimulationTokenStandard.erc721:
      return contract.encodeFunctionData('ownerOf', [tokenId]) as Hex;

    case SimulationTokenStandard.erc1155:
      return contract.encodeFunctionData('balanceOf', [from, tokenId]) as Hex;

    default:
      return contract.encodeFunctionData('balanceOf', [from]) as Hex;
  }
}

/**
 * Parse a raw event log using known ABIs.
 *
 * @param eventLog - The raw event log.
 * @param interfaces - The contract interfaces.
 * @returns The parsed event log or undefined if it could not be parsed.
 */
function parseLog(
  eventLog: SimulationResponseLog,
  interfaces: Map<SupportedToken, Interface>,
):
  | (LogDescription & { abi: ABI; standard: SimulationTokenStandard })
  | undefined {
  const supportedTokens = Object.values(SupportedToken);

  for (const token of supportedTokens) {
    try {
      const contractInterface = interfaces.get(token) as Interface;
      const { abi, standard } = SUPPORTED_TOKEN_ABIS[token];

      return {
        ...contractInterface.parseLog(eventLog),
        abi,
        standard,
      };
      // Not used
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      continue;
    }
  }

  return undefined;
}

/**
 * Extract all logs from a call trace tree.
 *
 * @param call - The root call trace.
 * @returns An array of logs.
 */
function extractLogs(
  call: SimulationResponseCallTrace,
): SimulationResponseLog[] {
  /* istanbul ignore next */
  const logs = call.logs ?? [];

  /* istanbul ignore next */
  const nestedCalls = call.calls ?? [];

  return [
    ...logs,
    ...nestedCalls.map((nestedCall) => extractLogs(nestedCall)).flat(),
  ];
}

/**
 * Generate balance change data from previous and new balances.
 *
 * @param previousBalance - The previous balance.
 * @param newBalance - The new balance.
 * @param offset - Optional offset to apply to the new balance.
 * @returns The balance change data or undefined if unchanged.
 */
function getSimulationBalanceChange(
  previousBalance: Hex,
  newBalance: Hex,
  offset: number = 0,
): SimulationBalanceChange | undefined {
  const newBalanceBN = hexToBN(newBalance).add(new BN(offset));
  const previousBalanceBN = hexToBN(previousBalance);
  const differenceBN = newBalanceBN.sub(previousBalanceBN);
  const isDecrease = differenceBN.isNeg();
  const difference = toHex(differenceBN.abs());

  if (differenceBN.isZero()) {
    log('Balance change is zero');
    return undefined;
  }

  return {
    previousBalance,
    newBalance: toHex(newBalanceBN),
    difference,
    isDecrease,
  };
}

/**
 * Get the contract interfaces for all supported tokens.
 *
 * @returns A map of supported tokens to their contract interfaces.
 */
function getContractInterfaces(): Map<SupportedToken, Interface> {
  const supportedTokens = Object.values(SupportedToken);

  return new Map(
    supportedTokens.map((tokenType) => {
      const { abi } = SUPPORTED_TOKEN_ABIS[tokenType];
      const contractInterface = new Interface(abi);
      return [tokenType, contractInterface];
    }),
  );
}

/**
 * Base request to simulation API.
 *
 * @param options - Options bag.
 * @param options.after - Transactions to simulate after user's transaction.
 * @param options.before - Transactions to simulate before user's transaction.
 * @param options.params - Additional parameters for the request.
 * @param options.request - Original request object.
 * @returns The simulation response.
 */
async function baseRequest({
  request,
  params,
  before = [],
  after = [],
}: {
  request: GetBalanceChangesRequest;
  params?: Partial<SimulationRequest>;
  before?: SimulationRequestTransaction[];
  after?: SimulationRequestTransaction[];
}): Promise<SimulationResponse> {
  const { blockTime, chainId, ethQuery, txParams } = request;
  const { authorizationList } = txParams;
  const from = txParams.from as Hex;

  const authorizationListFinal = authorizationList?.map((authorization) => ({
    address: authorization.address,
    from,
  }));

  const userTransaction: SimulationRequestTransaction = {
    authorizationList: authorizationListFinal,
    data: txParams.data as Hex,
    from: txParams.from as Hex,
    gas: txParams.gas as Hex,
    maxFeePerGas: (txParams.maxFeePerGas ?? txParams.gasPrice) as Hex,
    maxPriorityFeePerGas: (txParams.maxPriorityFeePerGas ??
      txParams.gasPrice) as Hex,
    to: txParams.to as Hex,
    value: txParams.value as Hex,
  };

  const transactions = [...before, userTransaction, ...after];
  const requiredBalanceBN = getRequiredBalance(request);
  const requiredBalanceHex = toHex(requiredBalanceBN);

  log('Required balance', requiredBalanceHex);

  const currentBalanceHex = (await query(ethQuery, 'getBalance', [
    from,
    'latest',
  ])) as Hex;

  const currentBalanceBN = hexToBN(currentBalanceHex);

  log('Current balance', currentBalanceHex);

  const isInsufficientBalance = currentBalanceBN.lt(requiredBalanceBN);

  return await simulateTransactions(chainId, {
    ...params,
    transactions,
    withGas: true,
    withDefaultBlockOverrides: true,
    ...(blockTime && {
      blockOverrides: {
        ...params?.blockOverrides,
        time: toHex(blockTime),
      },
    }),
    ...(isInsufficientBalance && {
      overrides: {
        ...params?.overrides,
        [from]: {
          ...params?.overrides?.[from],
          balance: requiredBalanceHex,
        },
      },
    }),
  });
}

/**
 * Calculate the required minimum balance for a transaction.
 *
 * @param request - The transaction request.
 * @returns The minimal balance as a BN.
 */
function getRequiredBalance(request: GetBalanceChangesRequest): BN {
  const { txParams } = request;
  const gasLimit = hexToBN(txParams.gas ?? '0x0');
  const gasPrice = hexToBN(txParams.maxFeePerGas ?? txParams.gasPrice ?? '0x0');
  const value = hexToBN(txParams.value ?? '0x0');

  const nestedValue = (request.nestedTransactions ?? [])
    .map((tx) => hexToBN(tx.value ?? '0x0'))
    .reduce((acc, val) => acc.add(val), new BN(0));

  return gasLimit.mul(gasPrice).add(value).add(nestedValue);
}
