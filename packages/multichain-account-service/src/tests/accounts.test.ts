import {
  MOCK_HD_ACCOUNT_1,
  MOCK_SNAP_ACCOUNT_2,
  MockAccountBuilder,
} from './accounts';

describe('MockAccountBuilder', () => {
  it('updates the account ID', () => {
    const account = MOCK_HD_ACCOUNT_1;
    const mockAccount = MockAccountBuilder.from(account).withUuid().get();

    expect(account.id).not.toStrictEqual(mockAccount.id);
  });

  it('adds a suffix to the account address', () => {
    const suffix = 'foo';

    const account = MOCK_HD_ACCOUNT_1;
    const mockAccount = MockAccountBuilder.from(account)
      .withAddressSuffix(suffix)
      .get();

    expect(mockAccount.address.endsWith(suffix)).toBe(true);
  });

  it('throws if trying to update entropy source for non-BIP-44 accounts', () => {
    const account = MOCK_SNAP_ACCOUNT_2; // Not a BIP-44 account.

    expect(() =>
      MockAccountBuilder.from(account).withEntropySource('test').get(),
    ).toThrow('Invalid BIP-44 account');
  });

  it('throws if trying to update group index for non-BIP-44 accounts', () => {
    const account = MOCK_SNAP_ACCOUNT_2; // Not a BIP-44 account.

    expect(() =>
      MockAccountBuilder.from(account).withGroupIndex(10).get(),
    ).toThrow('Invalid BIP-44 account');
  });
});
