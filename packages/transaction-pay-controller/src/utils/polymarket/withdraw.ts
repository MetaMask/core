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
} from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../../types.js';
import { getLiveTokenBalance } from '../token.js';
import type { QuoteSimulation } from '../validation.js';
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

/**
 * A deposit-wallet Predict withdraw, funded by unwrapping pUSD from the
 * deposit wallet straight to the provider's deposit address.
 */
export type DepositWalletWithdrawRequest = {
  /** Calldata of the provider deposit step, an ERC-20 transfer to the deposit address. */
  depositData: Hex | undefined;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  sourceAmountRaw: string;
};

type DepositWalletCall = { target: Hex; data: Hex };

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
 * Only applies to the Safe variant on deposit-style routes: the source token
 * lives in the Safe (carried as `request.refundTo`), and swap-only routes keep
 * the EOA `from` because DEX aggregators reject contract callers.
 *
 * @param request - Quote request.
 * @param transaction - Original transaction metadata.
 * @param hasDepositStep - Whether the quote routes through a deposit step.
 * @returns The Safe proxy address, or `undefined` when the default EOA `from`
 * should be used.
 */
export function getPredictWithdrawSafeAddress(
  request: QuoteRequest,
  transaction: TransactionMeta,
  hasDepositStep: boolean,
): Hex | undefined {
  if (
    !hasDepositStep ||
    request.isPolymarketDepositWallet ||
    !isPredictWithdraw(request, transaction)
  ) {
    return undefined;
  }

  return request.refundTo;
}

/**
 * Resolve the account holding the source token for gas-fee-token lookups.
 *
 * Unlike {@link getPredictWithdrawSafeAddress} this applies to every Predict
 * withdraw route: the source token lives in the Safe and the EOA is empty until
 * the Safe call runs mid-batch.
 *
 * @param request - Quote request.
 * @param transaction - Original transaction metadata.
 * @returns The Safe proxy address, or `undefined` for other flows.
 */
export function getPredictWithdrawFeeTokenAccount(
  request: QuoteRequest,
  transaction: TransactionMeta,
): Hex | undefined {
  return isPredictWithdraw(request, transaction) ? request.refundTo : undefined;
}

/**
 * Resolve the quote overrides for a deposit-wallet Predict withdraw. The deposit
 * wallet is both the sender and the refund address, and the provider is funded
 * with the USDC.e produced by unwrapping pUSD.
 *
 * @param from - The user EOA that owns the deposit wallet.
 * @param messenger - Controller messenger.
 * @returns The deposit wallet and the source token to quote.
 */
export async function getPolymarketDepositWalletOverrides(
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<{ depositWallet: Hex; sourceTokenAddress: Hex }> {
  return {
    depositWallet: await getDepositWalletAddress(messenger, from),
    sourceTokenAddress: POLYGON_USDCE_ADDRESS,
  };
}

/**
 * Build the simulation for a deposit-wallet Predict withdraw, mirroring the
 * batch broadcast by {@link submitPolymarketWithdraw}.
 *
 * @param request - Withdraw request.
 * @returns Simulation for the approve + unwrap batch from the deposit wallet.
 */
export async function buildPolymarketDepositWalletSimulation(
  request: DepositWalletWithdrawRequest,
): Promise<QuoteSimulation> {
  const depositWallet = await getDepositWalletAddress(
    request.messenger,
    request.from,
  );

  return {
    transactions: buildUnwrapCalls(request).map((call) => ({
      data: call.data,
      from: depositWallet,
      to: call.target,
      value: '0x0',
    })),
  };
}

/**
 * Unwrap the deposit wallet's pUSD straight to the provider deposit address.
 *
 * @param request - Withdraw request.
 * @returns The batch hash, and the USDC.e balance before submission so a
 * later sweep can detect a refund.
 */
export async function submitPolymarketWithdraw(
  request: DepositWalletWithdrawRequest,
): Promise<{ sourceHash: Hex; preSubmitUsdceBalance: bigint }> {
  const { from, messenger } = request;
  const depositWallet = await getDepositWalletAddress(messenger, from);
  const calls = buildUnwrapCalls(request);

  const preSubmitUsdceBalance = await readUsdceBalanceOrZero(
    messenger,
    depositWallet,
  );

  log('Submitting unwrap batch to deposit address', {
    depositWallet,
    preSubmitUsdceBalance: preSubmitUsdceBalance.toString(),
    sourceAmountRaw: request.sourceAmountRaw,
  });

  const result = await submitDepositWalletBatch(messenger, {
    calls: calls.map((call) => ({ ...call, value: '0' })),
    depositWallet,
    eoa: from,
  });

  return { ...result, preSubmitUsdceBalance };
}

/**
 * Wrap any USDC.e left on the deposit wallet back into pUSD, such as a refund
 * from a failed withdraw.
 *
 * @param options - Sweep options.
 * @param options.from - The user EOA that owns the deposit wallet.
 * @param options.isRefund - Whether the provider refunded the withdraw, in which
 * case the sweep waits for the refunded balance to land.
 * @param options.messenger - Controller messenger.
 * @param options.preSubmitUsdceBalance - USDC.e balance before the withdraw.
 */
export async function sweepPolymarketDepositWallet({
  from,
  isRefund,
  messenger,
  preSubmitUsdceBalance,
}: {
  from: Hex;
  isRefund: boolean;
  messenger: TransactionPayControllerMessenger;
  preSubmitUsdceBalance: bigint;
}): Promise<void> {
  const waitForBalanceAbove = isRefund ? preSubmitUsdceBalance : undefined;

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

/**
 * Build the approve + unwrap batch that moves a deposit wallet's pUSD to the
 * provider deposit address as USDC.e. Shared by the simulation and the real
 * submit so both model the exact same calls.
 *
 * @param request - Withdraw request.
 * @param request.depositData - Calldata of the provider deposit step.
 * @param request.sourceAmountRaw - Amount of pUSD to unwrap.
 * @returns The two `{ target, data }` calls.
 */
function buildUnwrapCalls({
  depositData,
  sourceAmountRaw,
}: DepositWalletWithdrawRequest): DepositWalletCall[] {
  if (!depositData) {
    throw new Error(
      'Polymarket deposit wallet withdraw: quote has no deposit step calldata',
    );
  }

  const depositAddress = extractErc20TransferRecipient(depositData);
  const amount = BigInt(sourceAmountRaw);

  return [
    {
      target: POLYGON_PUSD_ADDRESS,
      data: encodeApprove(POLYMARKET_COLLATERAL_OFFRAMP_POLYGON, amount),
    },
    {
      target: POLYMARKET_COLLATERAL_OFFRAMP_POLYGON,
      data: encodeUnwrap({
        asset: POLYGON_USDCE_ADDRESS,
        recipient: depositAddress,
        amount,
      }),
    },
  ];
}
