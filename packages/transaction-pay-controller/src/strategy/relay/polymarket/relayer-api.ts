import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../../logger';
import type { TransactionPayControllerMessenger } from '../../../types';
import { getPolymarketRelayerUrl } from '../../../utils/feature-flags';
import {
  DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
  POLYMARKET_BATCH_DEADLINE_SECONDS,
  POLYMARKET_RELAYER_TERMINAL_STATES,
  POLYMARKET_WALLET_DOMAIN_NAME,
  POLYMARKET_WALLET_DOMAIN_VERSION,
} from './constants';
import type {
  PolymarketRelayerProxyEnvelope,
  PolymarketRelayerState,
  PolymarketRelayerStatusResponse,
  PolymarketRelayerSubmitRequest,
  PolymarketRelayerSubmitResponse,
  PolymarketWalletCall,
} from './types';

const log = createModuleLogger(projectLogger, 'polymarket-relayer-api');

const POLLING_INTERVAL_MS = 2000;
const POLLING_MAX_ATTEMPTS = 90;

const POLYGON_CHAIN_ID_NUMBER = 137;

const EIP712_DOMAIN_FIELDS = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

export class PolymarketRelayerError extends Error {
  code: string;

  raw: unknown;

  constructor(message: string, code: string, raw?: unknown) {
    super(message);
    this.name = 'PolymarketRelayerError';
    this.code = code;
    this.raw = raw;
  }
}

export async function getNonce(
  messenger: TransactionPayControllerMessenger,
  address: Hex,
): Promise<string> {
  const result = await postEnvelope<{ nonce: string }>(messenger, {
    path: '/nonce',
    method: 'GET',
    query: { address, type: 'WALLET' },
  });

  log('Nonce received', { address, nonce: result.nonce });
  return result.nonce;
}

export async function submitDepositWalletBatch(
  messenger: TransactionPayControllerMessenger,
  {
    from,
    depositWalletAddress,
    calls,
  }: {
    from: Hex;
    depositWalletAddress: Hex;
    calls: PolymarketWalletCall[];
  },
): Promise<{ transactionHash: Hex }> {
  const nonce = await getNonce(messenger, from);
  const deadline =
    Math.floor(Date.now() / 1000) + POLYMARKET_BATCH_DEADLINE_SECONDS;

  const typedData = buildWalletBatchTypedData({
    wallet: depositWalletAddress,
    nonce,
    deadline,
    calls,
  });

  const signature = (await messenger.call(
    'KeyringController:signTypedMessage',
    { from, data: JSON.stringify(typedData) },
    SignTypedDataVersion.V4,
  )) as Hex;

  const submitRequest: PolymarketRelayerSubmitRequest = {
    type: 'WALLET',
    from,
    to: DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
    nonce,
    signature,
    depositWalletParams: {
      depositWallet: depositWalletAddress,
      deadline: deadline.toString(),
      calls: calls.map((call) => ({
        target: call.target,
        value: call.value.toString(),
        data: call.data,
      })),
    },
  };

  const submitResponse = await postEnvelope<PolymarketRelayerSubmitResponse>(
    messenger,
    { path: '/submit', method: 'POST', body: submitRequest },
  );

  log('Relayer accepted submission', {
    transactionID: submitResponse.transactionID,
    state: submitResponse.state,
  });

  const terminalStatus = await pollUntilTerminal(
    messenger,
    submitResponse.transactionID,
  );

  if (
    terminalStatus.state === 'STATE_FAILED' ||
    terminalStatus.state === 'STATE_INVALID'
  ) {
    throw new Error(
      `Polymarket deposit wallet withdraw failed: relayer state=${terminalStatus.state}, txId=${submitResponse.transactionID}`,
    );
  }

  if (!terminalStatus.transactionHash) {
    throw new Error(
      `Polymarket deposit wallet withdraw: terminal state=${terminalStatus.state} but no transactionHash`,
    );
  }

  log('Wallet batch complete', {
    transactionHash: terminalStatus.transactionHash,
    state: terminalStatus.state,
  });

  return { transactionHash: terminalStatus.transactionHash as Hex };
}

async function getTransactionStatus(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<PolymarketRelayerStatusResponse[]> {
  const result = await postEnvelope<
    PolymarketRelayerStatusResponse | PolymarketRelayerStatusResponse[]
  >(messenger, {
    path: '/transaction',
    method: 'GET',
    query: { id: transactionId },
  });

  return Array.isArray(result) ? result : [result];
}

async function pollUntilTerminal(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<PolymarketRelayerStatusResponse> {
  for (let attempt = 0; attempt < POLLING_MAX_ATTEMPTS; attempt++) {
    await delay(POLLING_INTERVAL_MS);

    const statuses = await getTransactionStatus(messenger, transactionId);
    const latest = statuses[0];

    if (latest && isTerminalState(latest.state)) {
      log('Reached terminal state', {
        transactionId,
        state: latest.state,
        attempt: attempt + 1,
      });
      return latest;
    }

    log('Polling attempt', {
      transactionId,
      state: latest?.state,
      attempt: attempt + 1,
    });
  }

  throw new PolymarketRelayerError(
    `Polling timed out after ${POLLING_MAX_ATTEMPTS} attempts`,
    'POLLING_TIMEOUT',
  );
}

function buildWalletBatchTypedData({
  wallet,
  nonce,
  deadline,
  calls,
}: {
  wallet: Hex;
  nonce: string;
  deadline: number;
  calls: PolymarketWalletCall[];
}): {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: 'Batch';
  message: Record<string, unknown>;
} {
  return {
    domain: {
      name: POLYMARKET_WALLET_DOMAIN_NAME,
      version: POLYMARKET_WALLET_DOMAIN_VERSION,
      chainId: POLYGON_CHAIN_ID_NUMBER,
      verifyingContract: wallet,
    },
    types: {
      EIP712Domain: EIP712_DOMAIN_FIELDS,
      Batch: [
        { name: 'wallet', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'calls', type: 'Call[]' },
      ],
      Call: [
        { name: 'target', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
    },
    primaryType: 'Batch' as const,
    message: {
      wallet,
      nonce,
      deadline,
      calls: calls.map((call) => ({
        target: call.target,
        value: call.value.toString(),
        data: call.data,
      })),
    },
  };
}

async function postEnvelope<TResponse>(
  messenger: TransactionPayControllerMessenger,
  envelope: PolymarketRelayerProxyEnvelope,
): Promise<TResponse> {
  const url = `${getPolymarketRelayerUrl(messenger)}/transaction`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
  } catch (error) {
    throw new PolymarketRelayerError(
      `Relayer proxy request failed: ${String(error)}`,
      'REQUEST_FAILED',
      error,
    );
  }

  const text = await response.text();

  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      if (!response.ok) {
        throw new PolymarketRelayerError(
          `Relayer proxy returned ${response.status} with non-JSON body`,
          'HTTP_ERROR',
          error,
        );
      }
      throw new PolymarketRelayerError(
        'Relayer proxy returned malformed JSON',
        'MALFORMED_JSON',
        error,
      );
    }
  }

  if (!response.ok) {
    const detail =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { error?: string; message?: string }).error ??
          (parsed as { error?: string; message?: string }).message
        : undefined;

    throw new PolymarketRelayerError(
      detail ?? `Relayer proxy returned status ${response.status}`,
      'PROXY_ERROR',
      parsed,
    );
  }

  if (parsed === undefined) {
    throw new PolymarketRelayerError(
      'Relayer proxy returned an empty response',
      'EMPTY_RESPONSE',
    );
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'error' in parsed &&
    typeof (parsed as { error: unknown }).error === 'string'
  ) {
    throw new PolymarketRelayerError(
      (parsed as { error: string }).error,
      'PROXY_ERROR',
    );
  }

  return parsed as TResponse;
}

function isTerminalState(state: PolymarketRelayerState): boolean {
  return (POLYMARKET_RELAYER_TERMINAL_STATES as readonly string[]).includes(
    state,
  );
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
