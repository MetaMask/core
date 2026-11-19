import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  createAllowedCalldataTerms,
  createERC20TokenPeriodTransferTerms,
  createValueLteTerms,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  encodeTransferToCalldataPrefix,
  TRANSFER_CALLDATA_PREFIX_START_INDEX,
} from './caveats.js';
import {
  equalsIgnoreCase,
  makeMatchesSubscriptionDelegation,
  pickLatestMatchingSubscriptionDelegation,
} from './fingerprint.js';
import { CASH_SUBSCRIPTION_DELEGATION_TYPE } from './types.js';

const VALUE_LTE = '0x1111111111111111111111111111111111111111' as Hex;
const PERIOD = '0x2222222222222222222222222222222222222222' as Hex;
const TOKEN = '0x3333333333333333333333333333333333333333' as Hex;
const DELEGATE = '0x4444444444444444444444444444444444444444' as Hex;
const DELEGATOR = '0x5555555555555555555555555555555555555555' as Hex;
const ALLOWED_CALLDATA = '0x7777777777777777777777777777777777777777' as Hex;
const RECIPIENT = '0x8888888888888888888888888888888888888888' as Hex;
const CHAIN_ID = '0x1' as Hex;
const PERIOD_AMOUNT = 10n * 10n ** 18n;
const PERIOD_DURATION = 28 * 86_400;

function buildEntry({
  type = CASH_SUBSCRIPTION_DELEGATION_TYPE,
  delegator = DELEGATOR,
  delegate = DELEGATE,
  chainIdHex = CHAIN_ID,
  tokenAddress = TOKEN,
  periodAmount = PERIOD_AMOUNT,
  periodDuration = PERIOD_DURATION,
  startDate = 1_700_000_000,
  periodEnforcer = PERIOD,
  allowedCalldataEnforcer = ALLOWED_CALLDATA,
  recipient = RECIPIENT,
  calldataStartIndex = TRANSFER_CALLDATA_PREFIX_START_INDEX,
}: {
  type?: string;
  delegator?: Hex;
  delegate?: Hex;
  chainIdHex?: Hex;
  tokenAddress?: Hex;
  periodAmount?: bigint;
  periodDuration?: number;
  startDate?: number;
  periodEnforcer?: Hex;
  allowedCalldataEnforcer?: Hex;
  recipient?: Hex;
  calldataStartIndex?: number;
} = {}): DelegationResponse {
  const caveats = [
    {
      enforcer: periodEnforcer,
      terms: createERC20TokenPeriodTransferTerms({
        tokenAddress,
        periodAmount,
        periodDuration,
        startDate,
      }),
      args: '0x' as Hex,
    },
    {
      enforcer: allowedCalldataEnforcer,
      terms: createAllowedCalldataTerms({
        startIndex: calldataStartIndex,
        value: encodeTransferToCalldataPrefix(recipient),
      }),
      args: '0x' as Hex,
    },
  ];

  return {
    signedDelegation: {
      delegate,
      delegator,
      authority: ROOT_AUTHORITY,
      caveats,
      salt: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signature: `0x${'bb'.repeat(65)}`,
    },
    metadata: {
      delegationHash: `0x${'cc'.repeat(32)}`,
      chainIdHex,
      allowance: `0x${periodAmount.toString(16)}`,
      tokenSymbol: 'pvmUSD',
      tokenAddress,
      type,
    },
  };
}

const NOW_SECONDS = 1_700_000_000;

const expected = {
  delegatorAddress: DELEGATOR,
  delegateAddress: DELEGATE,
  recipientAddress: RECIPIENT,
  chainId: CHAIN_ID,
  tokenAddress: TOKEN,
  periodAmount: PERIOD_AMOUNT,
  periodDuration: PERIOD_DURATION,
  nowSeconds: NOW_SECONDS,
  expectedStartDate: NOW_SECONDS,
  enforcers: {
    erc20TokenPeriodTransfer: PERIOD,
    allowedCalldata: ALLOWED_CALLDATA,
  },
};

describe('equalsIgnoreCase', () => {
  it('compares hex case-insensitively', () => {
    expect(equalsIgnoreCase('0xAbC', '0xabc')).toBe(true);
    expect(equalsIgnoreCase('0xAbC', '0xabd')).toBe(false);
  });
});

describe('makeMatchesSubscriptionDelegation', () => {
  const matches = makeMatchesSubscriptionDelegation(expected);

  it('matches an equivalent stored delegation', () => {
    expect(matches(buildEntry())).toBe(true);
  });

  it('matches when startDate is earlier but still immediately redeemable', () => {
    expect(matches(buildEntry({ startDate: NOW_SECONDS - 86_400 }))).toBe(true);
  });

  it('rejects a trial-deferred startDate when start is immediately redeemable', () => {
    expect(matches(buildEntry({ startDate: NOW_SECONDS + 86_400 }))).toBe(
      false,
    );
  });

  it('matches a deferred startDate when start is trial-deferred', () => {
    const TRIAL_START = NOW_SECONDS + 14 * 86_400;
    const matchesTrial = makeMatchesSubscriptionDelegation({
      ...expected,
      expectedStartDate: TRIAL_START,
    });

    expect(matchesTrial(buildEntry({ startDate: NOW_SECONDS + 86_400 }))).toBe(
      true,
    );
  });

  it('rejects an immediately redeemable startDate when start is trial-deferred', () => {
    const TRIAL_START = NOW_SECONDS + 14 * 86_400;
    const matchesTrial = makeMatchesSubscriptionDelegation({
      ...expected,
      expectedStartDate: TRIAL_START,
    });

    expect(matchesTrial(buildEntry({ startDate: NOW_SECONDS }))).toBe(false);
  });

  const PAST_SKEW_SECONDS = 14 * 24 * 60 * 60;
  const FUTURE_SKEW_SECONDS = 5 * 60;

  it('matches a live startDate on the 14-day lower boundary', () => {
    expect(
      matches(buildEntry({ startDate: NOW_SECONDS - PAST_SKEW_SECONDS })),
    ).toBe(true);
  });

  it('rejects a live startDate older than 14 days', () => {
    expect(
      matches(buildEntry({ startDate: NOW_SECONDS - PAST_SKEW_SECONDS - 1 })),
    ).toBe(false);
  });

  it('matches a live startDate at the 5-minute future skew', () => {
    expect(
      matches(buildEntry({ startDate: NOW_SECONDS + FUTURE_SKEW_SECONDS })),
    ).toBe(true);
  });

  it('rejects a live startDate more than 5 minutes ahead', () => {
    expect(
      matches(buildEntry({ startDate: NOW_SECONDS + FUTURE_SKEW_SECONDS + 1 })),
    ).toBe(false);
  });

  it('rejects a non-positive startDate', () => {
    const entry = buildEntry();
    // createERC20TokenPeriodTransferTerms refuses to encode non-positive
    // startDate. Create a valid terms blob with startDate=1 then zero out the
    // trailing 32-byte startDate field (64 hex chars) so the terms decode
    // successfully but yield startDate = 0, exercising the storedStartDate <= 0
    // guard.
    const validTerms = createERC20TokenPeriodTransferTerms({
      tokenAddress: TOKEN,
      periodAmount: PERIOD_AMOUNT,
      periodDuration: PERIOD_DURATION,
      startDate: 1,
    });
    entry.signedDelegation.caveats[0].terms = `${validTerms.slice(
      0,
      -64,
    )}${'0'.repeat(64)}` as Hex;

    expect(matches(entry)).toBe(false);
  });

  it('matches a trial startDate one second after now', () => {
    const TRIAL_START = NOW_SECONDS + 14 * 86_400;
    const matchesTrial = makeMatchesSubscriptionDelegation({
      ...expected,
      expectedStartDate: TRIAL_START,
    });

    expect(matchesTrial(buildEntry({ startDate: NOW_SECONDS + 1 }))).toBe(true);
  });

  it('rejects a trial startDate beyond the 5-minute future skew', () => {
    const TRIAL_START = NOW_SECONDS + 14 * 86_400;
    const matchesTrial = makeMatchesSubscriptionDelegation({
      ...expected,
      expectedStartDate: TRIAL_START,
    });

    expect(
      matchesTrial(
        buildEntry({ startDate: TRIAL_START + FUTURE_SKEW_SECONDS + 1 }),
      ),
    ).toBe(false);
  });

  it('matches case-insensitively on addresses and chain id', () => {
    const upper = (value: Hex): Hex => {
      return `0x${value.slice(2).toUpperCase()}`;
    };

    expect(
      matches(
        buildEntry({
          delegator: upper(DELEGATOR),
          delegate: upper(DELEGATE),
          recipient: upper(RECIPIENT),
          tokenAddress: upper(TOKEN),
          chainIdHex: upper(CHAIN_ID),
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['type', { type: 'cash-deposit' }],
    ['delegator', { delegator: '0x6666666666666666666666666666666666666666' }],
    ['delegate', { delegate: '0x6666666666666666666666666666666666666666' }],
    ['chainId', { chainIdHex: '0x89' }],
    ['token', { tokenAddress: '0x6666666666666666666666666666666666666666' }],
    [
      'periodEnforcer',
      {
        periodEnforcer: '0x6666666666666666666666666666666666666666',
      },
    ],
    [
      'allowedCalldataEnforcer',
      {
        allowedCalldataEnforcer: '0x6666666666666666666666666666666666666666',
      },
    ],
    ['recipient', { recipient: '0x6666666666666666666666666666666666666666' }],
    ['calldataStartIndex', { calldataStartIndex: 4 }],
    ['periodAmount', { periodAmount: PERIOD_AMOUNT + 1n }],
    ['periodDuration', { periodDuration: PERIOD_DURATION + 1 }],
  ] as const)('rejects mismatch on %s', (_label, overrides) => {
    expect(matches(buildEntry(overrides))).toBe(false);
  });

  it('rejects a legacy delegation without the recipient restriction', () => {
    const entry = buildEntry();
    entry.signedDelegation.caveats.pop();

    expect(matches(entry)).toBe(false);
  });

  it('rejects a legacy delegation with an extra ValueLte caveat', () => {
    const entry = buildEntry();
    entry.signedDelegation.caveats.unshift({
      enforcer: VALUE_LTE,
      terms: createValueLteTerms({ maxValue: 0n }),
      args: '0x',
    });

    expect(matches(entry)).toBe(false);
  });

  it('rejects a delegation with missing caveats', () => {
    const entry = buildEntry();
    entry.signedDelegation.caveats = [];

    expect(matches(entry)).toBe(false);
  });

  it('rejects a delegation with malformed caveat terms', () => {
    const entry = buildEntry();
    entry.signedDelegation.caveats[0].terms = '0x';

    expect(matches(entry)).toBe(false);
  });
});

describe('pickLatestMatchingSubscriptionDelegation', () => {
  it('returns undefined when there are no matches', () => {
    expect(
      pickLatestMatchingSubscriptionDelegation([], expected.enforcers),
    ).toBeUndefined();
  });

  it('prefers the matching delegation with the latest period startDate', () => {
    const older = buildEntry({ startDate: NOW_SECONDS - 86_400 });
    older.metadata.delegationHash = `0x${'11'.repeat(32)}`;
    const newer = buildEntry({ startDate: NOW_SECONDS });
    newer.metadata.delegationHash = `0x${'22'.repeat(32)}`;

    expect(
      pickLatestMatchingSubscriptionDelegation(
        [older, newer],
        expected.enforcers,
      )?.metadata.delegationHash,
    ).toBe(newer.metadata.delegationHash);

    expect(
      pickLatestMatchingSubscriptionDelegation(
        [newer, older],
        expected.enforcers,
      )?.metadata.delegationHash,
    ).toBe(newer.metadata.delegationHash);
  });

  it('deprioritizes delegations whose period startDate cannot be read', () => {
    const withoutPeriodCaveat = buildEntry({ startDate: NOW_SECONDS + 86_400 });
    withoutPeriodCaveat.signedDelegation.caveats.splice(0, 1);
    withoutPeriodCaveat.metadata.delegationHash = `0x${'11'.repeat(32)}`;

    const malformedTerms = buildEntry({ startDate: NOW_SECONDS + 86_400 });
    malformedTerms.signedDelegation.caveats[0].terms = '0x';
    malformedTerms.metadata.delegationHash = `0x${'22'.repeat(32)}`;

    const readable = buildEntry({ startDate: NOW_SECONDS - 86_400 });
    readable.metadata.delegationHash = `0x${'33'.repeat(32)}`;

    expect(
      pickLatestMatchingSubscriptionDelegation(
        [withoutPeriodCaveat, malformedTerms, readable],
        expected.enforcers,
      )?.metadata.delegationHash,
    ).toBe(readable.metadata.delegationHash);
  });
});
