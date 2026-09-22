import {
  ROOT_AUTHORITY,
  createERC20TokenPeriodTransferTerms,
  createValueLteTerms,
} from '@metamask/delegation-core';

import type { PreparedSubscriptionPermission } from './types.js';
import {
  buildDelegationTypedData,
  computeBundleFingerprint,
  decodeSubscriptionAuthority,
  hashTypedData,
} from './typed-data.js';

const DELEGATOR = '0x1111111111111111111111111111111111111111' as const;
const DELEGATE = '0x2222222222222222222222222222222222222222' as const;
const TOKEN = '0x3333333333333333333333333333333333333333' as const;
const VALUE_LTE = '0x4444444444444444444444444444444444444444' as const;
const PERIOD = '0x5555555555555555555555555555555555555555' as const;
const DELEGATION_MANAGER =
  '0x6666666666666666666666666666666666666666' as const;

const delegation = {
  delegate: DELEGATE,
  delegator: DELEGATOR,
  authority: ROOT_AUTHORITY,
  caveats: [
    {
      enforcer: VALUE_LTE,
      terms: createValueLteTerms({ maxValue: 0n }),
      args: '0x' as const,
    },
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
  ],
  salt: `0x${'01'.repeat(32)}`,
};

describe('subscription delegation typed data', () => {
  it('builds canonical signable typed data and hashes it', () => {
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
    expect(hashTypedData(typedData)).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it('decodes the exact subscription authority', () => {
    expect(
      decodeSubscriptionAuthority(delegation, {
        valueLte: VALUE_LTE,
        erc20TokenPeriodTransfer: PERIOD,
      }),
    ).toStrictEqual({
      tokenAddress: TOKEN,
      delegateAddress: DELEGATE,
      periodAmount: '10000000',
      periodDuration: 2_419_200,
      startDate: 1_800_000_000,
      maxNativeValue: '0',
    });
  });

  it('does not include delegation salt in the bundle fingerprint', () => {
    const typedData = buildDelegationTypedData({
      delegation,
      chainId: '0x1',
      delegationManager: DELEGATION_MANAGER,
    });
    const permission: PreparedSubscriptionPermission = {
      id: 'cash-subscription',
      owner: 'subscription',
      disposition: 'new',
      delegation,
      typedData,
      typedDataHash: hashTypedData(typedData),
      decodedAuthority: decodeSubscriptionAuthority(delegation, {
        valueLte: VALUE_LTE,
        erc20TokenPeriodTransfer: PERIOD,
      }),
    };

    const first = computeBundleFingerprint({
      policyVersion: '1',
      account: DELEGATOR,
      chainId: '0x1',
      permissions: [permission],
    });
    const second = computeBundleFingerprint({
      policyVersion: '1',
      account: DELEGATOR,
      chainId: '0x1',
      permissions: [
        {
          ...permission,
          delegation: {
            ...permission.delegation,
            salt: `0x${'02'.repeat(32)}`,
          },
        },
      ],
    });

    expect(first).toBe(second);
  });

  it('rejects authority without both required caveats', () => {
    expect(() =>
      decodeSubscriptionAuthority(
        { ...delegation, caveats: delegation.caveats.slice(0, 1) },
        {
          valueLte: VALUE_LTE,
          erc20TokenPeriodTransfer: PERIOD,
        },
      ),
    ).toThrow('Subscription delegation is missing required caveats');
  });

  it('rejects authority that permits native value', () => {
    expect(() =>
      decodeSubscriptionAuthority(
        {
          ...delegation,
          caveats: [
            {
              ...delegation.caveats[0],
              terms: createValueLteTerms({ maxValue: 1n }),
            },
            ...delegation.caveats.slice(1),
          ],
        },
        {
          valueLte: VALUE_LTE,
          erc20TokenPeriodTransfer: PERIOD,
        },
      ),
    ).toThrow('Subscription delegation permits native value');
  });

});
