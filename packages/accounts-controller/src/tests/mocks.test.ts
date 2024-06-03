import { BtcAccountType, EthAccountType } from '@metamask/keyring-api';

import { createMockInternalAccount } from './mocks';

describe('createMockInternalAccount', () => {
  it('create a mock internal account', () => {
    const account = createMockInternalAccount();
    expect(account).toStrictEqual({
      id: expect.any(String),
      address: expect.any(String),
      type: expect.any(String),
      options: expect.any(Object),
      methods: expect.any(Array),
      metadata: {
        name: expect.any(String),
        keyring: { type: expect.any(String) },
        importTime: expect.any(Number),
        lastSelected: expect.any(Number),
        snap: undefined,
      },
    });
  });

  it('create a mock internal account with custom values', () => {
    const customSnap = {
      id: '1',
      enabled: true,
      name: 'Snap 1',
    };
    const account = createMockInternalAccount({
      id: '1',
      address: '0x123',
      type: EthAccountType.Erc4337,
      name: 'Custom Account',
      snap: customSnap,
    });
    expect(account).toStrictEqual({
      id: '1',
      address: '0x123',
      type: EthAccountType.Erc4337,
      options: expect.any(Object),
      methods: expect.any(Array),
      metadata: {
        name: 'Custom Account',
        keyring: { type: expect.any(String) },
        importTime: expect.any(Number),
        lastSelected: expect.any(Number),
        snap: customSnap,
      },
    });
  });

  it('create a non-EVM account', () => {
    const account = createMockInternalAccount({ type: BtcAccountType.P2wpkh });
    expect(account).toStrictEqual({
      id: expect.any(String),
      address: expect.any(String),
      type: BtcAccountType.P2wpkh,
      options: expect.any(Object),
      methods: expect.any(Array),
      metadata: {
        name: expect.any(String),
        keyring: { type: expect.any(String) },
        importTime: expect.any(Number),
        lastSelected: expect.any(Number),
        snap: undefined,
      },
    });
  });

  it('will throw if an unknown account type was passed', () => {
    // @ts-expect-error testing unknown account type
    expect(() => createMockInternalAccount({ type: 'unknown' })).toThrow(
      'Unknown account type: unknown',
    );
  });
});
