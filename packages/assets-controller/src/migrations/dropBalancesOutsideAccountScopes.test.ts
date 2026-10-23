import type { InternalAccount } from '@metamask/keyring-internal-api';

import { createMockInternalAccount } from '../__fixtures__/MockAssetControllerMessenger.js';
import type { Caip19AssetId } from '../types.js';
import { dropBalancesOutsideAccountScopes } from './dropBalancesOutsideAccountScopes.js';

const BITCOIN_ACCOUNT_ID = 'bitcoin-account-id';
const EVM_ACCOUNT_ID = 'evm-account-id';
const BITCOIN_NATIVE =
  'bip122:000000000019d6689c085ae165831e93/slip44:0' as Caip19AssetId;
const SOLANA_NATIVE =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
const MAINNET_NATIVE = 'eip155:1/slip44:60' as Caip19AssetId;
const LINEA_NATIVE = 'eip155:59144/slip44:60' as Caip19AssetId;

const bitcoinAccount = (scopes: InternalAccount['scopes']): InternalAccount =>
  createMockInternalAccount({
    id: BITCOIN_ACCOUNT_ID,
    address: 'bc1qdy9vjsg26rrd8tkqr7f26hlhd9524wyjkynemj',
    type: 'bip122:p2wpkh',
    scopes,
  });

const evmAccount = (scopes: InternalAccount['scopes']): InternalAccount =>
  createMockInternalAccount({ id: EVM_ACCOUNT_ID, scopes });

describe('dropBalancesOutsideAccountScopes', () => {
  it('drops balances whose chain namespace is outside the account scopes', () => {
    const balances = {
      [BITCOIN_ACCOUNT_ID]: {
        [BITCOIN_NATIVE]: { amount: '0.00000404' },
        [SOLANA_NATIVE]: { amount: '0' },
        [MAINNET_NATIVE]: { amount: '0' },
      },
      [EVM_ACCOUNT_ID]: {
        [MAINNET_NATIVE]: { amount: '0.02' },
        [LINEA_NATIVE]: { amount: '0' },
        [SOLANA_NATIVE]: { amount: '0' },
      },
    };

    const removed = dropBalancesOutsideAccountScopes(balances, [
      bitcoinAccount(['bip122:000000000019d6689c085ae165831e93']),
      evmAccount(['eip155:0']),
    ]);

    expect(removed).toBe(true);
    expect(balances[BITCOIN_ACCOUNT_ID]).toStrictEqual({
      [BITCOIN_NATIVE]: { amount: '0.00000404' },
    });
    expect(balances[EVM_ACCOUNT_ID]).toStrictEqual({
      [MAINNET_NATIVE]: { amount: '0.02' },
      [LINEA_NATIVE]: { amount: '0' },
    });
  });

  it('keeps every EVM chain when the account scope is the eip155 wildcard', () => {
    const balances = {
      [EVM_ACCOUNT_ID]: {
        [MAINNET_NATIVE]: { amount: '1' },
        [LINEA_NATIVE]: { amount: '2' },
      },
    };

    const removed = dropBalancesOutsideAccountScopes(balances, [
      evmAccount(['eip155:0']),
    ]);

    expect(removed).toBe(false);
    expect(balances[EVM_ACCOUNT_ID]).toStrictEqual({
      [MAINNET_NATIVE]: { amount: '1' },
      [LINEA_NATIVE]: { amount: '2' },
    });
  });

  it('keeps balances for every namespace the account scopes include', () => {
    const balances = {
      [EVM_ACCOUNT_ID]: {
        [MAINNET_NATIVE]: { amount: '1' },
        [SOLANA_NATIVE]: { amount: '2' },
        [BITCOIN_NATIVE]: { amount: '3' },
      },
    };

    const removed = dropBalancesOutsideAccountScopes(balances, [
      evmAccount(['eip155:1', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']),
    ]);

    expect(removed).toBe(true);
    expect(balances[EVM_ACCOUNT_ID]).toStrictEqual({
      [MAINNET_NATIVE]: { amount: '1' },
      [SOLANA_NATIVE]: { amount: '2' },
    });
  });

  it('leaves malformed scopes and balance keys alone', () => {
    const balances = {
      [EVM_ACCOUNT_ID]: {
        [MAINNET_NATIVE]: { amount: '1' },
        [SOLANA_NATIVE]: { amount: '0' },
        'not-a-caip-id': { amount: '0' },
      },
    } as Record<string, Record<Caip19AssetId, { amount: string }>>;

    const removed = dropBalancesOutsideAccountScopes(balances, [
      evmAccount(['eip155:1', 'garbage' as `${string}:${string}`]),
    ]);

    expect(removed).toBe(true);
    expect(balances[EVM_ACCOUNT_ID]).toStrictEqual({
      [MAINNET_NATIVE]: { amount: '1' },
      'not-a-caip-id': { amount: '0' },
    });
  });

  it('leaves an account untouched when none of its scopes are valid CAIP-2 ids', () => {
    const balances = {
      [EVM_ACCOUNT_ID]: {
        [MAINNET_NATIVE]: { amount: '1' },
        [SOLANA_NATIVE]: { amount: '0' },
      },
    };

    const removed = dropBalancesOutsideAccountScopes(balances, [
      evmAccount(['garbage' as `${string}:${string}`]),
    ]);

    expect(removed).toBe(false);
    expect(balances[EVM_ACCOUNT_ID]).toStrictEqual({
      [MAINNET_NATIVE]: { amount: '1' },
      [SOLANA_NATIVE]: { amount: '0' },
    });
  });

  it('leaves an account whose scopes are missing untouched', () => {
    const balances = {
      [BITCOIN_ACCOUNT_ID]: {
        [BITCOIN_NATIVE]: { amount: '1' },
        [SOLANA_NATIVE]: { amount: '0' },
      },
    };
    const { scopes: _scopes, ...accountWithoutScopes } = bitcoinAccount([
      'bip122:000000000019d6689c085ae165831e93',
    ]);

    const removed = dropBalancesOutsideAccountScopes(balances, [
      accountWithoutScopes as InternalAccount,
    ]);

    expect(removed).toBe(false);
    expect(balances[BITCOIN_ACCOUNT_ID]).toStrictEqual({
      [BITCOIN_NATIVE]: { amount: '1' },
      [SOLANA_NATIVE]: { amount: '0' },
    });
  });

  it('leaves an account with no scopes untouched', () => {
    const balances = {
      [BITCOIN_ACCOUNT_ID]: {
        [BITCOIN_NATIVE]: { amount: '1' },
        [SOLANA_NATIVE]: { amount: '0' },
      },
    };

    const removed = dropBalancesOutsideAccountScopes(balances, [
      bitcoinAccount([]),
    ]);

    expect(removed).toBe(false);
    expect(balances[BITCOIN_ACCOUNT_ID]).toStrictEqual({
      [BITCOIN_NATIVE]: { amount: '1' },
      [SOLANA_NATIVE]: { amount: '0' },
    });
  });

  it('leaves an account that has no stored balances untouched', () => {
    const balances = {
      [EVM_ACCOUNT_ID]: {
        [MAINNET_NATIVE]: { amount: '1' },
      },
    };

    const removed = dropBalancesOutsideAccountScopes(balances, [
      createMockInternalAccount({
        id: 'missing-account',
        scopes: ['eip155:1'],
      }),
    ]);

    expect(removed).toBe(false);
    expect(balances).toStrictEqual({
      [EVM_ACCOUNT_ID]: {
        [MAINNET_NATIVE]: { amount: '1' },
      },
    });
  });

  it('leaves accounts that were not passed in untouched', () => {
    const balances = {
      [BITCOIN_ACCOUNT_ID]: {
        [BITCOIN_NATIVE]: { amount: '1' },
        [SOLANA_NATIVE]: { amount: '0' },
      },
    };

    const removed = dropBalancesOutsideAccountScopes(balances, [
      evmAccount(['eip155:1']),
    ]);

    expect(removed).toBe(false);
    expect(balances[BITCOIN_ACCOUNT_ID]).toStrictEqual({
      [BITCOIN_NATIVE]: { amount: '1' },
      [SOLANA_NATIVE]: { amount: '0' },
    });
  });
});
