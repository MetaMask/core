import { JsonRpcProvider } from '@ethersproject/providers';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';

const log = createModuleLogger(projectLogger, 'simulation-api');

const RPC_METHOD = 'infura_simulateTransactions';

const URLS_BY_CHAIN_ID: Record<Hex, string> = {
  '0x1': 'https://tx-sentinel-ethereum-mainnet.api.cx.metamask.io/',
  '0x5': 'https://tx-sentinel-ethereum-goerli.api.cx.metamask.io/',
};

export type SimulationRequestTransaction = {
  from: Hex;
  to?: Hex;
  value?: Hex;
  data?: Hex;
};

export type SimulationRequest = {
  transactions: SimulationRequestTransaction[];
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

export type SimulationLog = {
  address: Hex;
  data: Hex;
  topics: Hex[];
};

export type SimulationResponseCallTrace = {
  calls: SimulationResponseCallTrace[];
  logs: SimulationLog[];
};

export type SimulationResponse = {
  transactions: {
    return: Hex;
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

/**
 * Simulate transactions using the transaction simulation API.
 * @param chainId - The chain ID to simulate transactions on.
 * @param request - The request to simulate transactions.
 */
export async function simulateTransactions(
  chainId: Hex,
  request: SimulationRequest,
): Promise<SimulationResponse> {
  const url = URLS_BY_CHAIN_ID[chainId];

  if (!url) {
    log('Chain is not supported', chainId);
    throw new Error(`Chain is not supported: ${chainId}`);
  }

  log('Sending request', url, request);

  const jsonRpc = new JsonRpcProvider(url);
  const response = await jsonRpc.send(RPC_METHOD, [request]);

  log('Received response', response);

  return response;
}
