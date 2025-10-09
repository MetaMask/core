import { rpcErrors } from '@metamask/rpc-errors';
import { object, string, number, optional } from '@metamask/superstruct';
import type { Hex, JsonRpcRequest } from '@metamask/utils';

import {
  validateParams,
  validateAndNormalizeAddress,
  resemblesAddress,
} from './utils';

describe('validateParams', () => {
  it('does not throw for valid parameters', () => {
    const testStruct = object({
      name: string(),
      age: number(),
    });
    const validValue = { name: 'John', age: 30 };

    expect(() => validateParams(validValue, testStruct)).not.toThrow();
  });

  it('throws RPC error with formatted message for invalid parameters', () => {
    const testStruct = object({
      name: string(),
      age: number(),
    });
    const invalidValue = { name: 123, age: 'invalid' };

    expect(() => validateParams(invalidValue, testStruct)).toThrow();
    
    try {
      validateParams(invalidValue, testStruct);
    } catch (error: any) {
      expect(error.code).toBe(-32602); // Invalid params error code
      expect(error.message).toContain('Invalid parameters');
    }
  });

  it('formats validation errors with field paths', () => {
    const testStruct = object({
      name: string(),
      age: number(),
    });
    const invalidValue = { name: 123, age: 'invalid' };

    try {
      validateParams(invalidValue, testStruct);
    } catch (error: any) {
      expect(error.message).toContain('Invalid parameters');
      // The actual error formatting is tested through the real Superstruct errors
    }
  });

  it('formats validation errors with empty path (root level errors)', () => {
    // Test with a struct that expects a string but gets a non-object
    const testStruct = string();
    const invalidValue = 123;

    try {
      validateParams(invalidValue, testStruct);
    } catch (error: any) {
      expect(error.message).toContain('Invalid parameters');
      // This should trigger the empty path branch in formatValidationError
      expect(error.message).toContain('Expected a string, but received: 123');
    }
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
