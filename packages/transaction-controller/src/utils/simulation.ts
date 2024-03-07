import type { Fragment, LogDescription, Result } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import { hexToBN, toHex } from '@metamask/controller-utils';
import { abiERC20, abiERC721, abiERC1155 } from '@metamask/metamask-eth-abis';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  SimulationBalanceChange,
  SimulationData,
  SimulationTokenBalanceChange,
  SimulationToken,
} from '../types';
import { SimulationTokenStandard } from '../types';
import type {
  SimulationResponseLog,
  SimulationRequestTransaction,
  SimulationResponse,
  SimulationResponseCallTrace,
} from './simulation-api';
import { simulateTransactions } from './simulation-api';

const log = createModuleLogger(projectLogger, 'simulation');

type ABI = Fragment[];

export type GetSimulationDataRequest = {
  chainId: Hex;
  from: Hex;
  to?: Hex;
  value?: Hex;
  data?: Hex;
};

type ParsedEvent = {
  contractAddress: Hex;
  tokenStandard: SimulationTokenStandard;
  name: string;
  args: Record<string, Hex | Hex[]>;
  abi: ABI;
};

/**
 * Generate simulation data for a transaction.
 * @param request - The transaction to simulate.
 * @param request.chainId - The chain ID of the transaction.
 * @param request.from - The sender of the transaction.
 * @param request.to - The recipient of the transaction.
 * @param request.value - The value of the transaction.
 * @param request.data - The data of the transaction.
 * @returns The simulation data.
 */
export async function getSimulationData(
  request: GetSimulationDataRequest,
): Promise<SimulationData | undefined> {
  const { chainId, from, to, value, data } = request;

  log('Getting simulation data', request);

  try {
    const response = await simulateTransactions(chainId, {
      transactions: [{ from, to, value, data }],
      withCallTrace: true,
      withLogs: true,
    });

    const nativeBalanceChange = getNativeBalanceChange(request.from, response);
    const events = getEvents(response);

    log('Parsed events', events);

    const tokenBalanceChanges = await getTokenBalanceChanges(request, events);

    return {
      nativeBalanceChange,
      tokenBalanceChanges,
    };
  } catch (error) {
    log('Failed to get simulation data', error, request);
    return undefined;
  }
}

/**
 * Extract the native balance change from a simulation response.
 * @param userAddress - The user's account address.
 * @param response - The simulation response.
 * @returns The native balance change or undefined if unchanged.
 */
function getNativeBalanceChange(
  userAddress: Hex,
  response: SimulationResponse,
): SimulationBalanceChange | undefined {
  const transactionResponse = response.transactions[0];

  /* istanbul ignore next */
  if (!transactionResponse) {
    return undefined;
  }

  const { stateDiff } = transactionResponse;
  const previousBalance = stateDiff.pre[userAddress]?.balance;
  const newBalance = stateDiff.post[userAddress]?.balance;

  if (!previousBalance || !newBalance) {
    return undefined;
  }

  return getSimulationBalanceChange(previousBalance, newBalance);
}

/**
 * Extract events from a simulation response.
 * @param response - The simulation response.
 * @returns The parsed events.
 */
function getEvents(response: SimulationResponse): ParsedEvent[] {
  /* istanbul ignore next */
  const logs = extractLogs(response.transactions[0]?.callTrace ?? {});

  log('Extracted logs', logs);

  const erc20Interface = new Interface(abiERC20);
  const erc721Interface = new Interface(abiERC721);
  const erc1155Interface = new Interface(abiERC1155);

  return logs
    .map((currentLog) => {
      const event = parseLog(
        currentLog,
        erc20Interface,
        erc721Interface,
        erc1155Interface,
      );

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

      const args = parseEventArgs(event.args, inputs);

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
 * Parse event arguments using ABI input definitions.
 * @param args - The raw event arguments.
 * @param abiInputs - The ABI input definitions.
 * @returns The parsed event arguments.
 */
function parseEventArgs(
  args: Result,
  abiInputs: { name: string }[],
): Record<string, Hex | Hex[]> {
  return args.reduce((result, arg, index) => {
    const name = abiInputs[index].name.replace('_', '');
    const value = parseEventArgValue(arg);

    result[name] = value;

    return result;
  }, {});
}

/**
 * Parse an event argument value.
 * @param value - The event argument value.
 * @returns The parsed event argument value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEventArgValue(value: any): Hex | Hex[] {
  if (Array.isArray(value)) {
    return value.map(parseEventArgValue) as Hex[];
  }

  return (value.toHexString?.() ?? value).toLowerCase();
}

/**
 * Generate token balance changes from parsed events.
 * @param request - The transaction that was simulated.
 * @param events - The parsed events.
 * @returns An array of token balance changes.
 */
async function getTokenBalanceChanges(
  request: GetSimulationDataRequest,
  events: ParsedEvent[],
): Promise<SimulationTokenBalanceChange[]> {
  const balanceTransactionsByToken = getTokenBalanceTransactions(
    request,
    events,
  );

  const balanceTransactions = [...balanceTransactionsByToken.values()];

  log('Generated balance transactions', balanceTransactions);

  if (!balanceTransactions.length) {
    return [];
  }

  const response = await simulateTransactions(request.chainId as Hex, {
    transactions: [...balanceTransactions, request, ...balanceTransactions],
  });

  log('Balance simulation response', response);

  if (response.transactions.length !== balanceTransactions.length * 2 + 1) {
    throw new Error('Invalid response from simulation API');
  }

  return [...balanceTransactionsByToken.keys()]
    .map((token, index) => {
      const previousBalance = normalizeReturnValue(
        response.transactions[index].return,
      );

      const newBalance = normalizeReturnValue(
        response.transactions[index + balanceTransactions.length + 1].return,
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
 * @param request - The transaction that was simulated.
 * @param events - The parsed events.
 * @returns A map of token balance transactions keyed by token.
 */
function getTokenBalanceTransactions(
  request: GetSimulationDataRequest,
  events: ParsedEvent[],
): Map<SimulationToken, SimulationRequestTransaction> {
  const tokenKeys = new Set();

  return events.reduce((result, event) => {
    if (
      !['Transfer', 'TransferSingle', 'TransferBatch'].includes(event.name) ||
      ![event.args.from, event.args.to].includes(request.from)
    ) {
      log('Ignoring event', event);
      return result;
    }

    // ERC-20 does not have a token ID so default to undefined.
    let tokenIds: (Hex | undefined)[] = [undefined];

    if (event.tokenStandard === SimulationTokenStandard.erc721) {
      tokenIds = [event.args.tokenId as Hex];
    }

    if (
      event.tokenStandard === SimulationTokenStandard.erc1155 &&
      event.name === 'TransferSingle'
    ) {
      tokenIds = [event.args.id as Hex];
    }

    if (
      event.tokenStandard === SimulationTokenStandard.erc1155 &&
      event.name === 'TransferBatch'
    ) {
      tokenIds = event.args.ids as Hex[];
    }

    log('Extracted token ids', tokenIds);

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

      const parameters = [request.from];

      if (event.tokenStandard === SimulationTokenStandard.erc1155) {
        parameters.push(tokenId as Hex);
      }

      result.set(simulationToken, {
        from: request.from,
        to: event.contractAddress,
        data: new Interface(event.abi).encodeFunctionData(
          'balanceOf',
          parameters,
        ) as Hex,
      });
    }

    return result;
  }, new Map<SimulationToken, SimulationRequestTransaction>());
}

/**
 * Parse a raw event log using known ABIs.
 * @param eventLog - The raw event log.
 * @param erc20 - The ERC-20 ABI interface.
 * @param erc721 - The ERC-721 ABI interface.
 * @param erc1155 - The ERC-1155 ABI interface.
 * @returns The parsed event log or undefined if it could not be parsed.
 */
function parseLog(
  eventLog: SimulationResponseLog,
  erc20: Interface,
  erc721: Interface,
  erc1155: Interface,
):
  | (LogDescription & { abi: ABI; standard: SimulationTokenStandard })
  | undefined {
  const abisByStandard = [
    {
      abi: abiERC20,
      contractInterface: erc20,
      standard: SimulationTokenStandard.erc20,
    },
    {
      abi: abiERC721,
      contractInterface: erc721,
      standard: SimulationTokenStandard.erc721,
    },
    {
      abi: abiERC1155,
      contractInterface: erc1155,
      standard: SimulationTokenStandard.erc1155,
    },
  ];

  for (const { abi, contractInterface, standard } of abisByStandard) {
    try {
      return {
        ...contractInterface.parseLog(eventLog),
        abi,
        standard,
      };
    } catch (e) {
      continue;
    }
  }

  return undefined;
}

/**
 * Extract all logs from a call trace tree.
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
 * @param previousBalance - The previous balance.
 * @param newBalance - The new balance.
 * @returns The balance change data or undefined if unchanged.
 */
function getSimulationBalanceChange(
  previousBalance: Hex,
  newBalance: Hex,
): SimulationBalanceChange | undefined {
  const differenceBN = hexToBN(newBalance).sub(hexToBN(previousBalance));
  const isDecrease = differenceBN.isNeg();
  const difference = toHex(differenceBN.abs());

  if (differenceBN.isZero()) {
    log('Balance change is zero');
    return undefined;
  }

  return {
    previousBalance,
    newBalance,
    difference,
    isDecrease,
  };
}

/**
 * Normalize a return value.
 * @param value - The return value to normalize.
 * @returns The normalized return value.
 */
function normalizeReturnValue(value: Hex): Hex {
  return toHex(hexToBN(value));
}
