import {
  TransactionType,
  hasTransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import {
  CHAIN_ID_POLYGON,
  POLYGON_PUSD_ADDRESS,
  POLYGON_USDCE_ADDRESS,
} from '../../../constants.js';
import { projectLogger } from '../../../logger.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../../types.js';
import { getLiveTokenBalance } from '../../../utils/token.js';
import type { QuoteSimulation } from '../../../utils/validation.js';
import type {
  RelayQuote,
  RelayQuoteRequest,
  RelayStatus,
  RelayTransactionStep,
} from '../types.js';
import {
  encodeApprove,
  encodeUnwrap,
  encodeWrap,
  extractErc20TransferRecipient,
} from './calldata.js';
import {
  POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
  POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
  SWEEP_BALANCE_RETRY_ATTEMPTS,
  SWEEP_BALANCE_RETRY_DELAY_MS,
  SWEEP_RELAYER_SETTLE_DELAY_MS,
} from './constants.js';

const log = createModuleLogger(projectLogger, 'polymarket-withdraw');

type RelayQuoteStep = RelayQuote['steps'][number];

/**
 * Whether a quote request + transaction represent a Predict withdraw post-quote
 * flow.
 *
 * @param request - Quote request.
 * @param transaction - Original transaction metadata.
 * @returns True when this is a Predict withdraw post-quote flow.
 */
export function isPredictWithdraw(
  request: QuoteRequest,
  transaction: TransactionMeta,
): boolean {
  return Boolean(
    request.isPostQuote &&
    hasTransactionType(transaction, [TransactionType.predictWithdraw]),
  );
}

/**
 * Resolve the Polymarket Safe proxy address that must act as `msg.sender` when
 * estimating gas for the withdraw leg of a Safe-based Predict withdraw.
 *
 * Only applies to the Safe variant on deposit-style Relay routes: the source
 * token lives in the Safe (carried as `request.refundTo`), and swap-only routes
 * keep the EOA `from` because DEX aggregators reject contract callers.
 *
 * @param request - Quote request.
 * @param steps - Relay quote steps (used to detect a deposit-style route).
 * @param transaction - Original transaction metadata.
 * @returns The Safe proxy address, or `undefined` when the default EOA `from`
 * should be used.
 */
export function getPredictWithdrawSafeAddress(
  request: QuoteRequest,
  steps: RelayQuoteStep[],
  transaction: TransactionMeta,
): Hex | undefined {
  if (!isPredictWithdraw(request, transaction)) {
    return undefined;
  }

  // Deposit-wallet withdraws are validated via their own simulation builder;
  // `request.refundTo` is not the deposit wallet for that variant.
  if (request.isPolymarketDepositWallet) {
    return undefined;
  }

  const hasDepositStep = steps.some((step) => step.id === 'deposit');

  if (!hasDepositStep) {
    return undefined;
  }

  return request.refundTo;
}

/**
 * Build the simulation for a Polymarket deposit-wallet Predict withdraw,
 * mirroring the approve + unwrap batch broadcast by {@link submitPolymarketWithdraw}
 * so validation checks the deposit wallet holds enough pUSD.
 *
 * @param quote - Relay quote (source amount + deposit step).
 * @param from - The user EOA that owns the deposit wallet.
 * @param messenger - Controller messenger.
 * @returns Simulation for the approve + unwrap batch from the deposit wallet.
 */
export async function buildPolymarketDepositWalletSimulation(
  quote: TransactionPayQuote<RelayQuote>,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<QuoteSimulation> {
  const depositWalletAddress = await getDepositWalletAddress(messenger, from);
  const relayDepositAddress = extractRelayDepositAddress(quote.original);
  const amount = BigInt(quote.sourceAmount.raw);

  return {
    transactions: buildDepositWalletUnwrapCalls(
      relayDepositAddress,
      amount,
    ).map((call) => ({
      from: depositWalletAddress,
      to: call.target,
      data: call.data,
      value: '0x0',
    })),
  };
}

export async function applyPolymarketDepositWalletOverrides(
  body: Omit<RelayQuoteRequest, 'amount' | 'tradeType'>,
  request: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const depositWalletAddress = await getDepositWalletAddress(
    messenger,
    request.from,
  );

  body.originCurrency = POLYGON_USDCE_ADDRESS;
  body.user = depositWalletAddress;
  body.refundTo = depositWalletAddress;
  body.useDepositAddress = true;
  body.strict = true;
}

export async function submitPolymarketWithdraw(
  quote: TransactionPayQuote<RelayQuote>,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<{ sourceHash: Hex; preSubmitUsdceBalance: bigint }> {
  const depositWalletAddress = await getDepositWalletAddress(messenger, from);
  const relayDepositAddress = extractRelayDepositAddress(quote.original);
  const amount = BigInt(quote.sourceAmount.raw);

  const preSubmitUsdceBalance = await readUsdceBalanceOrZero(
    messenger,
    depositWalletAddress,
  );

  log('Submitting unwrap batch to Relay deposit address', {
    depositWalletAddress,
    relayDepositAddress,
    amount: amount.toString(),
    preSubmitUsdceBalance: preSubmitUsdceBalance.toString(),
  });

  const result = await submitDepositWalletBatch(messenger, {
    eoa: from,
    depositWallet: depositWalletAddress,
    calls: buildDepositWalletUnwrapCalls(relayDepositAddress, amount).map(
      (call) => ({ ...call, value: '0' }),
    ),
  });

  return { ...result, preSubmitUsdceBalance };
}

export async function sweepPolymarketDepositWallet(
  from: Hex,
  messenger: TransactionPayControllerMessenger,
  options: {
    relayStatus: RelayStatus | 'timeout';
    preSubmitUsdceBalance: bigint;
  },
): Promise<void> {
  const isRefund =
    options.relayStatus === 'refund' || options.relayStatus === 'refunded';
  const waitForBalanceAbove = isRefund
    ? options.preSubmitUsdceBalance
    : undefined;

  const depositWalletAddress = await getDepositWalletAddress(messenger, from);
  const usdceBalance = await readDepositWalletUsdceBalance(
    messenger,
    depositWalletAddress,
    waitForBalanceAbove,
  );

  if (usdceBalance === undefined) {
    return;
  }

  if (usdceBalance === 0n) {
    log('USDC.e sweep: nothing to wrap');
    return;
  }

  if (waitForBalanceAbove !== undefined && usdceBalance > waitForBalanceAbove) {
    log('USDC.e sweep: waiting for relayer RPC to catch up to new balance');
    await new Promise((resolve) =>
      setTimeout(resolve, SWEEP_RELAYER_SETTLE_DELAY_MS),
    );
  }

  try {
    await submitDepositWalletBatch(messenger, {
      eoa: from,
      depositWallet: depositWalletAddress,
      calls: [
        {
          target: POLYGON_USDCE_ADDRESS,
          value: '0',
          data: encodeApprove(
            POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
            usdceBalance,
          ),
        },
        {
          target: POLYMARKET_COLLATERAL_ONRAMP_POLYGON,
          value: '0',
          data: encodeWrap({
            asset: POLYGON_USDCE_ADDRESS,
            recipient: depositWalletAddress,
            amount: usdceBalance,
          }),
        },
      ],
    });
  } catch (error) {
    log('USDC.e sweep: batch submission failed', { error });
  }
}

async function readUsdceBalanceOrZero(
  messenger: TransactionPayControllerMessenger,
  depositWalletAddress: Hex,
): Promise<bigint> {
  try {
    const raw = await getLiveTokenBalance(
      messenger,
      depositWalletAddress,
      CHAIN_ID_POLYGON,
      POLYGON_USDCE_ADDRESS,
    );
    return BigInt(raw);
  } catch (error) {
    log('USDC.e balance read failed, defaulting to zero', { error });
    return 0n;
  }
}

async function readDepositWalletUsdceBalance(
  messenger: TransactionPayControllerMessenger,
  depositWalletAddress: Hex,
  waitForBalanceAbove: bigint | undefined,
): Promise<bigint | undefined> {
  const shouldRetry = waitForBalanceAbove !== undefined;
  const maxAttempts = shouldRetry ? SWEEP_BALANCE_RETRY_ATTEMPTS : 1;
  let lastBalance = 0n;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, SWEEP_BALANCE_RETRY_DELAY_MS),
      );
    }

    try {
      const raw = await getLiveTokenBalance(
        messenger,
        depositWalletAddress,
        CHAIN_ID_POLYGON,
        POLYGON_USDCE_ADDRESS,
      );
      lastBalance = BigInt(raw);
    } catch (error) {
      log('USDC.e sweep: failed to read deposit wallet balance', { error });
      return undefined;
    }

    log('USDC.e sweep: deposit wallet balance', {
      depositWalletAddress,
      balance: lastBalance.toString(),
      attempt,
      waitForBalanceAbove: waitForBalanceAbove?.toString(),
    });

    const hasIncreased =
      waitForBalanceAbove === undefined || lastBalance > waitForBalanceAbove;

    if (hasIncreased) {
      return lastBalance;
    }
  }

  return lastBalance;
}

async function getDepositWalletAddress(
  messenger: TransactionPayControllerMessenger,
  eoa: Hex,
): Promise<Hex> {
  const depositWalletAddress = await messenger.call(
    'TransactionPayController:polymarketGetDepositWalletAddress',
    { eoa },
  );
  log('Polymarket callback: getDepositWalletAddress', {
    eoa,
    depositWalletAddress,
  });
  return depositWalletAddress;
}

async function submitDepositWalletBatch(
  messenger: TransactionPayControllerMessenger,
  params: {
    eoa: Hex;
    depositWallet: Hex;
    calls: { target: Hex; data: Hex; value: string }[];
  },
): Promise<{ sourceHash: Hex }> {
  log('Polymarket callback: submitDepositWalletBatch', {
    eoa: params.eoa,
    depositWallet: params.depositWallet,
    callCount: params.calls.length,
  });
  const result = await messenger.call(
    'TransactionPayController:polymarketSubmitDepositWalletBatch',
    params,
  );
  log('Polymarket callback: submitDepositWalletBatch returned', {
    sourceHash: result.sourceHash,
  });
  return result;
}

function extractRelayDepositAddress(relayQuote: RelayQuote): Hex {
  const depositStep = relayQuote.steps.find((step) => step.id === 'deposit');

  if (depositStep?.kind !== 'transaction') {
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

/**
 * Build the approve + unwrap batch that moves a deposit wallet's pUSD to the
 * Relay deposit address as USDC.e. Shared by the simulation and the real submit
 * so both model the exact same calls.
 *
 * @param relayDepositAddress - The Relay deposit address that receives the
 * unwrapped USDC.e.
 * @param amount - The pUSD amount to unwrap.
 * @returns The two `{ target, data }` calls.
 */
function buildDepositWalletUnwrapCalls(
  relayDepositAddress: Hex,
  amount: bigint,
): { target: Hex; data: Hex }[] {
  return [
    {
      target: POLYGON_PUSD_ADDRESS,
      data: encodeApprove(POLYMARKET_COLLATERAL_OFFRAMP_POLYGON, amount),
    },
    {
      target: POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
      data: encodeUnwrap({
        asset: POLYGON_USDCE_ADDRESS,
        recipient: relayDepositAddress,
        amount,
      }),
    },
  ];
}
