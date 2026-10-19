import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { MfaRequirement, MfaWhitelistConfig } from './types.js';
import {
  decodeUtf8,
  isFresh,
  isSameHex,
  requireMfa,
  whitelisted,
} from './utils.js';

/** Signed by `MoneyAccountUpgradeController` to associate the address with CHOMP. */
const CHOMP_AUTHENTICATION_PATTERN =
  /^CHOMP Authentication (?<timestamp>\d{13})$/u;

/** Signed by Mobile's `RewardsController.registerMoneyAccountBinding`. */
const REWARDS_BINDING_PATTERN =
  /^metamask-rewards:money-account-binding:[^:\s]+:(?<address>0x[0-9a-f]{40}):(?<timestamp>\d{13})$/u;

/** Signed by Mobile's `CardController.linkMoneyAccountCard`. */
const CARD_SIGN_IN_PATTERN = new RegExp(
  [
    '^(?<domain>\\S+) wants you to sign in with your Ethereum account:',
    '(?<address>0x[0-9a-fA-F]{40})',
    '',
    'Prove address ownership',
    '',
    'URI: (?<uri>\\S+)',
    'Version: 1',
    'Chain ID: (?<chainId>\\d+)',
    'Nonce: \\S+',
    'Issued At: (?<issuedAt>\\S+)',
    'Expiration Time: (?<expirationTime>\\S+)$',
  ].join('\n'),
  'u',
);

type PersonalMessageContext = {
  address: Hex;
  config: MfaWhitelistConfig;
  maxMessageAge: number;
  now: number;
};

/**
 * Parses an ISO 8601 timestamp in the exact form `Date.prototype.toISOString`
 * produces.
 *
 * @param value - The timestamp.
 * @returns The time in milliseconds, or `undefined` if the value isn't in
 * that form.
 */
function parseIsoTimestamp(value: string): number | undefined {
  const time = Date.parse(value);
  if (Number.isNaN(time) || new Date(time).toISOString() !== value) {
    return undefined;
  }
  return time;
}

/**
 * Checks the card provider sign-in message. It only proves ownership of the
 * address; funding the card needs a separate approval, which requires MFA.
 *
 * @param groups - The named groups of {@link CARD_SIGN_IN_PATTERN}.
 * @param context - The request context.
 * @param context.address - The Money Account address.
 * @param context.config - The whitelist config.
 * @param context.maxMessageAge - The maximum message age in milliseconds.
 * @param context.now - The current time in milliseconds.
 * @returns Whether MFA is required.
 */
function getCardSignInRequirement(
  groups: Record<string, string>,
  { address, config, maxMessageAge, now }: PersonalMessageContext,
): MfaRequirement {
  const { cardSignInDomain } = config;
  if (!cardSignInDomain || groups.domain !== cardSignInDomain) {
    return requireMfa('Sign-in message is not for the card sign-in domain');
  }
  if (groups.uri !== `https://${cardSignInDomain}`) {
    return requireMfa('Sign-in message URI does not match its domain');
  }
  if (!isSameHex(groups.address, address)) {
    return requireMfa('Sign-in message is not for the Money Account');
  }
  if (groups.chainId !== String(hexToNumber(config.chainId))) {
    return requireMfa('Sign-in message is not for the Money Account chain');
  }

  const issuedAt = parseIsoTimestamp(groups.issuedAt);
  const expirationTime = parseIsoTimestamp(groups.expirationTime);
  if (
    issuedAt === undefined ||
    expirationTime === undefined ||
    !isFresh(issuedAt, now, maxMessageAge) ||
    expirationTime <= issuedAt ||
    expirationTime - issuedAt > maxMessageAge ||
    now > expirationTime
  ) {
    return requireMfa('Sign-in message is expired or not fresh');
  }

  return whitelisted('card-sign-in');
}

/**
 * Determines whether a personal message requires MFA.
 *
 * Whitelisted are the CHOMP authentication message, the card provider
 * sign-in message and the Rewards binding message, each with a fresh
 * timestamp. At worst, signing them without MFA lets someone tie the Money
 * Account to another CHOMP profile or Rewards subscription, which can deny
 * service but not move funds.
 *
 * @param message - The message as hex-encoded UTF-8.
 * @param context - The request context.
 * @returns Whether MFA is required.
 */
export function getPersonalMessageMfaRequirement(
  message: unknown,
  context: PersonalMessageContext,
): MfaRequirement {
  const text = decodeUtf8(message);
  if (text === undefined) {
    return requireMfa('Message is not hex-encoded UTF-8');
  }

  const { address, maxMessageAge, now } = context;

  const chomp = CHOMP_AUTHENTICATION_PATTERN.exec(text)?.groups;
  if (chomp) {
    return isFresh(Number(chomp.timestamp), now, maxMessageAge)
      ? whitelisted('chomp-authentication')
      : requireMfa('CHOMP authentication timestamp is not fresh');
  }

  const rewards = REWARDS_BINDING_PATTERN.exec(text)?.groups;
  if (rewards) {
    if (!isSameHex(rewards.address, address)) {
      return requireMfa('Rewards binding is not for the Money Account');
    }
    return isFresh(Number(rewards.timestamp), now, maxMessageAge)
      ? whitelisted('rewards-binding')
      : requireMfa('Rewards binding timestamp is not fresh');
  }

  const cardSignIn = CARD_SIGN_IN_PATTERN.exec(text)?.groups;
  if (cardSignIn) {
    return getCardSignInRequirement(cardSignIn, context);
  }

  return requireMfa('Message does not match a whitelisted format');
}
