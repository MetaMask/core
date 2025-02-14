import { providerErrors } from '@metamask/rpc-errors';
import type { StructError } from '@metamask/superstruct';
import { any, validate } from '@metamask/superstruct';
import type { JsonRpcRequest } from '@metamask/utils';

import {
  resemblesAddress,
  validateAndNormalizeKeyholder,
  validateParams,
} from './validation';

jest.mock('@metamask/superstruct', () => ({
  ...jest.requireActual('@metamask/superstruct'),
  validate: jest.fn(),
}));

const ADDRESS_MOCK = '0xABCDabcdABCDabcdABCDabcdABCDabcdABCDabcd';
const REQUEST_MOCK = {} as JsonRpcRequest;

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

  let getAccountsMock: jest.MockedFn<
    (req: JsonRpcRequest) => Promise<string[]>
  >;

  beforeEach(() => {
    jest.resetAllMocks();

    getAccountsMock = jest.fn().mockResolvedValue([ADDRESS_MOCK]);
  });

  describe('validateAndNormalizeKeyholder', () => {
    it('returns lowercase address', async () => {
      const result = await validateAndNormalizeKeyholder(
        ADDRESS_MOCK,
        REQUEST_MOCK,
        {
          getAccounts: getAccountsMock,
        },
      );

      expect(result).toBe(ADDRESS_MOCK.toLowerCase());
    });

    it('throws if address not returned by get accounts hook', async () => {
      getAccountsMock.mockResolvedValueOnce([]);

      await expect(
        validateAndNormalizeKeyholder(ADDRESS_MOCK, REQUEST_MOCK, {
          getAccounts: getAccountsMock,
        }),
      ).rejects.toThrow(providerErrors.unauthorized());
    });

    it('throws if address is not string', async () => {
      await expect(
        validateAndNormalizeKeyholder(123 as never, REQUEST_MOCK, {
          getAccounts: getAccountsMock,
        }),
      ).rejects.toThrow(
        'Invalid parameters: must provide an Ethereum address.',
      );
    });

    it('throws if address is empty string', async () => {
      await expect(
        validateAndNormalizeKeyholder('' as never, REQUEST_MOCK, {
          getAccounts: getAccountsMock,
        }),
      ).rejects.toThrow(
        'Invalid parameters: must provide an Ethereum address.',
      );
    });

    it('throws if address length is not 40', async () => {
      await expect(
        validateAndNormalizeKeyholder('0x123', REQUEST_MOCK, {
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
});
