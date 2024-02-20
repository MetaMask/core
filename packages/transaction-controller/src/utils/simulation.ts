/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jsdoc/require-jsdoc */

import type { LogDescription } from '@ethersproject/abi';
import { Interface } from '@ethersproject/abi';
import { JsonRpcProvider } from '@ethersproject/providers';
import { hexToBN, toHex } from '@metamask/controller-utils';
import { abiERC20, abiERC721, abiERC1155 } from '@metamask/metamask-eth-abis';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  SimulationBalanceChanges,
  SimulationData,
  SimulationEvents,
} from '../types';

const log = createModuleLogger(projectLogger, 'simulation');

const RPC_METHOD = 'infura_simulateTransactions';

const URLS_BY_CHAIN_ID: Record<Hex, string> = {
  '0x1': 'https://tx-sentinel-ethereum-mainnet.api.cx.metamask.io/',
  '0x5': 'https://tx-sentinel-ethereum-goerli.api.cx.metamask.io/',
};

type SimulationRequest = {
  transactions: {
    from: string;
    to?: string;
    value?: string;
    data?: string;
  }[];
  overrides?: {
    [address: Hex]: {
      stateDiff: {
        [slot: Hex]: Hex;
      };
    };
  };
  withCallTrace?: boolean;
  withLogs?: boolean;
};

type SimulationLog = {
  address: Hex;
  data: Hex;
  topics: Hex[];
};

type SimulationResponseCallTrace = {
  calls: SimulationResponseCallTrace[];
  logs: SimulationLog[];
};

type SimulationResponse = {
  transactions: {
    callTrace: SimulationResponseCallTrace;
    stateDiff: {
      pre: {
        [address: Hex]: {
          balance?: Hex;
          nonce?: Hex;
          storage?: {
            [slot: Hex]: Hex;
          };
        };
      };
      post: {
        [address: Hex]: {
          balance?: Hex;
          nonce?: Hex;
          storage?: {
            [slot: Hex]: Hex;
          };
        };
      };
    };
  }[];
};

export async function getSimulationData({
  chainId,
  from,
  to,
  value,
  data,
}: {
  chainId: Hex;
  from: string;
  to?: string;
  value?: string;
  data?: string;
}): Promise<SimulationData> {
  const response = await simulateTransactions(chainId, {
    transactions: [{ from, to, value, data }],
    withCallTrace: true,
    withLogs: true,
  });

  const balanceChanges = getBalanceChanges(response);
  const events = getEvents(response);

  return {
    balanceChanges,
    events,
  };
}

function getBalanceChanges(
  response: SimulationResponse,
): SimulationBalanceChanges {
  const { stateDiff } = response.transactions[0] ?? { pre: {}, post: {} };

  return Object.keys(stateDiff.pre).reduce((result, address) => {
    const addressHex = address as Hex;
    const before = stateDiff.pre[addressHex].balance;
    const after = stateDiff.post[addressHex].balance;

    if (!before || !after) {
      return result;
    }

    const differenceBN = hexToBN(after).sub(hexToBN(before));
    const isDecrease = differenceBN.isNeg();
    const difference = toHex(differenceBN.abs());

    result[addressHex] = {
      before,
      after,
      difference,
      isDecrease,
    };

    return result;
  }, {} as SimulationBalanceChanges);
}

function getEvents(response: SimulationResponse): SimulationEvents {
  const logs = getLogs(response.transactions[0]?.callTrace);

  log('Extracted logs', logs);

  const erc20Interface = new Interface(abiERC20);
  const erc721Interface = new Interface(abiERC721);
  const erc1155Interface = new Interface(abiERC1155);

  return logs.reduce((result, currentLog) => {
    const event = parseLog(
      currentLog,
      erc20Interface,
      erc721Interface,
      erc1155Interface,
    );

    if (!event) {
      log('Failed to parse log', currentLog);
      return result;
    }

    const inputs = event.abi.find((e: any) => e.name === event.name)?.inputs;

    if (!inputs) {
      log('Failed to find inputs for event', event);
      return result;
    }

    const args = event.args.reduce(
      (argsResult, arg, index) => ({
        ...argsResult,
        [inputs[index].name.replace('_', '')]: (arg.toHexString
          ? arg.toHexString()
          : arg
        ).toLowerCase(),
      }),
      {},
    );

    const key = `${event.standard}${event.name}` as keyof SimulationEvents;

    result[key] = (result[key] as any) ?? [];

    (result[key] as any).push({
      contractAddress: currentLog.address,
      ...args,
    });

    return result;
  }, {} as SimulationEvents);
}

function parseLog(
  eventLog: SimulationLog,
  erc20: Interface,
  erc721: Interface,
  erc1155: Interface,
): (LogDescription & { abi: any; standard: string }) | undefined {
  try {
    return { ...erc20.parseLog(eventLog), abi: abiERC20, standard: 'erc20' };
  } catch (e) {
    // Intentionally empty
  }

  try {
    return { ...erc721.parseLog(eventLog), abi: abiERC721, standard: 'erc721' };
  } catch (e) {
    // Intentionally empty
  }

  try {
    return {
      ...erc1155.parseLog(eventLog),
      abi: abiERC1155,
      standard: 'erc1155',
    };
  } catch (e) {
    // Intentionally empty
  }

  return undefined;
}

function getLogs(call: SimulationResponseCallTrace): SimulationLog[] {
  const logs = call.logs ?? [];
  const nestedCalls = call.calls ?? [];

  return [
    ...logs,
    ...nestedCalls.map((nestedCall) => getLogs(nestedCall)).flat(),
  ];
}

async function simulateTransactions(
  chainId: Hex,
  request: SimulationRequest,
): Promise<SimulationResponse> {
  const url = URLS_BY_CHAIN_ID[chainId];

  if (!url) {
    throw new Error(`Chain does not support simulations: ${chainId}`);
  }

  const jsonRpc = new JsonRpcProvider(url);

  const response = await jsonRpc.send(RPC_METHOD, [request]);

  return response;
}
