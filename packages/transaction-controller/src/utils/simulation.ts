/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jsdoc/require-jsdoc */

import type { LogDescription, Result } from '@ethersproject/abi';
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
  SimulationLog,
  SimulationRequestTransaction,
  SimulationResponse,
  SimulationResponseCallTrace,
} from './simulation-api';
import { simulateTransactions } from './simulation-api';

const log = createModuleLogger(projectLogger, 'simulation');

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
  data: Record<string, Hex>;
  abi: any;
};

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

    log('Simulation response', response);

    const nativeBalanceChange = getNativeBalanceChange(request.from, response);
    const events = getEvents(response);

    log('Parsed events', events);

    const tokenBalanceChanges = events.length
      ? await getTokenBalanceChanges(request, events)
      : [];

    return {
      nativeBalanceChange,
      tokenBalanceChanges,
    };
  } catch (error) {
    log('Failed to get simulation data', error, request);
    return undefined;
  }
}

function getNativeBalanceChange(
  userAddress: Hex,
  response: SimulationResponse,
): SimulationBalanceChange | undefined {
  /* istanbul ignore next */
  const { stateDiff } = response.transactions[0] ?? {
    stateDiff: { pre: {}, post: {} },
  };

  const previousBalance = stateDiff.pre[userAddress]?.balance;
  const newBalance = stateDiff.post[userAddress]?.balance;

  if (!previousBalance || !newBalance) {
    return undefined;
  }

  const differenceBN = hexToBN(newBalance).sub(hexToBN(previousBalance));
  const isDecrease = differenceBN.isNeg();
  const difference = toHex(differenceBN.abs());

  return {
    previousBalance,
    newBalance,
    difference,
    isDecrease,
  };
}

function getEvents(response: SimulationResponse): ParsedEvent[] {
  /* istanbul ignore next */
  const logs = getLogs(response.transactions[0]?.callTrace ?? {});

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
      const inputs = event.abi.find((e: any) => e.name === event.name)?.inputs;

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
        data: args,
        abi: event.abi,
      };
    })
    .filter((e) => e !== undefined) as ParsedEvent[];
}

function parseEventArgs(args: Result, abiInputs: { name: string }[]) {
  return args.reduce((result, arg, index) => {
    const name = abiInputs[index].name.replace('_', '');
    const value = parseEventArgValue(arg);

    result[name] = value;

    return result;
  }, {});
}

function parseEventArgValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(parseEventArgValue);
  }

  let parsedValue = value;

  if (parsedValue.toHexString) {
    parsedValue = value.toHexString();
  }

  return parsedValue.toLowerCase();
}

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

  if (response.transactions.length !== balanceTransactions.length * 2 + 1) {
    throw new Error('Invalid response from simulation API');
  }

  log('Balance simulation response', response);

  return [...balanceTransactionsByToken.keys()].map((token, index) => {
    const previousBalance = response.transactions[index].return;

    const newBalance =
      response.transactions[index + balanceTransactions.length + 1].return;

    const differenceBN = hexToBN(newBalance).sub(hexToBN(previousBalance));
    const isDecrease = differenceBN.isNeg();
    const difference = toHex(differenceBN.abs());

    return {
      ...token,
      previousBalance,
      newBalance,
      difference,
      isDecrease,
    };
  });
}

function getTokenBalanceTransactions(
  request: GetSimulationDataRequest,
  events: ParsedEvent[],
): Map<SimulationToken, SimulationRequestTransaction> {
  const tokenKeys = new Set();

  return events.reduce((result, event) => {
    if (
      !['Transfer', 'TransferSingle', 'TransferBatch'].includes(event.name) ||
      ![event.data.from, event.data.to].includes(request.from)
    ) {
      log('Ignoring event', event);
      return result;
    }

    let tokenIds: (Hex | undefined)[] = [undefined];

    if (event.tokenStandard === SimulationTokenStandard.erc721) {
      tokenIds = [event.data.tokenId];
    }

    if (
      event.tokenStandard === SimulationTokenStandard.erc1155 &&
      event.name === 'TransferSingle'
    ) {
      tokenIds = [event.data.id];
    }

    if (
      event.tokenStandard === SimulationTokenStandard.erc1155 &&
      event.name === 'TransferBatch'
    ) {
      tokenIds = event.data.ids as unknown as Hex[];
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

function parseLog(
  eventLog: SimulationLog,
  erc20: Interface,
  erc721: Interface,
  erc1155: Interface,
):
  | (LogDescription & { abi: any; standard: SimulationTokenStandard })
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
      // Intentionally empty
    }
  }

  return undefined;
}

function getLogs(call: SimulationResponseCallTrace): SimulationLog[] {
  /* istanbul ignore next */
  const logs = call.logs ?? [];

  /* istanbul ignore next */
  const nestedCalls = call.calls ?? [];

  return [
    ...logs,
    ...nestedCalls.map((nestedCall) => getLogs(nestedCall)).flat(),
  ];
}
