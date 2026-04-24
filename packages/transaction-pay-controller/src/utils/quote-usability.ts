import type { Hex, Json } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types';
import {
  getNativeToken,
  getTokenBalance,
  normalizeTokenAddress,
  TokenAddressTarget,
} from './token';

export type QuoteUsabilityReason =
  | 'requires_authorization_list'
  | 'requires_origin_gas'
  | 'insufficient_native_gas';

export type QuoteUsabilityResult =
  | { usable: true }
  | {
      reason: QuoteUsabilityReason;
      usable: false;
    };

type NativeRequirement = {
  balanceRaw?: string;
  from: Hex;
  nativeGasRaw: BigNumber;
  nativeTokenAddress: Hex;
  sourceChainId: Hex;
  totalRaw: BigNumber;
};

/**
 * Check whether quotes are usable by the current account context.
 *
 * @param request - Request object.
 * @param request.messenger - Controller messenger.
 * @param request.quotes - Quotes to check.
 * @returns Whether the quotes are usable.
 */
export function checkQuoteUsability({
  messenger,
  quotes,
}: {
  messenger: TransactionPayControllerMessenger;
  quotes: TransactionPayQuote<Json>[];
}): QuoteUsabilityResult {
  if (quotes.some(requiresAuthorizationList)) {
    return { usable: false, reason: 'requires_authorization_list' };
  }

  const nativeRequirements = getNativeRequirements(messenger, quotes);

  for (const requirement of nativeRequirements.values()) {
    const balanceRaw = toBigNumber(requirement.balanceRaw);

    if (balanceRaw.isLessThan(requirement.totalRaw)) {
      return {
        usable: false,
        reason: requirement.nativeGasRaw.isGreaterThan(0)
          ? 'requires_origin_gas'
          : 'insufficient_native_gas',
      };
    }
  }

  return { usable: true };
}

function getNativeRequirements(
  messenger: TransactionPayControllerMessenger,
  quotes: TransactionPayQuote<Json>[],
): Map<string, NativeRequirement> {
  const requirements = new Map<string, NativeRequirement>();

  for (const quote of quotes) {
    const { from, sourceChainId, sourceTokenAddress } = quote.request;
    const nativeTokenAddress = getNativeToken(sourceChainId);
    const normalizedSourceTokenAddress = normalizeTokenAddress(
      sourceTokenAddress,
      sourceChainId,
      TokenAddressTarget.MetaMask,
    );
    const isSourceNative =
      normalizedSourceTokenAddress.toLowerCase() ===
      nativeTokenAddress.toLowerCase();

    const nativeGasRaw = quote.fees.isSourceGasFeeToken
      ? new BigNumber(0)
      : toBigNumber(quote.fees.sourceNetwork.max.raw);
    const sourceAmountRaw = isSourceNative
      ? toBigNumber(quote.sourceAmount.raw)
      : new BigNumber(0);
    const totalRaw = nativeGasRaw.plus(sourceAmountRaw);

    if (totalRaw.isLessThanOrEqualTo(0)) {
      continue;
    }

    const key = `${from.toLowerCase()}:${sourceChainId.toLowerCase()}`;
    const existing = requirements.get(key);
    const requirement = existing ?? {
      from,
      nativeGasRaw: new BigNumber(0),
      nativeTokenAddress,
      sourceChainId,
      totalRaw: new BigNumber(0),
    };

    requirement.nativeGasRaw = requirement.nativeGasRaw.plus(nativeGasRaw);
    requirement.totalRaw = requirement.totalRaw.plus(totalRaw);

    if (isSourceNative) {
      requirement.balanceRaw = quote.request.sourceBalanceRaw;
    } else {
      requirement.balanceRaw ??= getTokenBalance(
        messenger,
        from,
        sourceChainId,
        nativeTokenAddress,
      );
    }

    requirements.set(key, requirement);
  }

  return requirements;
}

function requiresAuthorizationList(quote: TransactionPayQuote<Json>): boolean {
  const { original } = quote;

  if (!isRecord(original)) {
    return false;
  }

  const { metamask } = original;

  return isRecord(metamask) && metamask.requiresAuthorizationList === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toBigNumber(value: BigNumber.Value | undefined): BigNumber {
  const result = new BigNumber(value ?? 0);

  return result.isFinite() ? result : new BigNumber(0);
}
