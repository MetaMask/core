import {
  ROOT_AUTHORITY,
  createAllowedCalldataTerms,
  createERC20TokenPeriodTransferTerms,
} from '@metamask/delegation-core';

import {
  encodeTransferToCalldataPrefix,
  TRANSFER_CALLDATA_PREFIX_START_INDEX,
} from './caveats.js';
import {
  buildDelegationTypedData,
  decodeSubscriptionAuthority,
} from './typed-data.js';

const DELEGATOR = '0x1111111111111111111111111111111111111111' as const;
const DELEGATE = '0x2222222222222222222222222222222222222222' as const;
const TOKEN = '0x3333333333333333333333333333333333333333' as const;
const ALLOWED_CALLDATA = '0x4444444444444444444444444444444444444444' as const;
const PERIOD = '0x5555555555555555555555555555555555555555' as const;
const DELEGATION_MANAGER =
  '0x6666666666666666666666666666666666666666' as const;
const TREASURY = '0x7777777777777777777777777777777777777777' as const;

const ENFORCERS = {
  erc20TokenPeriodTransfer: PERIOD,
  allowedCalldata: ALLOWED_CALLDATA,
};

const delegation = {
  delegate: DELEGATE,
  delegator: DELEGATOR,
  authority: ROOT_AUTHORITY,
  caveats: [
    {
      enforcer: PERIOD,
      terms: createERC20TokenPeriodTransferTerms({
        tokenAddress: TOKEN,
        periodAmount: 10_000_000n,
        periodDuration: 2_419_200,
        startDate: 1_800_000_000,
      }),
      args: '0x' as const,
    },
    {
      enforcer: ALLOWED_CALLDATA,
      terms: createAllowedCalldataTerms({
        startIndex: TRANSFER_CALLDATA_PREFIX_START_INDEX,
        value: encodeTransferToCalldataPrefix(TREASURY),
      }),
      args: '0x' as const,
    },
  ],
  salt: `0x${'01'.repeat(32)}`,
};

describe('subscription delegation typed data', () => {
  it('builds canonical signable typed data', () => {
    const typedData = buildDelegationTypedData({
      delegation,
      chainId: '0x1',
      delegationManager: DELEGATION_MANAGER,
    });

    expect(typedData.domain).toStrictEqual({
      chainId: 1,
      name: 'DelegationManager',
      version: '1',
      verifyingContract: DELEGATION_MANAGER,
    });
    expect(typedData.primaryType).toBe('Delegation');
  });

  it('decodes the exact subscription authority', () => {
    expect(decodeSubscriptionAuthority(delegation, ENFORCERS)).toStrictEqual({
      tokenAddress: TOKEN,
      delegateAddress: DELEGATE,
      periodAmount: '10000000',
      periodDuration: 2_419_200,
      startDate: 1_800_000_000,
      maxNativeValue: '0',
    });
  });

  it('matches enforcer addresses case-insensitively', () => {
    expect(
      decodeSubscriptionAuthority(delegation, {
        erc20TokenPeriodTransfer: PERIOD.toUpperCase().replace(
          '0X',
          '0x',
        ) as typeof PERIOD,
        allowedCalldata: ALLOWED_CALLDATA,
      }).tokenAddress,
    ).toBe(TOKEN);
  });

  it('rejects authority without the period transfer caveat', () => {
    expect(() =>
      decodeSubscriptionAuthority(
        { ...delegation, caveats: delegation.caveats.slice(1) },
        ENFORCERS,
      ),
    ).toThrow('Subscription delegation is missing required caveats');
  });

  it('rejects authority without the allowed calldata caveat', () => {
    expect(() =>
      decodeSubscriptionAuthority(
        { ...delegation, caveats: delegation.caveats.slice(0, 1) },
        ENFORCERS,
      ),
    ).toThrow('Subscription delegation is missing required caveats');
  });
});
