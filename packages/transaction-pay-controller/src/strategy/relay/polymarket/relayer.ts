import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../../logger';
import type { TransactionPayControllerMessenger } from '../../../types';
import {
  DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
  POLYMARKET_BATCH_DEADLINE_SECONDS,
  POLYMARKET_RELAYER_TERMINAL_STATES,
  POLYMARKET_WALLET_DOMAIN_NAME,
  POLYMARKET_WALLET_DOMAIN_VERSION,
} from './constants';
import {
  PolymarketRelayerError,
  getNonce,
  getTransactionStatus,
  submitRelayerRequest,
} from './relayer-api';
import type {
  PolymarketRelayerState,
  PolymarketRelayerStatusResponse,
  PolymarketRelayerSubmitRequest,
  PolymarketWalletCall,
} from './types';

const log = createModuleLogger(projectLogger, 'polymarket-relayer');

const POLYGON_CHAIN_ID_NUMBER = 137;

const POLLING_INTERVAL_MS = 2000;
const POLLING_MAX_ATTEMPTS = 90;

const WALLET_BUSY_RETRY_ATTEMPTS = 5;
const WALLET_BUSY_RETRY_DELAY_MS = 3_000;

const EIP712_DOMAIN_FIELDS = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

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
  let lastError: unknown;

  for (let attempt = 1; attempt <= WALLET_BUSY_RETRY_ATTEMPTS; attempt++) {
    try {
      return await submitDepositWalletBatchOnce(messenger, {
        from,
        depositWalletAddress,
        calls,
      });
    } catch (error) {
      lastError = error;

      const message = error instanceof Error ? error.message : String(error);
      const isWalletBusy =
        message.toLowerCase().includes('wallet busy') ||
        message.toLowerCase().includes('active action');

      if (!isWalletBusy || attempt === WALLET_BUSY_RETRY_ATTEMPTS) {
        throw error;
      }

      log('Wallet busy, retrying', {
        attempt,
        delayMs: WALLET_BUSY_RETRY_DELAY_MS,
      });

      await delay(WALLET_BUSY_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

async function submitDepositWalletBatchOnce(
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

  const submitResponse = await submitRelayerRequest(messenger, submitRequest);

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

function isTerminalState(state: PolymarketRelayerState): boolean {
  return (POLYMARKET_RELAYER_TERMINAL_STATES as readonly string[]).includes(
    state,
  );
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
