import { rpcErrors } from '@metamask/rpc-errors';
import { any, validate } from '@metamask/superstruct';
import type { Hex, JsonRpcRequest } from '@metamask/utils';

import {
  validateParams,
  validateAndNormalizeAddress,
  resemblesAddress,
} from './utils';

jest.mock('@metamask/superstruct', () => ({
  ...jest.requireActual('@metamask/superstruct'),
  validate: jest.fn(),
}));

describe('validateParams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates parameters successfully', () => {
    const mockStruct = any();
    const mockValue = { test: 'value' };
    (validate as jest.Mock).mockReturnValue([undefined, mockValue]);

    expect(() => validateParams(mockValue, mockStruct)).not.toThrow();
    expect(validate).toHaveBeenCalledWith(mockValue, mockStruct);
  });

  it('throws error for invalid parameters', () => {
    const mockStruct = any();
    const mockValue = { test: 'value' };
    const mockError = {
      failures: () => [
        { path: ['test'], message: 'Invalid value' },
        { path: ['other'], message: 'Missing required field' },
      ],
    };
    (validate as jest.Mock).mockReturnValue([mockError, undefined]);

    expect(() => validateParams(mockValue, mockStruct)).toThrow(
      rpcErrors.invalidParams({
        message:
          'Invalid parameters\n\ntest - Invalid value\nother - Missing required field',
      }),
    );
  });

  it('handles validation errors with empty path', () => {
    const mockStruct = any();
    const mockValue = { test: 'value' };
    const mockError = {
      failures: () => [
        { path: [], message: 'Root level error' },
        { path: ['field1'], message: 'Field error' },
      ],
    };
    (validate as jest.Mock).mockReturnValue([mockError, undefined]);

    expect(() => validateParams(mockValue, mockStruct)).toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters\n\nRoot level error\nfield1 - Field error',
      }),
    );
  });
});

describe('validateAndNormalizeAddress', () => {
  const mockReq = { id: 1, method: 'test', jsonrpc: '2.0' } as JsonRpcRequest;

  it('validates and normalizes a valid address', async () => {
    const validAddress = '0x1234567890123456789012345678901234567890';
    const getAccounts = jest.fn().mockResolvedValue([validAddress]);

    const result = await validateAndNormalizeAddress(validAddress, mockReq, {
      getAccounts,
    });

    expect(result).toBe(validAddress.toLowerCase());
    expect(getAccounts).toHaveBeenCalledWith(mockReq);
  });

  it('throws error for invalid address format', async () => {
    const invalidAddress = '0xinvalid' as unknown as Hex;
    const getAccounts = jest.fn();

    await expect(
      validateAndNormalizeAddress(invalidAddress, mockReq, { getAccounts }),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an Ethereum address.',
      }),
    );
  });

  it('throws error for unauthorized account access', async () => {
    const address = '0x1234567890123456789012345678901234567890';
    const getAccounts = jest
      .fn()
      .mockResolvedValue(['0x9999999999999999999999999999999999999999']);

    await expect(
      validateAndNormalizeAddress(address, mockReq, { getAccounts }),
    ).rejects.toThrow(
      'The requested account and/or method has not been authorized by the user.',
    );
  });

  it('throws error for empty string address', async () => {
    const address = '' as unknown as Hex;
    const getAccounts = jest.fn();

    await expect(
      validateAndNormalizeAddress(address, mockReq, { getAccounts }),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an Ethereum address.',
      }),
    );
  });

  it('throws error for non-string address', async () => {
    const address = 123 as unknown as Hex;
    const getAccounts = jest.fn();

    await expect(
      validateAndNormalizeAddress(address, mockReq, { getAccounts }),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an Ethereum address.',
      }),
    );
  });

  it('throws error for null address', async () => {
    const address = null as unknown as Hex;
    const getAccounts = jest.fn();

    await expect(
      validateAndNormalizeAddress(address, mockReq, { getAccounts }),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an Ethereum address.',
      }),
    );
  });

  it('throws error for undefined address', async () => {
    const address = undefined as unknown as Hex;
    const getAccounts = jest.fn();

    await expect(
      validateAndNormalizeAddress(address, mockReq, { getAccounts }),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an Ethereum address.',
      }),
    );
  });
});

describe('resemblesAddress', () => {
  it('checks address-like format', () => {
    expect(resemblesAddress('0x1234567890123456789012345678901234567890')).toBe(
      true,
    );
    expect(resemblesAddress('0xABCDEFabcdef1234567890123456789012345678')).toBe(
      true,
    );
  });

  it('rejects non-address-like format', () => {
    expect(resemblesAddress('invalid')).toBe(false);
    expect(resemblesAddress('0x123')).toBe(false);
    expect(resemblesAddress('1234567890123456789012345678901234567890')).toBe(
      false,
    );
    expect(resemblesAddress('')).toBe(false);
  });
});
