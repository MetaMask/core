import {
  getEthAccounts,
  setEthAccounts,
  setPermittedAccounts,
} from './caip-permission-adapter-accounts';
import type { Caip25CaveatValue } from '../caip25Permission';
import type { CaipAccountId } from '@metamask/utils';

describe('CAIP-25 eth_accounts adapters', () => {
  describe('getEthAccounts', () => {
    it('returns an empty array if the required scopes are empty', () => {
      const ethAccounts = getEthAccounts({
        requiredScopes: {},
        optionalScopes: {},
      });
      expect(ethAccounts).toStrictEqual([]);
    });
    it('returns an empty array if the scope objects have no accounts', () => {
      const ethAccounts = getEthAccounts({
        requiredScopes: {
          'eip155:1': { accounts: [] },
          'eip155:2': { accounts: [] },
        },
        optionalScopes: {},
      });
      expect(ethAccounts).toStrictEqual([]);
    });
    it('returns an empty array if the scope objects have no eth accounts', () => {
      const ethAccounts = getEthAccounts({
        requiredScopes: {
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: [
              'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
            ],
          },
        },
        optionalScopes: {},
      });
      expect(ethAccounts).toStrictEqual([]);
    });

    it('returns the unique set of EIP155 accounts from the CAIP-25 caveat value', () => {
      const ethAccounts = getEthAccounts({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
          'eip155:5': {
            accounts: ['eip155:5:0x2', 'eip155:1:0x3'],
          },
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: [
              'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
            ],
          },
        },
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x4'],
          },
          'eip155:10': {
            accounts: [],
          },
          'eip155:100': {
            accounts: ['eip155:100:0x100'],
          },
          'wallet:eip155': {
            accounts: ['wallet:eip155:0x5'],
          },
        },
      });

      expect(ethAccounts).toStrictEqual([
        '0x1',
        '0x2',
        '0x3',
        '0x4',
        '0x100',
        '0x5',
      ]);
    });
  });

  describe('setEthAccounts', () => {
    it('returns a CAIP-25 caveat value with all EIP-155 scopeObject.accounts set to CAIP-10 account addresses formed from the accounts param', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
          'eip155:5': {
            accounts: ['eip155:5:0x2', 'eip155:1:0x3'],
          },
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: [
              'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
            ],
          },
        },
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x4'],
          },
          'eip155:10': {
            accounts: [],
          },
          'eip155:100': {
            accounts: ['eip155:100:0x100'],
          },
          'wallet:eip155': {
            accounts: [],
          },
          wallet: {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = setEthAccounts(input, ['0x1', '0x2', '0x3']);
      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2', 'eip155:1:0x3'],
          },
          'eip155:5': {
            accounts: ['eip155:5:0x1', 'eip155:5:0x2', 'eip155:5:0x3'],
          },
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: [
              'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
            ],
          },
        },
        optionalScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2', 'eip155:1:0x3'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0x1', 'eip155:10:0x2', 'eip155:10:0x3'],
          },
          'eip155:100': {
            accounts: ['eip155:100:0x1', 'eip155:100:0x2', 'eip155:100:0x3'],
          },
          'wallet:eip155': {
            accounts: [
              'wallet:eip155:0x1',
              'wallet:eip155:0x2',
              'wallet:eip155:0x3',
            ],
          },
          wallet: {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      });
    });

    it('does not modify the input CAIP-25 caveat value object in place', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: [],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = setEthAccounts(input, ['0x1', '0x2', '0x3']);
      expect(input).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: [],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
      expect(input).not.toStrictEqual(result);
    });
  });

  describe('setPermittedAccounts', () => {
    it('returns a CAIP-25 caveat value with all scopeObject.accounts set to accounts provided', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: ['bip122:000000000019d6689c085ae165831e93:abc123'],
          },
        },
        optionalScopes: {
          'eip155:5': {
            accounts: ['eip155:5:0x3'],
          },
          wallet: {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const permittedAccounts: CaipAccountId[] = [
        'eip155:1:0xabc',
        'eip155:5:0xabc',
        'bip122:000000000019d6689c085ae165831e93:xyz789',
      ];

      const result = setPermittedAccounts(input, permittedAccounts);

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0xabc'],
          },
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: ['bip122:000000000019d6689c085ae165831e93:xyz789'],
          },
        },
        optionalScopes: {
          'eip155:5': {
            accounts: ['eip155:5:0xabc'],
          },
          wallet: {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      });
    });

    it('does not modify the input CAIP-25 caveat value object', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = setPermittedAccounts(input, [
        'eip155:1:0xabc',
      ] as CaipAccountId[]);

      expect(input).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
      expect(input).not.toStrictEqual(result);
    });

    it('handles empty accounts array', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = setPermittedAccounts(input, []);

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: [],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
    });

    it('handles different CAIP namespaces in the accounts array', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: [],
          },
          'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ': {
            accounts: [],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = setPermittedAccounts(input, [
        'eip155:1:0xabc',
        'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:pubkey123',
      ]);

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: [
              'eip155:1:0xabc',
            ],
          },
          'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ': {
            accounts: [
              'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:pubkey123',
            ],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
    });
  });
});
