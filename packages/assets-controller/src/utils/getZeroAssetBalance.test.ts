import {
  getDefaultNativeAssetBalance,
  getZeroAssetBalance,
  getZeroNativeAssetBalance,
  getZeroTokenAssetBalance,
} from './getZeroAssetBalance.js';

const STELLAR_PUBNET = 'stellar:pubnet';
const STELLAR_TESTNET = 'stellar:testnet';
const STELLAR_NATIVE_ZERO = {
  amount: '0',
  metadata: {
    minimumReserveBalance: '0',
    spendableBalance: '0',
  },
};
const STELLAR_TOKEN_ZERO = {
  amount: '0',
  metadata: {
    authorized: false,
    limit: '0',
    sponsored: false,
  },
};

describe('getZeroNativeAssetBalance', () => {
  it('seeds Stellar natives with zero spendable and reserve metadata', () => {
    expect(getZeroNativeAssetBalance(STELLAR_PUBNET)).toStrictEqual(
      STELLAR_NATIVE_ZERO,
    );
    expect(getZeroNativeAssetBalance(STELLAR_TESTNET)).toStrictEqual(
      STELLAR_NATIVE_ZERO,
    );
  });

  it('seeds non-Stellar natives as a plain zero amount', () => {
    expect(getZeroNativeAssetBalance('eip155:1')).toStrictEqual({
      amount: '0',
    });
    expect(
      getZeroNativeAssetBalance('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
    ).toStrictEqual({ amount: '0' });
  });
});

describe('getZeroTokenAssetBalance', () => {
  it('seeds Stellar tokens with empty trustline metadata', () => {
    expect(getZeroTokenAssetBalance(STELLAR_PUBNET)).toStrictEqual(
      STELLAR_TOKEN_ZERO,
    );
    expect(getZeroTokenAssetBalance(STELLAR_TESTNET)).toStrictEqual(
      STELLAR_TOKEN_ZERO,
    );
  });

  it('seeds non-Stellar tokens as a plain zero amount', () => {
    expect(getZeroTokenAssetBalance('eip155:1')).toStrictEqual({
      amount: '0',
    });
    expect(
      getZeroTokenAssetBalance('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
    ).toStrictEqual({ amount: '0' });
  });
});

describe('getZeroAssetBalance', () => {
  it('routes Stellar natives from NATIVE_ASSETS to the native zero', () => {
    expect(getZeroAssetBalance('stellar:pubnet/slip44:148')).toStrictEqual(
      STELLAR_NATIVE_ZERO,
    );
  });

  it('routes Stellar trustlines to the token zero', () => {
    expect(
      getZeroAssetBalance(
        'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      ),
    ).toStrictEqual(STELLAR_TOKEN_ZERO);
  });

  it('routes non-Stellar natives and tokens to a plain zero amount', () => {
    expect(getZeroAssetBalance('eip155:1/slip44:60')).toStrictEqual({
      amount: '0',
    });
    expect(
      getZeroAssetBalance(
        'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F',
      ),
    ).toStrictEqual({ amount: '0' });
  });
});

describe('getDefaultNativeAssetBalance', () => {
  it('seeds Stellar natives with zero spendable and reserve metadata', () => {
    expect(
      getDefaultNativeAssetBalance('stellar:pubnet/slip44:148'),
    ).toStrictEqual(STELLAR_NATIVE_ZERO);
  });

  it('seeds non-Stellar natives as a plain zero amount', () => {
    expect(
      getDefaultNativeAssetBalance(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      ),
    ).toStrictEqual({ amount: '0' });
    expect(getDefaultNativeAssetBalance('eip155:1/slip44:60')).toStrictEqual({
      amount: '0',
    });
  });
});
