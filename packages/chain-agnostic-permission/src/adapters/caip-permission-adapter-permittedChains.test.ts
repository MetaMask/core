import {
  addPermittedEthChainId,
  getPermittedEthChainIds,
  setPermittedEthChainIds,
  addPermittedChainId,
  setPermittedChainIds,
} from './caip-permission-adapter-permittedChains';
import type { Caip25CaveatValue } from '../caip25Permission';

describe('CAIP-25 permittedChains adapters', () => {
  describe('getPermittedEthChainIds', () => {
    it('returns the unique set of EIP155 chainIds in hexadecimal format from the CAIP-25 caveat value', () => {
      const ethChainIds = getPermittedEthChainIds({
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
        },
      });

      expect(ethChainIds).toStrictEqual(['0x1', '0x5', '0xa', '0x64']);
    });
  });

  describe('addPermittedEthChainId', () => {
    it('returns a version of the caveat value with a new optional scope for the chainId if it does not already exist in required or optional scopes', () => {
      const result = addPermittedEthChainId(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {
            'eip155:100': {
              accounts: ['eip155:100:0x100'],
            },
            'wallet:eip155': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        },
        '0x65',
      );

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {
          'eip155:100': {
            accounts: ['eip155:100:0x100'],
          },
          'eip155:101': {
            accounts: [],
          },
          'wallet:eip155': {
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
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = addPermittedEthChainId(input, '0x65');

      expect(input).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
      expect(input).not.toStrictEqual(result);
    });

    it('does not add an optional scope for the chainId if already exists in the required scopes', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {
          'eip155:100': {
            accounts: ['eip155:100:0x100'],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      };
      const result = addPermittedEthChainId(input, '0x1');

      expect(result).toStrictEqual(input);
    });

    it('does not add an optional scope for the chainId if already exists in the optional scopes', () => {
      const input: Caip25CaveatValue = {
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {
          'eip155:100': {
            accounts: ['eip155:100:0x100'],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      };
      const result = addPermittedEthChainId(input, '0x64'); // 0x64 === 100

      expect(result).toStrictEqual(input);
    });
  });

  describe('setPermittedEthChainIds', () => {
    it('returns a CAIP-25 caveat value with EIP-155 scopes missing from the chainIds array removed', () => {
      const result = setPermittedEthChainIds(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: [],
            },
          },
          optionalScopes: {
            wallet: {
              accounts: [],
            },
            'eip155:1': {
              accounts: [],
            },
            'eip155:100': {
              accounts: ['eip155:100:0x100'],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        },
        ['0x1'],
      );

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: [],
          },
        },
        optionalScopes: {
          wallet: {
            accounts: [],
          },
          'eip155:1': {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      });
    });

    it('returns a CAIP-25 caveat value with optional scopes added for missing chainIds', () => {
      const result = setPermittedEthChainIds(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {
            'eip155:1': {
              accounts: [],
            },
            'eip155:100': {
              accounts: ['eip155:100:0x100'],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        },
        ['0x1', '0x64', '0x65'],
      );

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {
          'eip155:1': {
            accounts: [],
          },
          'eip155:100': {
            accounts: ['eip155:100:0x100'],
          },
          'eip155:101': {
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
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = setPermittedEthChainIds(input, ['0x1', '0x2', '0x3']);

      expect(input).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
      expect(input).not.toStrictEqual(result);
    });
  });

  describe('addPermittedChainId', () => {
    it('returns a version of the caveat value with a new optional scope for the passed chainId if it does not already exist in required or optional scopes', () => {
      const result = addPermittedChainId(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {
            'eip155:100': {
              accounts: ['eip155:100:0x100'],
            },
            'wallet:eip155': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        },
        'bip122:000000000019d6689c085ae165831e93',
      );

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {
          'eip155:100': {
            accounts: ['eip155:100:0x100'],
          },
          'wallet:eip155': {
            accounts: [],
          },
          'bip122:000000000019d6689c085ae165831e93': {
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
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = addPermittedChainId(
        input,
        'bip122:000000000019d6689c085ae165831e93',
      );

      expect(input).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
      expect(input).not.toStrictEqual(result);
    });

    it('does not add an optional scope for the chainId if already exists in the required scopes', () => {
      const existingScope = 'eip155:1';
      const input: Caip25CaveatValue = {
        requiredScopes: {
          [existingScope]: {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = addPermittedChainId(input, existingScope);

      expect(result).toStrictEqual(input);
    });

    it('does not add an optional scope for the chainId if already exists in the optional scopes', () => {
      const existingScope = 'eip155:1';
      const input: Caip25CaveatValue = {
        requiredScopes: {},
        optionalScopes: {
          [existingScope]: {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = addPermittedChainId(input, existingScope);

      expect(result).toStrictEqual(input);
    });
  });

  describe('setPermittedChainIds', () => {
    it('returns a CAIP-25 caveat value with non-wallet scopes missing from the chainIds array removed', () => {
      const result = setPermittedChainIds(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
            'bip122:000000000019d6689c085ae165831e93': {
              accounts: [],
            },
            'eip155:100': {
              accounts: ['eip155:100:0x100'],
            },
          },
          optionalScopes: {
            wallet: {
              accounts: [],
            },
            'wallet:eip155': {
              accounts: [],
            },
            'wallet:bip122': {
              accounts: [],
            },
            'eip155:5': {
              accounts: [],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        },
        ['eip155:1', 'eip155:5'],
      );

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {
          wallet: {
            accounts: [],
          },
          'eip155:5': {
            accounts: [],
          },
          'wallet:bip122': {
            accounts: [],
          },
          'wallet:eip155': {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      });
    });

    it('returns a CAIP-25 caveat value with optional scopes added for missing chainIds', () => {
      const result = setPermittedChainIds(
        {
          requiredScopes: {
            'eip155:1': {
              accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
            },
          },
          optionalScopes: {},
          sessionProperties: {},
          isMultichainOrigin: false,
        },
        ['eip155:1', 'bip122:000000000019d6689c085ae165831e93'],
      );

      expect(result).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {
          'bip122:000000000019d6689c085ae165831e93': {
            accounts: [],
          },
        },
        sessionProperties: {},
        isMultichainOrigin: false,
      });
    });

    it('preserves wallet namespace scopes when setting permitted chainIds', () => {
      const result = setPermittedChainIds(
        {
          requiredScopes: {},
          optionalScopes: {
            wallet: {
              accounts: [],
            },
            'wallet:eip155': {
              accounts: ['wallet:eip155:0xabc'],
            },
          },
          sessionProperties: {},
          isMultichainOrigin: false,
        },
        ['eip155:1', 'eip155:5'],
      );

      expect(result).toStrictEqual({
        requiredScopes: {},
        optionalScopes: {
          wallet: {
            accounts: [],
          },
          'wallet:eip155': {
            accounts: ['wallet:eip155:0xabc'],
          },
          'eip155:1': {
            accounts: [],
          },
          'eip155:5': {
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
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      };

      const result = setPermittedChainIds(input, ['eip155:1', 'eip155:2']);

      expect(input).toStrictEqual({
        requiredScopes: {
          'eip155:1': {
            accounts: ['eip155:1:0x1', 'eip155:1:0x2'],
          },
        },
        optionalScopes: {},
        sessionProperties: {},
        isMultichainOrigin: false,
      });
      expect(input).not.toStrictEqual(result);
    });
  });
});
