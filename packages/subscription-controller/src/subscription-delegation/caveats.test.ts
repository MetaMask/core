import {
  decodeERC20TokenPeriodTransferTerms,
  decodeValueLteTerms,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import {
  buildSubscriptionCaveats,
  buildUnsignedSubscriptionDelegation,
} from './caveats.js';

const VALUE_LTE_ENFORCER = '0x1111111111111111111111111111111111111111' as Hex;
const PERIOD_ENFORCER = '0x2222222222222222222222222222222222222222' as Hex;
const REDEEMER_ENFORCER = '0x6666666666666666666666666666666666666666' as Hex;
const TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333' as Hex;
const DELEGATE = '0x4444444444444444444444444444444444444444' as Hex;
const DELEGATOR = '0x5555555555555555555555555555555555555555' as Hex;

const ENFORCERS = {
  valueLte: VALUE_LTE_ENFORCER,
  erc20TokenPeriodTransfer: PERIOD_ENFORCER,
  redeemer: REDEEMER_ENFORCER,
};

describe('buildSubscriptionCaveats', () => {
  it('builds ValueLte(0) and ERC20TokenPeriodTransfer caveats', () => {
    const caveats = buildSubscriptionCaveats({
      enforcers: ENFORCERS,
      delegateAddress: DELEGATE,
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 10n * 10n ** 18n,
      periodDuration: 28 * 86_400,
      startDate: 1_700_000_000,
    });

    expect(caveats).toHaveLength(2);
    const [valueLteCaveat, periodCaveat] = caveats;
    expect(valueLteCaveat?.enforcer).toBe(VALUE_LTE_ENFORCER);
    expect(periodCaveat?.enforcer).toBe(PERIOD_ENFORCER);
    expect(decodeValueLteTerms(valueLteCaveat?.terms ?? '0x')).toStrictEqual({
      maxValue: 0n,
    });
    expect(
      decodeERC20TokenPeriodTransferTerms(periodCaveat?.terms ?? '0x'),
    ).toStrictEqual({
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 10n * 10n ** 18n,
      periodDuration: 28 * 86_400,
      startDate: 1_700_000_000,
    });
  });
});

describe('buildUnsignedSubscriptionDelegation', () => {
  it('builds a root unsigned delegation with a 32-byte salt', () => {
    const salt =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
    const unsigned = buildUnsignedSubscriptionDelegation({
      delegateAddress: DELEGATE,
      delegatorAddress: DELEGATOR,
      enforcers: ENFORCERS,
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 100n,
      periodDuration: 365 * 86_400,
      startDate: 1_700_000_000,
      salt,
    });

    expect(unsigned).toStrictEqual({
      delegate: DELEGATE,
      delegator: DELEGATOR,
      authority: ROOT_AUTHORITY,
      caveats: expect.any(Array),
      salt,
    });
    expect(unsigned.salt).toMatch(/^0x[0-9a-fA-F]{64}$/u);
    expect(unsigned.caveats).toHaveLength(2);
    expect(unsigned.caveats[0]?.enforcer).toBe(VALUE_LTE_ENFORCER);
    expect(unsigned.caveats[1]?.enforcer).toBe(PERIOD_ENFORCER);
  });

  it('generates a random 32-byte salt when omitted', () => {
    const unsigned = buildUnsignedSubscriptionDelegation({
      delegateAddress: DELEGATE,
      delegatorAddress: DELEGATOR,
      enforcers: ENFORCERS,
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 100n,
      periodDuration: 28 * 86_400,
      startDate: 1_700_000_000,
    });

    expect(unsigned.salt).toMatch(/^0x[0-9a-fA-F]{64}$/u);
  });
});
