import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  createERC20TokenPeriodTransferTerms,
  createRedeemerTerms,
  createValueLteTerms,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import {
  equalsIgnoreCase,
  makeMatchesSubscriptionDelegation,
} from './fingerprint.js';
import { CASH_SUBSCRIPTION_DELEGATION_TYPE } from './types.js';

const VALUE_LTE = '0x1111111111111111111111111111111111111111' as Hex;
const PERIOD = '0x2222222222222222222222222222222222222222' as Hex;
const REDEEMER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
const TOKEN = '0x3333333333333333333333333333333333333333' as Hex;
const DELEGATE = '0x4444444444444444444444444444444444444444' as Hex;
const DELEGATOR = '0x5555555555555555555555555555555555555555' as Hex;
const OTHER_REDEEMER = '0x6666666666666666666666666666666666666666' as Hex;
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
  valueLteEnforcer = VALUE_LTE,
  periodEnforcer = PERIOD,
  redeemerEnforcer = REDEEMER,
  redeemerAddress = DELEGATE,
  includeRedeemer = true,
  maxValue = 0n,
}: {
  type?: string;
  delegator?: Hex;
  delegate?: Hex;
  chainIdHex?: Hex;
  tokenAddress?: Hex;
  periodAmount?: bigint;
  periodDuration?: number;
  startDate?: number;
  valueLteEnforcer?: Hex;
  periodEnforcer?: Hex;
  redeemerEnforcer?: Hex;
  redeemerAddress?: Hex;
  includeRedeemer?: boolean;
  maxValue?: bigint;
} = {}): DelegationResponse {
  const caveats = [
    {
      enforcer: valueLteEnforcer,
      terms: createValueLteTerms({ maxValue }),
      args: '0x' as Hex,
    },
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
  ];

  if (includeRedeemer) {
    caveats.push({
      enforcer: redeemerEnforcer,
      terms: createRedeemerTerms({ redeemers: [redeemerAddress] }),
      args: '0x' as Hex,
    });
  }

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

const expected = {
  delegatorAddress: DELEGATOR,
  delegateAddress: DELEGATE,
  chainId: CHAIN_ID,
  tokenAddress: TOKEN,
  periodAmount: PERIOD_AMOUNT,
  periodDuration: PERIOD_DURATION,
  enforcers: {
    valueLte: VALUE_LTE,
    erc20TokenPeriodTransfer: PERIOD,
    redeemer: REDEEMER,
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

  it('matches when startDate differs', () => {
    expect(matches(buildEntry({ startDate: 1_800_000_000 }))).toBe(true);
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
          tokenAddress: upper(TOKEN),
          chainIdHex: upper(CHAIN_ID),
          redeemerAddress: upper(DELEGATE),
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['type', { type: 'cash-deposit' }],
    [
      'delegator',
      { delegator: '0x6666666666666666666666666666666666666666' as Hex },
    ],
    [
      'delegate',
      { delegate: '0x6666666666666666666666666666666666666666' as Hex },
    ],
    ['chainId', { chainIdHex: '0x89' as Hex }],
    [
      'token',
      { tokenAddress: '0x6666666666666666666666666666666666666666' as Hex },
    ],
    [
      'valueLteEnforcer',
      {
        valueLteEnforcer: '0x6666666666666666666666666666666666666666' as Hex,
      },
    ],
    [
      'periodEnforcer',
      {
        periodEnforcer: '0x6666666666666666666666666666666666666666' as Hex,
      },
    ],
    [
      'redeemerEnforcer',
      {
        redeemerEnforcer: '0x6666666666666666666666666666666666666666' as Hex,
      },
    ],
    ['redeemerAddress', { redeemerAddress: OTHER_REDEEMER }],
    ['periodAmount', { periodAmount: PERIOD_AMOUNT + 1n }],
    ['periodDuration', { periodDuration: PERIOD_DURATION + 1 }],
    ['maxValue', { maxValue: 1n }],
  ] as const)('rejects mismatch on %s', (_label, overrides) => {
    expect(matches(buildEntry(overrides))).toBe(false);
  });

  it('rejects a delegation with missing caveats', () => {
    const entry = buildEntry();
    entry.signedDelegation.caveats = [];

    expect(matches(entry)).toBe(false);
  });

  it('rejects a delegation missing the redeemer caveat', () => {
    expect(matches(buildEntry({ includeRedeemer: false }))).toBe(false);
  });

  it('rejects a delegation with malformed caveat terms', () => {
    const entry = buildEntry();
    entry.signedDelegation.caveats[0].terms = '0x';

    expect(matches(entry)).toBe(false);
  });
});
