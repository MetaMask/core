import { CHAIN_IDS } from '@metamask/transaction-controller';

import {
  isMusdOnMoneyAccountChain,
  isMusdToken,
  isMusdTokenOnChain,
  MUSD_DECIMALS,
  MUSD_MONEY_ACCOUNT_CHAIN_IDS,
  MUSD_TOKEN,
  MUSD_TOKEN_ADDRESS,
  MUSD_TOKEN_ADDRESS_BY_CHAIN,
  MUSD_TOKEN_ASSET_ID_BY_CHAIN,
} from './musd';

const MUSD_ADDRESS = MUSD_TOKEN_ADDRESS_BY_CHAIN[CHAIN_IDS.MAINNET];

describe('mUSD constants', () => {
  it('derives MUSD_DECIMALS from MUSD_TOKEN', () => {
    expect(MUSD_DECIMALS).toBe(MUSD_TOKEN.decimals);
  });

  it('uses the same address on every supported chain', () => {
    for (const address of Object.values(MUSD_TOKEN_ADDRESS_BY_CHAIN)) {
      expect(address).toBe(MUSD_TOKEN_ADDRESS);
    }
  });

  it('defines a CAIP asset id for every chain mUSD is deployed on', () => {
    expect(Object.keys(MUSD_TOKEN_ASSET_ID_BY_CHAIN).sort()).toStrictEqual(
      Object.keys(MUSD_TOKEN_ADDRESS_BY_CHAIN).sort(),
    );
    for (const assetId of Object.values(MUSD_TOKEN_ASSET_ID_BY_CHAIN)) {
      expect(assetId.toLowerCase()).toContain(
        `erc20:${MUSD_TOKEN_ADDRESS.toLowerCase()}`,
      );
    }
  });

  it('only tracks Money Account activity on a subset of deployed chains', () => {
    for (const chainId of MUSD_MONEY_ACCOUNT_CHAIN_IDS) {
      expect(MUSD_TOKEN_ADDRESS_BY_CHAIN[chainId]).toBeDefined();
    }
  });
});

describe('isMusdToken', () => {
  it('returns true for the mUSD token address in lowercase', () => {
    expect(isMusdToken(MUSD_ADDRESS)).toBe(true);
  });

  it('returns true for the mUSD token address in uppercase', () => {
    expect(isMusdToken(MUSD_ADDRESS.toUpperCase())).toBe(true);
  });

  it('returns true for the mUSD token address with mixed case', () => {
    expect(isMusdToken('0xAcA92E438df0B2401fF60dA7E4337B687a2435DA')).toBe(
      true,
    );
  });

  it('returns false for a non-mUSD token address', () => {
    expect(isMusdToken('0x1234567890123456789012345678901234567890')).toBe(
      false,
    );
  });

  it('returns false for an undefined address', () => {
    expect(isMusdToken(undefined)).toBe(false);
  });

  it('returns false for an empty string address', () => {
    expect(isMusdToken('')).toBe(false);
  });
});

describe('isMusdTokenOnChain', () => {
  it('returns true for the mUSD address on a supported chain', () => {
    expect(isMusdTokenOnChain(MUSD_ADDRESS, CHAIN_IDS.MAINNET)).toBe(true);
    expect(isMusdTokenOnChain(MUSD_ADDRESS, CHAIN_IDS.LINEA_MAINNET)).toBe(
      true,
    );
    expect(isMusdTokenOnChain(MUSD_ADDRESS, CHAIN_IDS.BSC)).toBe(true);
    expect(isMusdTokenOnChain(MUSD_ADDRESS, CHAIN_IDS.MONAD)).toBe(true);
  });

  it('returns false for the mUSD address on an unsupported chain', () => {
    expect(isMusdTokenOnChain(MUSD_ADDRESS, CHAIN_IDS.POLYGON)).toBe(false);
    expect(isMusdTokenOnChain(MUSD_ADDRESS, CHAIN_IDS.ARBITRUM)).toBe(false);
    expect(isMusdTokenOnChain(MUSD_ADDRESS, CHAIN_IDS.OPTIMISM)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(
      isMusdTokenOnChain(MUSD_ADDRESS.toUpperCase(), CHAIN_IDS.MAINNET),
    ).toBe(true);
  });

  it('returns false for a missing address or chainId', () => {
    expect(isMusdTokenOnChain(undefined, CHAIN_IDS.MAINNET)).toBe(false);
    expect(isMusdTokenOnChain(MUSD_ADDRESS, undefined)).toBe(false);
  });
});

describe('isMusdOnMoneyAccountChain', () => {
  it('returns true only for mUSD on Monad', () => {
    expect(isMusdOnMoneyAccountChain(MUSD_ADDRESS, CHAIN_IDS.MONAD)).toBe(true);
  });

  it('returns false for mUSD on chains where mUSD is deployed but the Money Account is not active', () => {
    expect(isMusdOnMoneyAccountChain(MUSD_ADDRESS, CHAIN_IDS.MAINNET)).toBe(
      false,
    );
    expect(
      isMusdOnMoneyAccountChain(MUSD_ADDRESS, CHAIN_IDS.LINEA_MAINNET),
    ).toBe(false);
    expect(isMusdOnMoneyAccountChain(MUSD_ADDRESS, CHAIN_IDS.BSC)).toBe(false);
  });

  it('returns false for missing arguments', () => {
    expect(isMusdOnMoneyAccountChain(undefined, CHAIN_IDS.MONAD)).toBe(false);
    expect(isMusdOnMoneyAccountChain(MUSD_ADDRESS, undefined)).toBe(false);
  });

  it('returns false for a non-mUSD address on Monad', () => {
    expect(
      isMusdOnMoneyAccountChain(
        '0x1234567890123456789012345678901234567890',
        CHAIN_IDS.MONAD,
      ),
    ).toBe(false);
  });
});
