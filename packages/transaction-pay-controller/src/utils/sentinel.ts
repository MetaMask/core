import { hexToBigInt, createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { projectLogger } from '../logger';

const RPC_METHOD = 'infura_simulateTransactions';
const BASE_URL = 'https://tx-sentinel-{0}.api.cx.metamask.io/';
const ENDPOINT_NETWORKS = 'networks';

const log = createModuleLogger(projectLogger, 'sentinel');

type SentinelNetwork = {
  confirmations?: boolean;
  network: string;
};

type SentinelNetworkResponse = Record<string, SentinelNetwork>;

export type SentinelSimulationTransaction = {
  data?: Hex;
  from: Hex;
  gas?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  to?: Hex;
  value?: Hex;
};

export type SentinelSimulationRequest = {
  overrides?: Record<
    Hex,
    {
      code?: Hex;
      stateDiff?: Record<Hex, Hex>;
    }
  >;
  transactions: SentinelSimulationTransaction[];
  withCallTrace?: boolean;
  withGas?: boolean;
  withLogs?: boolean;
};

export type SentinelSimulationResponseTransaction = {
  callTrace?: SentinelSimulationCallTrace;
  error?: string;
  gasLimit?: Hex;
  gasUsed?: Hex;
};

export type SentinelSimulationCallTrace = {
  calls?: SentinelSimulationCallTrace[] | null;
  error?: string;
  output?: Hex;
};

export type SentinelSimulationResponse = {
  transactions: SentinelSimulationResponseTransaction[];
};

export class SentinelSimulationError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'SentinelSimulationError';
    this.code = code;
  }
}

export async function simulateTransactions(
  chainId: Hex,
  request: SentinelSimulationRequest,
): Promise<SentinelSimulationResponse> {
  const url = await getSimulationUrl(chainId);

  log('Simulation request', { chainId, request, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: '0',
      jsonrpc: '2.0',
      method: RPC_METHOD,
      params: [request],
    }),
  });
  const responseJson = await response.json();

  log('Simulation response', { chainId, responseJson });

  if (responseJson.error) {
    const { code, message } = responseJson.error;
    throw new SentinelSimulationError(message, code);
  }

  return responseJson.result;
}

async function getSimulationUrl(chainId: Hex): Promise<string> {
  const networkData = await getNetworkData();
  const network = networkData[Number(hexToBigInt(chainId)).toString(10)];

  if (!network?.confirmations) {
    throw new SentinelSimulationError(
      `Simulation is not supported for chain ${chainId}`,
    );
  }

  const url = getUrl(network.network);

  log('Resolved simulation URL', { chainId, network, url });

  return url;
}

async function getNetworkData(): Promise<SentinelNetworkResponse> {
  log('Fetching simulation networks');

  const response = await fetch(
    `${getUrl('ethereum-mainnet')}${ENDPOINT_NETWORKS}`,
  );
  const networkData = await response.json();

  log('Fetched simulation networks', { networkData });

  return networkData;
}

function getUrl(subdomain: string): string {
  return BASE_URL.replace('{0}', subdomain);
}
