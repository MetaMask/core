import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_POLYGON } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getPolymarketRelayerUrl } from '../../utils/feature-flags';
import { getLiveTokenBalance } from '../../utils/token';
import { updateTransaction } from '../../utils/transaction';
import { getRelayStatus } from '../relay/relay-api';
import type { RelayQuote, RelayTransactionStep } from '../relay/types';
import {
  DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
  POLYMARKET_BATCH_DEADLINE_SECONDS,
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
  PUSD_ADDRESS_POLYGON,
  USDC_E_ADDRESS_POLYGON,
} from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import {
  encodeApprove,
  encodeUnwrap,
  encodeWrap,
  extractErc20TransferRecipient,
} from './polymarket-calldata';
import { PolymarketRelayerApi } from './relayer-api';
import type {
  PolymarketBridgeQuote,
  PolymarketBridgeRelayerSubmitRequest,
  PolymarketBridgeWalletCall,
} from './types';
import { buildWalletBatchTypedData } from './wallet-batch-typed-data';

const log = createModuleLogger(projectLogger, 'polymarket-bridge-submit');

const POLYGON_CHAIN_ID_NUMBER = 137;

const WALLET_BUSY_RETRY_ATTEMPTS = 5;
const WALLET_BUSY_RETRY_DELAY_MS = 3_000;

const RELAY_STATUS_POLL_INTERVAL_MS = 5_000;
const RELAY_STATUS_POLL_MAX_ATTEMPTS = 120;

type RelayPollOutcome =
  | { kind: 'success'; targetHash: Hex }
  | { kind: 'refunded' }
  | { kind: 'failure' }
  | { kind: 'timeout' };

export async function submitPolymarketBridgeQuote(
  request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
): Promise<{ transactionHash?: Hex }> {
  const quote = request.quotes[0];
  if (!quote) {
    throw new Error('Polymarket bridge submit: no quote provided');
  }

  markIntentComplete(request, quote);

  const from = quote.request.from;
  const depositWalletAddress = computeDepositWalletAddress(from);
  const relayerApi = new PolymarketRelayerApi(
    getPolymarketRelayerUrl(request.messenger),
  );

  const sourceHash = await submitUnwrapToRelayDepositAddress({
    quote,
    from,
    depositWalletAddress,
    messenger: request.messenger,
    relayerApi,
  });

  updateSourceHash(request, sourceHash);

  const relayOutcome = await pollRelayStatusUntilTerminal(
    getRelayRequestId(quote.original.relayQuote),
  );
  log('Relay polling complete', { kind: relayOutcome.kind });

  await sweepDepositWalletUsdce({
    messenger: request.messenger,
    from,
    depositWalletAddress,
    relayerApi,
  });

  if (relayOutcome.kind === 'success') {
    return { transactionHash: relayOutcome.targetHash };
  }

  return { transactionHash: sourceHash };
}

async function submitUnwrapToRelayDepositAddress({
  quote,
  from,
  depositWalletAddress,
  messenger,
  relayerApi,
}: {
  quote: TransactionPayQuote<PolymarketBridgeQuote>;
  from: Hex;
  depositWalletAddress: Hex;
  messenger: TransactionPayControllerMessenger;
  relayerApi: PolymarketRelayerApi;
}): Promise<Hex> {
  const relayDepositAddress = extractRelayDepositAddress(
    quote.original.relayQuote,
  );
  const amount = BigInt(quote.sourceAmount.raw);

  log('Submitting unwrap batch to Relay deposit address', {
    depositWalletAddress,
    relayDepositAddress,
    amount: amount.toString(),
  });

  const result = await submitDepositWalletBatch({
    from,
    depositWalletAddress,
    calls: [
      {
        target: PUSD_ADDRESS_POLYGON,
        value: 0n,
        data: encodeApprove(POLYMARKET_COLLATERAL_OFFRAMP_POLYGON, amount),
      },
      {
        target: POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
        value: 0n,
        data: encodeUnwrap({
          asset: USDC_E_ADDRESS_POLYGON,
          recipient: relayDepositAddress,
          amount,
        }),
      },
    ],
    messenger,
    relayerApi,
  });

  return result.relayerTransactionHash;
}

async function sweepDepositWalletUsdce({
  messenger,
  from,
  depositWalletAddress,
  relayerApi,
}: {
  messenger: TransactionPayControllerMessenger;
  from: Hex;
  depositWalletAddress: Hex;
  relayerApi: PolymarketRelayerApi;
}): Promise<void> {
  let usdceBalance: bigint;
  try {
    const raw = await getLiveTokenBalance(
      messenger,
      depositWalletAddress,
      CHAIN_ID_POLYGON,
      USDC_E_ADDRESS_POLYGON,
    );
    usdceBalance = BigInt(raw);
  } catch (error) {
    log('USDC.e sweep: failed to read deposit wallet balance', { error });
    return;
  }

  log('USDC.e sweep: deposit wallet balance', {
    depositWalletAddress,
    balance: usdceBalance.toString(),
  });

  if (usdceBalance === 0n) {
    log('USDC.e sweep: nothing to wrap');
    return;
  }

  try {
    const result = await submitDepositWalletBatch({
      from,
      depositWalletAddress,
      calls: [
        {
          target: USDC_E_ADDRESS_POLYGON,
          value: 0n,
          data: encodeApprove(POLYMARKET_COLLATERAL_ONRAMP_POLYGON, usdceBalance),
        },
        {
          target: POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
          value: 0n,
          data: encodeWrap({
            asset: USDC_E_ADDRESS_POLYGON,
            recipient: depositWalletAddress,
            amount: usdceBalance,
          }),
        },
      ],
      messenger,
      relayerApi,
    });

    log('USDC.e sweep: complete', {
      transactionHash: result.relayerTransactionHash,
    });
  } catch (error) {
    log('USDC.e sweep: batch submission failed', { error });
  }
}

export async function submitDepositWalletBatch({
  from,
  depositWalletAddress,
  calls,
  messenger,
  relayerApi,
}: {
  from: Hex;
  depositWalletAddress: Hex;
  calls: PolymarketBridgeWalletCall[];
  messenger: TransactionPayControllerMessenger;
  relayerApi: PolymarketRelayerApi;
}): Promise<{ relayerTransactionHash: Hex }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= WALLET_BUSY_RETRY_ATTEMPTS; attempt++) {
    try {
      return await submitDepositWalletBatchOnce({
        from,
        depositWalletAddress,
        calls,
        messenger,
        relayerApi,
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

async function submitDepositWalletBatchOnce({
  from,
  depositWalletAddress,
  calls,
  messenger,
  relayerApi,
}: {
  from: Hex;
  depositWalletAddress: Hex;
  calls: PolymarketBridgeWalletCall[];
  messenger: TransactionPayControllerMessenger;
  relayerApi: PolymarketRelayerApi;
}): Promise<{ relayerTransactionHash: Hex }> {
  const nonce = await relayerApi.getNonce(from, 'WALLET');
  const deadline =
    Math.floor(Date.now() / 1000) + POLYMARKET_BATCH_DEADLINE_SECONDS;

  const typedData = buildWalletBatchTypedData({
    wallet: depositWalletAddress,
    nonce,
    deadline,
    calls,
    chainId: POLYGON_CHAIN_ID_NUMBER,
  });

  const signature = (await messenger.call(
    'KeyringController:signTypedMessage',
    {
      from,
      data: JSON.stringify(typedData),
    },
    SignTypedDataVersion.V4,
  )) as Hex;

  const submitRequest: PolymarketBridgeRelayerSubmitRequest = {
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

  const submitResponse = await relayerApi.submit(submitRequest);
  log('Relayer accepted submission', {
    transactionID: submitResponse.transactionID,
    state: submitResponse.state,
  });

  const terminalStatus = await relayerApi.pollUntilTerminal(
    submitResponse.transactionID,
  );

  if (
    terminalStatus.state === 'STATE_FAILED' ||
    terminalStatus.state === 'STATE_INVALID'
  ) {
    throw new Error(
      `Polymarket bridge withdraw failed: relayer state=${terminalStatus.state}, txId=${submitResponse.transactionID}`,
    );
  }

  if (!terminalStatus.transactionHash) {
    throw new Error(
      `Polymarket bridge withdraw: terminal state=${terminalStatus.state} but no transactionHash`,
    );
  }

  log('Wallet batch complete', {
    transactionHash: terminalStatus.transactionHash,
    state: terminalStatus.state,
  });

  return {
    relayerTransactionHash: terminalStatus.transactionHash as Hex,
  };
}

async function pollRelayStatusUntilTerminal(
  requestId: string,
): Promise<RelayPollOutcome> {
  for (let attempt = 0; attempt < RELAY_STATUS_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      const status = await getRelayStatus(requestId);
      log('Relay status', {
        attempt,
        status: status.status,
        txHashes: status.txHashes,
      });

      if (status.status === 'success' && status.txHashes?.length) {
        return {
          kind: 'success',
          targetHash: status.txHashes[status.txHashes.length - 1] as Hex,
        };
      }

      if (status.status === 'refunded') {
        return { kind: 'refunded' };
      }

      if (status.status === 'failure') {
        return { kind: 'failure' };
      }
    } catch (error) {
      log('Relay status poll error', { attempt, error });
    }

    await delay(RELAY_STATUS_POLL_INTERVAL_MS);
  }

  return { kind: 'timeout' };
}

function extractRelayDepositAddress(relayQuote: RelayQuote): Hex {
  const depositStep = relayQuote.steps.find((step) => step.id === 'deposit');

  if (!depositStep || depositStep.kind !== 'transaction') {
    throw new Error(
      'Polymarket bridge submit: Relay quote has no deposit step',
    );
  }

  const transactionStep = depositStep as RelayTransactionStep;
  const depositCallData = transactionStep.items[0]?.data?.data;

  if (!depositCallData) {
    throw new Error(
      'Polymarket bridge submit: Relay quote deposit step is missing calldata',
    );
  }

  return extractErc20TransferRecipient(depositCallData);
}

function getRelayRequestId(relayQuote: RelayQuote): string {
  const requestId = relayQuote.steps[0]?.requestId;
  if (!requestId) {
    throw new Error('Polymarket bridge submit: Relay quote has no requestId');
  }
  return requestId;
}

function markIntentComplete(
  request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
  quote: TransactionPayQuote<PolymarketBridgeQuote>,
): void {
  updateTransaction(
    {
      transactionId: request.transaction.id,
      messenger: request.messenger,
      note: 'Mark intent complete at Polymarket bridge execute start',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );
  void quote;
}

function updateSourceHash(
  request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
  sourceHash: Hex,
): void {
  updateTransaction(
    {
      transactionId: request.transaction.id,
      messenger: request.messenger,
      note: 'Add source hash from Polymarket relayer',
    },
    (tx) => {
      tx.metamaskPay ??= {};
      tx.metamaskPay.sourceHash = sourceHash;
    },
  );
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
