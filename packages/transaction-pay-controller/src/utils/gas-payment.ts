import { toHex } from '@metamask/controller-utils';
import type {
  GasFeeToken,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../logger.js';
import type {
  Amount,
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../types.js';
import { getFeatureFlags, isEIP7702Chain } from './feature-flags.js';
import { calculateGasFeeTokenCost } from './gas.js';
import { getNativeToken, getTokenBalance } from './token.js';

const log = createModuleLogger(projectLogger, 'gas-payment');

export enum GasPaymentMode {
  /**
   * A relayer redeems a signed delegation and pays origin gas itself, so
   * nothing is submitted through the `TransactionController`.
   */
  Delegation = 'delegation',

  /** MetaMask sponsors origin gas through the EIP-7702 gas station hook. */
  Sponsored = 'sponsored',

  /**
   * The user pays origin gas in the source token, collected by the EIP-7702
   * gas station as a gas fee token.
   */
  GasFeeToken = 'gas-fee-token',

  /** The user pays origin gas in the chain's native token. */
  Native = 'native',
}

/**
 * Plain-language summary logged for each resolved {@link GasPaymentMode}.
 *
 * Phrased in the future tense because this is the payment MetaMask is about to
 * request, not one that has happened. For the modes that go through the
 * `TransactionController`, the outcome is only known after publish — see
 * {@link logGasPaymentOutcome}.
 *
 * Only emitted at submit time. See {@link resolveGasPayment} for why the
 * quote-time resolution is too provisional to report.
 */
const GAS_PAYMENT_MODE_LOG: Record<GasPaymentMode, string> = {
  [GasPaymentMode.Delegation]: 'Gas will be paid by relayer',
  [GasPaymentMode.GasFeeToken]: 'Gas will be paid with source token',
  [GasPaymentMode.Native]: 'Gas will be paid with native token',
  [GasPaymentMode.Sponsored]: 'Gas will be sponsored',
};

/**
 * Who pays origin gas, plus the `TransactionController` options that implement
 * it. Spread the options straight into `addTransaction` or
 * `addTransactionBatch`.
 */
export type GasPayment = {
  /**
   * Stop the `TransactionController` silently falling back to native gas when
   * a gas fee token is set. Always set in {@link GasPaymentMode.GasFeeToken},
   * because reaching that mode means the quote was priced with the gas fee
   * token and the user was shown that fee.
   */
  excludeNativeTokenForFee?: boolean;

  /**
   * Token to collect origin gas in. Only set in
   * {@link GasPaymentMode.GasFeeToken}.
   */
  gasFeeToken?: Hex;

  /**
   * Whether MetaMask sponsors origin gas. `true` in
   * {@link GasPaymentMode.Sponsored}. Otherwise `false` when sponsorship was
   * evaluated and rejected, or absent when the strategy never sponsors — the
   * `TransactionController` omits the flag entirely rather than recording
   * `false`, so the distinction is carried through.
   */
  isGasFeeSponsored?: boolean;

  /** The resolved mode. */
  mode: GasPaymentMode;
};

type GasPaymentRequest = {
  /**
   * Whether a relayer will redeem a signed delegation and pay origin gas
   * (Relay `/execute`, server `gasless`, HyperLiquid withdrawals).
   */
  isDelegated?: boolean;

  /**
   * Whether the quote priced origin gas in the source token. Leave `undefined`
   * at quote time, before the gas station has been consulted.
   */
  isSourceGasFeeToken?: boolean;

  /** Source token charged when paying with a gas fee token. */
  sourceTokenAddress: Hex;

  /**
   * Inputs for the MetaMask sponsorship check. Omit for strategies that never
   * sponsor, so `isGasFeeSponsored` is left unset rather than explicitly
   * disabled.
   */
  sponsorship?: SponsorshipRequest;
};

/** Origin gas priced in source-token units by the gas station. */
type GasStationCost = {
  /** The cost, when the gas station will collect gas in the source token. */
  amount?: Amount;

  /**
   * Whether the gas station was actually consulted, meaning every eligibility
   * gate passed. `false` means it was skipped, so an absent `amount` says
   * nothing about whether a fee token exists.
   */
  isAvailable: boolean;
};

type GasStationCostRequest = {
  /**
   * Whether the paying account can sign EIP-7702 authorizations. Omit when
   * unknown; only an explicit `false` blocks the gas station.
   */
  accountSupports7702?: boolean;

  /**
   * Account the gas station simulates the fee token transfer from. Defaults to
   * `request.from`. Predict withdrawals hold the source token in a Safe proxy,
   * so the probe must target the proxy rather than the still-empty EOA.
   */
  feeTokenAccount?: Hex;

  /** First origin-chain call, simulated to discover available fee tokens. */
  firstStepData: GasStationStepData;

  messenger: TransactionPayControllerMessenger;

  /**
   * Native gas cost the user would otherwise pay, in raw units. The gas
   * station is skipped when `request.from` already holds enough native token
   * to cover it. Omit to consult the gas station regardless of balance.
   */
  nativeGasCostRaw?: string;

  request: Pick<QuoteRequest, 'from' | 'sourceChainId' | 'sourceTokenAddress'>;

  /** Combined gas estimate across every origin-chain call. */
  totalGasEstimate: number;

  /** Number of origin-chain calls the estimate covers. */
  totalItemCount: number;
};

type GasStationStepData = {
  data: Hex;
  to: Hex;
  value?: string;
};

type SponsorshipRequest = {
  /** Whether the paying account can sign EIP-7702 authorizations. */
  accountSupports7702: boolean | undefined;

  request: Pick<QuoteRequest, 'sourceChainId' | 'targetChainId'>;

  transaction: Pick<TransactionMeta, 'chainId' | 'isGasFeeSponsored'>;
};

/**
 * Whether origin gas should be paid through the gas station.
 *
 * True only when the user cannot cover gas in native token *and* the gas
 * station can actually collect it on this chain. A `false` result therefore
 * means either "native balance covers it" or "the gas station is unavailable
 * here" — it does not mean the gas station was unnecessary. Cheap enough to
 * call before any network work, so it gates the expensive probe flow.
 *
 * @param request - Gas station check.
 * @param request.messenger - Controller messenger.
 * @param request.nativeGasCostRaw - Native gas cost the user would otherwise pay, in raw units.
 * @param request.request - Quote request fields identifying the payment.
 * @returns Whether the gas station should be used for origin gas.
 */
export function shouldUseGasStation({
  messenger,
  nativeGasCostRaw,
  request,
}: {
  messenger: TransactionPayControllerMessenger;
  nativeGasCostRaw: string | undefined;
  request: Pick<QuoteRequest, 'from' | 'sourceChainId'>;
}): boolean {
  const { isSufficient, nativeBalanceRaw } = checkNativeBalance({
    messenger,
    nativeGasCostRaw,
    request,
  });

  if (isSufficient) {
    log('Native balance is sufficient for gas', {
      nativeBalanceRaw,
      nativeGasCostRaw,
    });
    return false;
  }

  if (!canUseGasStation(messenger, request.sourceChainId)) {
    return false;
  }

  log('Requesting gas fee token as insufficient native token', {
    nativeBalanceRaw,
    nativeGasCostRaw,
    sourceChainId: request.sourceChainId,
  });

  return true;
}

/**
 * Whether the gas station can collect origin gas on a chain at all.
 *
 * Cheap enough to call before doing any work — it only reads feature flags.
 * Use it to skip an expensive code path that would otherwise end in
 * {@link resolveGasStationCost} returning nothing.
 *
 * @param messenger - Controller messenger.
 * @param sourceChainId - Origin chain of the payment.
 * @returns Whether the chain supports EIP-7702 and is not disabled.
 */
function canUseGasStation(
  messenger: TransactionPayControllerMessenger,
  sourceChainId: QuoteRequest['sourceChainId'],
): boolean {
  const { relayDisabledGasStationChains } = getFeatureFlags(messenger);

  if (relayDisabledGasStationChains.includes(sourceChainId)) {
    log('Gas station is disabled for chain', { sourceChainId });
    return false;
  }

  if (!isEIP7702Chain(messenger, sourceChainId)) {
    log('Gas station is unsupported on chain', { sourceChainId });
    return false;
  }

  return true;
}

/**
 * Resolve who pays origin gas.
 *
 * Applies the {@link GasPaymentMode} priority order, so a strategy only
 * declares which options are available rather than encoding the precedence
 * itself.
 *
 * Both stages use this. At quote time, call it without `isSourceGasFeeToken`
 * to find out whether anyone else covers gas before spending effort
 * estimating it. At submit time, call it with everything to get the
 * `TransactionController` options.
 *
 * Only the submit-time resolution is logged. At quote time the gas station has
 * not been consulted yet, so an absent `isSourceGasFeeToken` collapses to
 * {@link GasPaymentMode.Native} by default rather than by decision — logging
 * that would announce the user is paying gas in native token before anything
 * has ruled out the source token.
 *
 * @param request - Payment request.
 * @returns The resolved mode and its `TransactionController` options.
 */
export function resolveGasPayment(request: GasPaymentRequest): GasPayment {
  const gasPayment = getGasPayment(request);

  if (request.isSourceGasFeeToken !== undefined) {
    log(GAS_PAYMENT_MODE_LOG[gasPayment.mode], gasPayment);
  }

  return gasPayment;
}

/**
 * Log whether the `TransactionController` actually charged gas the way
 * {@link resolveGasPayment} asked it to.
 *
 * `resolveGasPayment` only logs the request. The `TransactionController` makes
 * its own decision at publish time and clears `selectedGasFeeToken` when it
 * declines, so without this the logs would claim the source token paid for gas
 * even when the user was billed in native token.
 *
 * Only meaningful for {@link GasPaymentMode.GasFeeToken}; every other mode
 * either bypasses the `TransactionController` or has nothing to contradict.
 *
 * @param gasPayment - The gas payment that was requested.
 * @param transactions - Final metadata of the submitted transactions.
 */
export function logGasPaymentOutcome(
  gasPayment: GasPayment,
  transactions: (
    | Pick<TransactionMeta, 'id' | 'selectedGasFeeToken'>
    | undefined
  )[],
): void {
  if (gasPayment.mode !== GasPaymentMode.GasFeeToken) {
    return;
  }

  const ignored = transactions.filter(
    (transaction) => transaction && !transaction.selectedGasFeeToken,
  );

  if (!ignored.length) {
    log('Gas was paid with source token', {
      gasFeeToken: gasPayment.gasFeeToken,
    });

    return;
  }

  log('Gas fee token was dropped, gas paid with native token instead', {
    gasFeeToken: gasPayment.gasFeeToken,
    transactionIds: ignored.map((transaction) => transaction?.id),
  });
}

function getGasPayment({
  isDelegated,
  isSourceGasFeeToken,
  sourceTokenAddress,
  sponsorship,
}: GasPaymentRequest): GasPayment {
  if (isDelegated) {
    return { mode: GasPaymentMode.Delegation };
  }

  const isSponsored = isSponsoredRoute(sponsorship);

  if (isSponsored) {
    return { isGasFeeSponsored: true, mode: GasPaymentMode.Sponsored };
  }

  // An absent flag and an explicit `false` are not equivalent to the
  // `TransactionController`, so only set it when sponsorship was evaluated.
  const unsponsored =
    isSponsored === undefined ? {} : { isGasFeeSponsored: isSponsored };

  if (isSourceGasFeeToken) {
    // Reaching this mode means the quote priced origin gas in the source token
    // and the user was shown that fee, so the `TransactionController` must not
    // quietly bill them in native token instead. Without this, it drops the
    // gas fee token whenever its own balance check says native covers the gas,
    // and that check uses a live balance and a per-transaction cost while the
    // quote used cached balances and a buffered cost across every origin call.
    return {
      ...unsponsored,
      excludeNativeTokenForFee: true,
      gasFeeToken: sourceTokenAddress,
      mode: GasPaymentMode.GasFeeToken,
    };
  }

  return { ...unsponsored, mode: GasPaymentMode.Native };
}

/**
 * Price origin gas in source-token units, applying every gas station
 * eligibility gate first.
 *
 * The gas station is skipped when the account cannot sign EIP-7702
 * authorizations, when the user already holds enough native token, or when the
 * chain is unsupported or disabled. Callers distinguish "gas station skipped"
 * from "gas station found no fee token" via {@link GasStationCost.isAvailable}.
 *
 * @param request - Cost request.
 * @param request.accountSupports7702 - Whether the account can sign EIP-7702 authorizations.
 * @param request.feeTokenAccount - Account the fee token transfer is simulated from.
 * @param request.firstStepData - First origin-chain call to simulate.
 * @param request.messenger - Controller messenger.
 * @param request.nativeGasCostRaw - Native gas cost the user would otherwise pay, in raw units.
 * @param request.request - Quote request fields identifying the payment.
 * @param request.totalGasEstimate - Combined gas estimate across every origin-chain call.
 * @param request.totalItemCount - Number of origin-chain calls the estimate covers.
 * @returns The resolved gas station cost.
 */
export async function resolveGasStationCost({
  accountSupports7702,
  feeTokenAccount,
  firstStepData,
  messenger,
  nativeGasCostRaw,
  request,
  totalGasEstimate,
  totalItemCount,
}: GasStationCostRequest): Promise<GasStationCost> {
  const { from, sourceChainId, sourceTokenAddress } = request;

  if (accountSupports7702 === false) {
    log('Skipping gas station as account does not support EIP-7702', { from });
    return { isAvailable: false };
  }

  const { isSufficient, nativeBalanceRaw } = checkNativeBalance({
    messenger,
    nativeGasCostRaw,
    request,
  });

  if (isSufficient) {
    log('Skipping gas station as native balance covers gas', {
      nativeBalanceRaw,
      nativeGasCostRaw,
      sourceChainId,
    });
    return { isAvailable: false };
  }

  if (!canUseGasStation(messenger, sourceChainId)) {
    return { isAvailable: false };
  }

  log('Requesting gas fee token as insufficient native token', {
    nativeBalanceRaw,
    nativeGasCostRaw,
    sourceChainId,
    sourceTokenAddress,
  });

  const amount = await getGasStationCostInSourceToken({
    feeTokenAccount: feeTokenAccount ?? from,
    firstStepData,
    messenger,
    sourceChainId,
    sourceTokenAddress,
    totalGasEstimate,
    totalItemCount,
  });

  return { amount, isAvailable: true };
}

async function getGasStationCostInSourceToken({
  feeTokenAccount,
  firstStepData,
  messenger,
  sourceChainId,
  sourceTokenAddress,
  totalGasEstimate,
  totalItemCount,
}: {
  feeTokenAccount: Hex;
  firstStepData: GasStationStepData;
  messenger: TransactionPayControllerMessenger;
  sourceChainId: Hex;
  sourceTokenAddress: Hex;
  totalGasEstimate: number;
  totalItemCount: number;
}): Promise<Amount | undefined> {
  const { data, to, value } = firstStepData;

  let gasFeeTokens: GasFeeToken[] | undefined;

  try {
    gasFeeTokens = await messenger.call(
      'TransactionController:getGasFeeTokens',
      {
        chainId: sourceChainId,
        data,
        from: feeTokenAccount,
        to,
        value: toHex(value ?? '0'),
      },
    );
  } catch (error) {
    log('Failed to estimate gas fee tokens', {
      error,
      sourceChainId,
    });
    return undefined;
  }

  const gasFeeToken = gasFeeTokens?.find(
    (singleGasFeeToken) =>
      singleGasFeeToken.tokenAddress.toLowerCase() ===
      sourceTokenAddress.toLowerCase(),
  );

  if (!gasFeeToken) {
    log('No matching source token in gas fee token estimate', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  log('Found gas fee token', {
    amount: gasFeeToken.amount,
    gas: gasFeeToken.gas,
    sourceChainId,
    sourceTokenAddress,
  });

  const gasFeeTokenWithNormalizedAmount = {
    ...gasFeeToken,
    amount: toHex(
      getNormalizedGasFeeTokenAmount({
        gasFeeToken,
        totalGasEstimate,
        totalItemCount,
      }),
    ),
  };

  const gasFeeTokenCost = calculateGasFeeTokenCost({
    chainId: sourceChainId,
    gasFeeToken: gasFeeTokenWithNormalizedAmount,
    messenger,
  });

  if (!gasFeeTokenCost) {
    log('Unable to calculate gas fee token cost using fiat rates', {
      sourceTokenAddress,
      sourceChainId,
    });
    return undefined;
  }

  log('Estimated gas station cost for source token', {
    amount: gasFeeTokenCost.raw,
    sourceTokenAddress,
    sourceChainId,
  });

  return gasFeeTokenCost;
}

function getNormalizedGasFeeTokenAmount({
  gasFeeToken,
  totalGasEstimate,
  totalItemCount,
}: {
  gasFeeToken: GasFeeToken;
  totalGasEstimate: number;
  totalItemCount: number;
}): string {
  let amount = new BigNumber(gasFeeToken.amount);

  if (totalItemCount > 1) {
    const gas = new BigNumber(gasFeeToken.gas);
    const gasFeeAmount = new BigNumber(gasFeeToken.amount);

    if (totalGasEstimate > 0 && gas.isGreaterThan(0)) {
      const gasRate = gasFeeAmount.dividedBy(gas);
      amount = gasRate.multipliedBy(totalGasEstimate);
    }
  }

  return amount.integerValue(BigNumber.ROUND_CEIL).toFixed(0);
}

/**
 * Read the account's native balance and compare it to a gas cost.
 *
 * The balance is returned alongside the verdict so callers can log what the
 * decision was actually based on. An undefined cost is never sufficient, since
 * an unknown gas cost cannot be shown to be covered.
 *
 * @param request - Balance check.
 * @param request.messenger - Controller messenger.
 * @param request.nativeGasCostRaw - Native gas cost to cover, in raw units.
 * @param request.request - Quote request fields identifying the payment.
 * @returns The raw native balance and whether it covers the cost.
 */
function checkNativeBalance({
  messenger,
  nativeGasCostRaw,
  request,
}: {
  messenger: TransactionPayControllerMessenger;
  nativeGasCostRaw: string | undefined;
  request: Pick<QuoteRequest, 'from' | 'sourceChainId'>;
}): { isSufficient: boolean; nativeBalanceRaw: string } {
  const { from, sourceChainId } = request;

  const nativeBalanceRaw = getTokenBalance(
    messenger,
    from,
    sourceChainId,
    getNativeToken(sourceChainId),
  );

  return {
    isSufficient:
      nativeGasCostRaw !== undefined &&
      new BigNumber(nativeBalanceRaw).isGreaterThanOrEqualTo(nativeGasCostRaw),
    nativeBalanceRaw,
  };
}

/**
 * Whether MetaMask sponsors origin gas for a route.
 *
 * Sponsorship runs through the EIP-7702 gas station hook, so it requires an
 * account that can sign authorizations and a payment that never leaves the
 * transaction's own chain.
 *
 * Returns `undefined` when there is nothing to evaluate, which callers keep
 * distinct from an explicit `false`.
 *
 * @param sponsorship - Sponsorship inputs, or `undefined` when the strategy never sponsors.
 * @returns Whether the route is sponsored.
 */
function isSponsoredRoute(
  sponsorship: SponsorshipRequest | undefined,
): boolean | undefined {
  if (!sponsorship) {
    return undefined;
  }

  const { accountSupports7702, request, transaction } = sponsorship;
  const { isGasFeeSponsored } = transaction;

  if (isGasFeeSponsored === undefined) {
    return undefined;
  }

  return (
    isGasFeeSponsored &&
    request.sourceChainId === transaction.chainId &&
    request.targetChainId === transaction.chainId &&
    Boolean(accountSupports7702)
  );
}
