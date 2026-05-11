import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_POLYGON } from '../../../constants';
import { projectLogger } from '../../../logger';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../../types';
import { getLiveTokenBalance } from '../../../utils/token';
import type {
  RelayQuote,
  RelayQuoteRequest,
  RelayTransactionStep,
} from '../types';
import {
  encodeApprove,
  encodeUnwrap,
  encodeWrap,
  extractErc20TransferRecipient,
} from './calldata';
import {
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
  PUSD_ADDRESS_POLYGON,
  USDC_E_ADDRESS_POLYGON,
} from './constants';
import { computeDepositWalletAddress } from './deposit-wallet';
import { submitDepositWalletBatch } from './relayer-api';

const log = createModuleLogger(projectLogger, 'polymarket-withdraw');

const WALLET_BUSY_RETRY_ATTEMPTS = 5;
const WALLET_BUSY_RETRY_DELAY_MS = 3_000;

export function applyPolymarketDepositWalletOverrides(
  body: RelayQuoteRequest,
  request: QuoteRequest,
): void {
  const depositWalletAddress = computeDepositWalletAddress(request.from);

  body.originCurrency = USDC_E_ADDRESS_POLYGON;
  body.user = depositWalletAddress;
  body.refundTo = depositWalletAddress;
  body.useDepositAddress = true;
}

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

  const { transactionHash } = await submitWithBusyRetry(messenger, {
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
  });

  return { sourceHash: transactionHash };
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

  try {
    const { transactionHash } = await submitWithBusyRetry(messenger, {
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
    });

    log('USDC.e sweep: complete', { transactionHash });
  } catch (error) {
    log('USDC.e sweep: batch submission failed', { error });
  }
}

async function submitWithBusyRetry(
  messenger: TransactionPayControllerMessenger,
  args: Parameters<typeof submitDepositWalletBatch>[1],
): Promise<{ transactionHash: Hex }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= WALLET_BUSY_RETRY_ATTEMPTS; attempt++) {
    try {
      return await submitDepositWalletBatch(messenger, args);
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
