import { MiddlewareContext } from '@metamask/json-rpc-engine/v2';
import { providerErrors } from '@metamask/rpc-errors';
import type { StructError } from '@metamask/superstruct';
import { any, validate } from '@metamask/superstruct';

import type { WalletMiddlewareKeyValues } from '../wallet.js';
import {
  MAX_TRANSACTION_PARAMS_SIZE_BYTES,
  resemblesAddress,
  validateAndNormalizeKeyholder,
  validateParams,
  validateTransactionParams,
  validateTypedMessageKeys,
} from './validation.js';

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

  describe('validateTransactionParams', () => {
    const VALID_FROM = '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb';
    const VALID_TO = '0xdac17f958d2ee523a2206206994597c13d831ec7';

    beforeEach(() => {
      const actual = jest.requireActual<{
        validate: typeof validate;
      }>('@metamask/superstruct');
      validateMock.mockImplementation(actual.validate);
    });

    it('does not throw for minimal valid params', () => {
      expect(() =>
        validateTransactionParams({ from: VALID_FROM }),
      ).not.toThrow();
    });

    it('does not throw for the full valid param set', () => {
      expect(() =>
        validateTransactionParams({
          accessList: [
            {
              address: VALID_TO,
              storageKeys: ['0x00', '0x01'],
            },
          ],
          authorizationList: [
            {
              chainId: '0x1',
              address: VALID_TO,
              nonce: '0x0',
            },
          ],
          chainId: '0x1',
          data: '0x095ea7b3',
          from: VALID_FROM,
          gas: '0x5208',
          gasLimit: '0x5208',
          gasPrice: '0x1',
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: '0x1',
          nonce: '0x0',
          to: VALID_TO,
          type: '0x2',
          value: '0x0',
        }),
      ).not.toThrow();
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'not-an-object'],
      ['a number', 42],
      ['a boolean', true],
      ['an array', [{ from: VALID_FROM }]],
    ])('throws when params is %s', (_label, value) => {
      expect(() => validateTransactionParams(value)).toThrow(/Invalid params/u);
    });

    it('throws for an extraneous top-level key', () => {
      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          to: VALID_TO,
          extraKey: 'unexpected',
        }),
      ).toThrow(/Invalid params/u);
    });

    it('throws when params contain an extraneous key with a deeply-nested value', () => {
      let junk: Record<string, unknown> = {};
      for (let i = 0; i < 1200; i++) {
        junk = { b: junk };
      }

      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          to: VALID_TO,
          value: '0x0',
          data: '0x095ea7b3',
          test: junk,
        }),
      ).toThrow(/Invalid params/u);
    });

    it('rejects an extraneous top-level key without walking its value (JSON.stringify never called)', () => {
      const stringifySpy = jest.spyOn(JSON, 'stringify');

      const params = {
        from: VALID_FROM,
        to: VALID_TO,
        test: {
          get b(): never {
            throw new Error('subtree must not be walked');
          },
        },
      };

      let thrown: unknown;
      try {
        validateTransactionParams(params);
      } catch (error) {
        thrown = error;
      }
      const stringifyCallsAtRejection = stringifySpy.mock.calls.length;
      stringifySpy.mockRestore();

      expect(thrown).toBeInstanceOf(Error);
      expect(stringifyCallsAtRejection).toBe(0);
    });

    it('throws when a typed field has the wrong type', () => {
      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          to: { nested: 'not-an-address' },
        }),
      ).toThrow(/Invalid params/u);
    });

    it('throws when `to` is not a hex address', () => {
      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          to: 'not-an-address',
        }),
      ).toThrow(/Invalid params/u);
    });

    it('throws when `data` is not a hex string', () => {
      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          data: 1234 as unknown as string,
        }),
      ).toThrow(/Invalid params/u);
    });

    it('throws when `accessList` entries are malformed', () => {
      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          accessList: [{ address: 'not-hex', storageKeys: 'not-an-array' }],
        }),
      ).toThrow(/Invalid params/u);
    });

    it('throws for a data-padding attack that passes the schema', () => {
      const padded = `0x${'00'.repeat(MAX_TRANSACTION_PARAMS_SIZE_BYTES)}`;

      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          to: VALID_TO,
          data: padded,
        }),
      ).toThrow('Invalid input.');
    });

    it('throws for an accessList-padding attack that passes the schema', () => {
      const padded = Array.from(
        { length: Math.ceil(MAX_TRANSACTION_PARAMS_SIZE_BYTES / 64) },
        () => ({
          address: VALID_TO,
          storageKeys: [`0x${'00'.repeat(32)}`],
        }),
      );

      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          to: VALID_TO,
          accessList: padded,
        }),
      ).toThrow('Invalid input.');
    });

    it('does not throw for a legitimate multi-entry accessList well under the size limit', () => {
      const entries = Array.from({ length: 16 }, () => ({
        address: VALID_TO,
        storageKeys: [`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`],
      }));

      expect(() =>
        validateTransactionParams({
          from: VALID_FROM,
          to: VALID_TO,
          accessList: entries,
        }),
      ).not.toThrow();
    });
  });
});
