import { MiddlewareContext } from '@metamask/json-rpc-engine/v2';
import { providerErrors } from '@metamask/rpc-errors';
import type { StructError } from '@metamask/superstruct';
import { any, validate } from '@metamask/superstruct';

import type { WalletMiddlewareKeyValues } from '../wallet';
import {
  resemblesAddress,
  validateAndNormalizeKeyholder,
  validateParams,
  validateTypedMessageKeys,
} from './validation';

jest.mock('@metamask/superstruct', () => ({
  ...jest.requireActual('@metamask/superstruct'),
  validate: jest.fn(),
}));

const ADDRESS_MOCK = '0xABCDabcdABCDabcdABCDabcdABCDabcdABCDabcd';
const createContext = (): MiddlewareContext<WalletMiddlewareKeyValues> =>
  new MiddlewareContext<WalletMiddlewareKeyValues>([['origin', 'test']]);

const STRUCT_ERROR_MOCK = {
  failures: () => [
    {
      path: ['test1', 'test2'],
      message: 'test message',
    },
    {
      path: ['test3'],
      message: 'test message 2',
    },
  ],
} as StructError;

describe('Validation Utils', () => {
  const validateMock = jest.mocked(validate);

  let getAccountsMock: jest.MockedFn<(origin: string) => Promise<string[]>>;

  beforeEach(() => {
    jest.resetAllMocks();

    getAccountsMock = jest.fn().mockResolvedValue([ADDRESS_MOCK]);
  });

  describe('validateAndNormalizeKeyholder', () => {
    it('returns lowercase address', async () => {
      const result = await validateAndNormalizeKeyholder(
        ADDRESS_MOCK,
        createContext(),
        {
          getAccounts: getAccountsMock,
        },
      );

      expect(result).toBe(ADDRESS_MOCK.toLowerCase());
    });

    it('throws if address not returned by get accounts hook', async () => {
      getAccountsMock.mockResolvedValueOnce([]);

      await expect(
        validateAndNormalizeKeyholder(ADDRESS_MOCK, createContext(), {
          getAccounts: getAccountsMock,
        }),
      ).rejects.toThrow(providerErrors.unauthorized());
    });

    it('throws if address is not string', async () => {
      await expect(
        validateAndNormalizeKeyholder(123 as never, createContext(), {
          getAccounts: getAccountsMock,
        }),
      ).rejects.toThrow(
        'Invalid parameters: must provide an Ethereum address.',
      );
    });

    it('throws if address is empty string', async () => {
      await expect(
        validateAndNormalizeKeyholder('' as never, createContext(), {
          getAccounts: getAccountsMock,
        }),
      ).rejects.toThrow(
        'Invalid parameters: must provide an Ethereum address.',
      );
    });

    it('throws if address length is not 40', async () => {
      await expect(
        validateAndNormalizeKeyholder('0x123', createContext(), {
          getAccounts: getAccountsMock,
        }),
      ).rejects.toThrow(
        'Invalid parameters: must provide an Ethereum address.',
      );
    });
  });

  describe('resemblesAddress', () => {
    it('returns true if valid address', () => {
      expect(resemblesAddress(ADDRESS_MOCK)).toBe(true);
    });

    it('returns false if length not correct', () => {
      expect(resemblesAddress('0x123')).toBe(false);
    });
  });

  describe('validateParams', () => {
    it('does now throw if superstruct returns no error', () => {
      validateMock.mockReturnValue([undefined, undefined]);
      expect(() => validateParams({}, any())).not.toThrow();
    });

    it('throws if superstruct returns error', () => {
      validateMock.mockReturnValue([STRUCT_ERROR_MOCK, undefined]);

      expect(() => validateParams({}, any()))
        .toThrowErrorMatchingInlineSnapshot(`
        "Invalid params

        test1 > test2 - test message
        test3 - test message 2"
      `);
    });
  });

  describe('validateTypedMessageKeys', () => {
    it('does not throw for data with only schema-defined keys', () => {
      const data = JSON.stringify({
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }],
        },
      });

      expect(() => validateTypedMessageKeys(data)).not.toThrow();
    });

    it('throws for data with extraneous keys', () => {
      const data = JSON.stringify({
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }],
        },
        primaryType: 'EIP712Domain',
        domain: {},
        message: {},
        extraKey: 'unexpected',
      });

      expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
    });

    it('throws when data contains only extraneous keys', () => {
      const data = JSON.stringify({
        foo: 'bar',
        baz: 123,
      });

      expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
    });

    describe('metadata', () => {
      const baseTypedData = {
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }],
        },
        primaryType: 'EIP712Domain',
        domain: {},
        message: {},
      };

      it('does not throw when metadata has exactly justification and origin as strings', () => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: {
            justification: 'Permission to spend tokens',
            origin: 'https://example.com',
          },
        });

        expect(() => validateTypedMessageKeys(data)).not.toThrow();
      });

      it('does not throw when metadata is the only top-level key', () => {
        const data = JSON.stringify({
          metadata: {
            justification: 'Permission to spend tokens',
            origin: 'https://example.com',
          },
        });

        expect(() => validateTypedMessageKeys(data)).not.toThrow();
      });

      it.each([
        ['null', null],
        ['a string', 'not-an-object'],
        ['a number', 42],
        ['a boolean', true],
        ['an array', ['justification', 'origin']],
      ])('throws when metadata is %s', (_label, value) => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: value,
        });

        expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
      });

      it('throws when metadata is missing justification', () => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: {
            origin: 'https://example.com',
          },
        });

        expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
      });

      it('throws when metadata is missing origin', () => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: {
            justification: 'Permission to spend tokens',
          },
        });

        expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
      });

      it('throws when metadata.justification is not a string', () => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: {
            justification: 123,
            origin: 'https://example.com',
          },
        });

        expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
      });

      it('throws when metadata.origin is not a string', () => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: {
            justification: 'Permission to spend tokens',
            origin: 123,
          },
        });

        expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
      });

      it('throws when metadata has an extraneous third key', () => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: {
            justification: 'Permission to spend tokens',
            origin: 'https://example.com',
            extra: 'unexpected',
          },
        });

        expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
      });

      it('throws when metadata is an empty object', () => {
        const data = JSON.stringify({
          ...baseTypedData,
          metadata: {},
        });

        expect(() => validateTypedMessageKeys(data)).toThrow('Invalid input.');
      });
    });
  });
});
