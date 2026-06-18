import { isStellarClassicTrustlineInactiveForDisplay } from './stellar';

describe('isStellarClassicTrustlineInactiveForDisplay', () => {
  const classicUsdc =
    'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
  const sep41SolvBtc =
    'stellar:pubnet/sep41:CBIJBDNZNF4X35BJ4FFZWCDBSCKOP5NB4PLG4SNENRMLAPYG4P5FM6VN';

  it('returns false for native XLM without extra', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: 'stellar:pubnet/slip44:148',
        isNative: true,
      }),
    ).toBe(false);
  });

  it('returns false for sep41 tokens without extra', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: sep41SolvBtc,
      }),
    ).toBe(false);
  });

  it('returns true for classic asset with zero limit extra', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        extra: { limit: '0' },
      }),
    ).toBe(true);
  });

  it('returns false for classic asset with positive limit extra', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        extra: { limit: '1000' },
      }),
    ).toBe(false);
  });

  it('returns true for classic asset without extra on first import', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
      }),
    ).toBe(true);
  });

  it('returns false for non-stellar chains', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: '0x1',
        assetId: '0x123',
      }),
    ).toBe(false);
  });

  it('returns true when extra omits limit', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        extra: {},
      }),
    ).toBe(true);
  });

  it('returns true when extra limit is not a string', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        extra: { limit: 1000 } as unknown as { limit?: string },
      }),
    ).toBe(true);
  });

  it('returns true when extra limit is not numeric', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        extra: { limit: 'not-a-number' },
      }),
    ).toBe(true);
  });

  it('returns true when extra limit is negative', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        extra: { limit: '-1' },
      }),
    ).toBe(true);
  });

  it('returns false for invalid classic asset id', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: 'not-a-valid-caip-asset',
      }),
    ).toBe(false);
  });

  it('returns false when assetId is missing', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
      }),
    ).toBe(false);
  });

  it('returns false for classic asset with positive balance and no extra', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        balance: '10.5',
      }),
    ).toBe(false);
  });

  it('returns true for classic asset with zero balance and no extra', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        balance: '0',
      }),
    ).toBe(true);
  });

  it('returns true for classic asset with invalid balance and no extra', () => {
    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:pubnet',
        assetId: classicUsdc,
        balance: 'not-a-number',
      }),
    ).toBe(true);
  });

  it('evaluates classic assets on stellar testnet', () => {
    const testnetClassic =
      'stellar:testnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

    expect(
      isStellarClassicTrustlineInactiveForDisplay({
        chainId: 'stellar:testnet',
        assetId: testnetClassic,
        extra: { limit: '0' },
      }),
    ).toBe(true);
  });
});
