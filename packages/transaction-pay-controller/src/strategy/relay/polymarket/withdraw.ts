import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_POLYGON } from '../../../constants';
import { projectLogger } from '../../../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../../types';
import { getPolymarketRelayerUrl } from '../../../utils/feature-flags';
import { getLiveTokenBalance } from '../../../utils/token';
import type { RelayQuote, RelayTransactionStep } from '../types';
import {
  encodeApprove,
  encodeUnwrap,
  encodeWrap,
  extractErc20TransferRecipient,
} from './calldata';
import {
  DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON,
  POLYMARKET_BATCH_DEADLINE_SECONDS,
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
  PUSD_ADDRESS_POLYGON,
  USDC_E_ADDRESS_POLYGON,
} from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import { PolymarketRelayerApi } from './relayer-api';
import type {
  PolymarketRelayerSubmitRequest,
  PolymarketWalletCall,
} from './types';
import { buildWalletBatchTypedData } from './wallet-batch-typed-data';

const log = createModuleLogger(projectLogger, 'polymarket-withdraw');

const POLYGON_CHAIN_ID_NUMBER = 137;

const WALLET_BUSY_RETRY_ATTEMPTS = 5;
const WALLET_BUSY_RETRY_DELAY_MS = 3_000;

export async function submitPolymarketWithdraw(
  quote: TransactionPayQuote<RelayQuote>,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<{ sourceHash: Hex }> {
  const depositWalletAddress = computeDepositWalletAddress(from);
  const relayDepositAddress = extractRelayDepositAddress(quote.original);
  const amount = BigInt(quote.sourceAmount.raw);

  log('Submitting unwrap batch to Relay deposit address', {
    depositWalletAddress,
    relayDepositAddress,
    amount: amount.toString(),
  });

  const relayerApi = new PolymarketRelayerApi(getPolymarketRelayerUrl(messenger));

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

  return { sourceHash: result.relayerTransactionHash };
}

export async function sweepPolymarketDepositWallet(
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const depositWalletAddress = computeDepositWalletAddress(from);

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

  const relayerApi = new PolymarketRelayerApi(getPolymarketRelayerUrl(messenger));

  try {
    const result = await submitDepositWalletBatch({
      from,
      depositWalletAddress,
      calls: [
        {
          target: USDC_E_ADDRESS_POLYGON,
          value: 0n,
          data: encodeApprove(
            POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
            usdceBalance,
          ),
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

async function submitDepositWalletBatch({
  from,
  depositWalletAddress,
  calls,
  messenger,
  relayerApi,
}: {
  from: Hex;
  depositWalletAddress: Hex;
  calls: PolymarketWalletCall[];
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
  calls: PolymarketWalletCall[];
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

  return {
    relayerTransactionHash: terminalStatus.transactionHash as Hex,
  };
}

function extractRelayDepositAddress(relayQuote: RelayQuote): Hex {
  const depositStep = relayQuote.steps.find((step) => step.id === 'deposit');

  if (!depositStep || depositStep.kind !== 'transaction') {
    throw new Error(
      'Polymarket deposit wallet withdraw: Relay quote has no deposit step',
    );
  }

  const transactionStep = depositStep as RelayTransactionStep;
  const depositCallData = transactionStep.items[0]?.data?.data;

  if (!depositCallData) {
    throw new Error(
      'Polymarket deposit wallet withdraw: Relay quote deposit step is missing calldata',
    );
  }

  return extractErc20TransferRecipient(depositCallData);
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
