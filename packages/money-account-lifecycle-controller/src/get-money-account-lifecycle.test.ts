import type { DerivedIdentity } from '@metamask/chomp-api-service';

import { getMoneyAccountLifecycle } from './get-money-account-lifecycle.js';

const MONEY_ACCOUNT_ADDRESS = '0x00000000000000000000000000000000000000Aa';

const SUCCESSOR_ADDRESS = '0x00000000000000000000000000000000000000Bb';

const UNRELATED_IDENTITY: DerivedIdentity = {
  currentAddress: '0x0000000000000000000000000000000000000001',
  previousAddresses: ['0x0000000000000000000000000000000000000002'],
  status: 'DONE',
  migration: null,
};

describe('getMoneyAccountLifecycle', () => {
  it.each([
    { description: 'there are no identities', identities: [] },
    {
      description: 'no identity contains the address',
      identities: [UNRELATED_IDENTITY],
    },
  ])('returns notInIdentity when $description', ({ identities }) => {
    expect(
      getMoneyAccountLifecycle(MONEY_ACCOUNT_ADDRESS, identities),
    ).toStrictEqual({ type: 'notInIdentity' });
  });

  it.each([
    { status: 'DONE', currentAddress: MONEY_ACCOUNT_ADDRESS },
    { status: 'MIGRATING', currentAddress: MONEY_ACCOUNT_ADDRESS },
    { status: 'DONE', currentAddress: MONEY_ACCOUNT_ADDRESS.toLowerCase() },
  ] as const)(
    'returns sfa when the address is the current address $currentAddress of a $status identity',
    ({ status, currentAddress }) => {
      const identity: DerivedIdentity = {
        currentAddress,
        previousAddresses: [],
        status,
        migration: null,
      };

      expect(
        getMoneyAccountLifecycle(MONEY_ACCOUNT_ADDRESS, [
          UNRELATED_IDENTITY,
          identity,
        ]),
      ).toStrictEqual({ type: 'sfa', identity });
    },
  );

  it('returns mfa when the address is a previous address of a done identity, ignoring case', () => {
    const identity: DerivedIdentity = {
      currentAddress: SUCCESSOR_ADDRESS,
      previousAddresses: [MONEY_ACCOUNT_ADDRESS.toLowerCase()],
      status: 'DONE',
      migration: null,
    };

    expect(
      getMoneyAccountLifecycle(MONEY_ACCOUNT_ADDRESS, [identity]),
    ).toStrictEqual({ type: 'mfa', identity });
  });

  it('prefers sfa when the address is the current address of one identity and a previous address of another', () => {
    const sfaIdentity: DerivedIdentity = {
      currentAddress: MONEY_ACCOUNT_ADDRESS,
      previousAddresses: [],
      status: 'DONE',
      migration: null,
    };
    const mfaIdentity: DerivedIdentity = {
      currentAddress: SUCCESSOR_ADDRESS,
      previousAddresses: [MONEY_ACCOUNT_ADDRESS],
      status: 'DONE',
      migration: null,
    };

    expect(
      getMoneyAccountLifecycle(MONEY_ACCOUNT_ADDRESS, [
        mfaIdentity,
        sfaIdentity,
      ]),
    ).toStrictEqual({ type: 'sfa', identity: sfaIdentity });
  });

  it('returns mfa when the address is a previous address of an identity migrating to a further address', () => {
    const identity: DerivedIdentity = {
      currentAddress: SUCCESSOR_ADDRESS,
      previousAddresses: [MONEY_ACCOUNT_ADDRESS],
      status: 'MIGRATING',
      migration: {
        from: SUCCESSOR_ADDRESS,
        to: '0x00000000000000000000000000000000000000cc',
        requiredSteps: ['ROOT_DELEGATION'],
        completedSteps: [],
        missingSteps: ['ROOT_DELEGATION'],
      },
    };

    expect(
      getMoneyAccountLifecycle(MONEY_ACCOUNT_ADDRESS, [identity]),
    ).toStrictEqual({ type: 'mfa', identity });
  });
});
