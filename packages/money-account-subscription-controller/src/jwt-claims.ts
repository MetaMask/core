import { base64ToBytes, bytesToString, isPlainObject } from '@metamask/utils';

import type {
  MoneyAccountEntitlements,
  MoneyAccountPlusJwtClaim,
  MoneyAccountProductEntitlementsJwtClaim,
} from './types.js';

function decodeBase64Url(value: string): string | null {
  try {
    return bytesToString(
      base64ToBytes(
        value
          .replace(/-/gu, '+')
          .replace(/_/gu, '/')
          .padEnd(value.length + ((4 - (value.length % 4)) % 4), '='),
      ),
    );
  } catch {
    return null;
  }
}

function isMoneyAccountEntitlements(
  value: unknown,
): value is MoneyAccountEntitlements {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.swapFeeWaiver === 'boolean' &&
    typeof value.perpsFeeWaiver === 'boolean' &&
    typeof value.predictFreeTx === 'boolean' &&
    typeof value.premiumApy === 'boolean'
  );
}

function isMoneyAccountPlusJwtClaim(
  value: unknown,
): value is MoneyAccountPlusJwtClaim {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.plan === 'string' &&
    isMoneyAccountEntitlements(value.entitlements)
  );
}

function isMoneyAccountProductEntitlementsJwtClaim(
  value: unknown,
): value is MoneyAccountProductEntitlementsJwtClaim {
  return (
    isPlainObject(value) && isMoneyAccountPlusJwtClaim(value.moneyAccountPlus)
  );
}

export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const decodedPayload = decodeBase64Url(parts[1]);
  if (!decodedPayload) {
    return null;
  }

  try {
    const payload = JSON.parse(decodedPayload);
    return isPlainObject(payload) ? payload : null;
  } catch {
    return null;
  }
}

export function getMoneyAccountPlusClaimFromBearerToken(
  token: string,
  claimKey: string,
): MoneyAccountPlusJwtClaim | null {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return null;
  }

  const claim = payload[claimKey];
  if (!isMoneyAccountProductEntitlementsJwtClaim(claim)) {
    return null;
  }

  return claim.moneyAccountPlus;
}
