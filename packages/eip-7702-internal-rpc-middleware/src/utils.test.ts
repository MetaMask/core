import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { object, string, number } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';

import { validateParams, validateAndNormalizeAddress } from './utils';

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

    expect(() => validateParams(invalidValue, testStruct)).toThrow(
      rpcErrors.invalidParams({
        message:
          'Invalid parameters\n\nname - Expected a string, but received: 123\nage - Expected a number, but received: "invalid"',
      }),
    );
  });

  it('formats validation errors with field paths', () => {
    const testStruct = object({
      name: string(),
      age: number(),
    });
    const invalidValue = { name: 123, age: 'invalid' };

    expect(() => validateParams(invalidValue, testStruct)).toThrow(
      rpcErrors.invalidParams({
        message:
          'Invalid parameters\n\nname - Expected a string, but received: 123\nage - Expected a number, but received: "invalid"',
      }),
    );
  });

  it('formats validation errors with empty path (root level errors)', () => {
    // Test with a struct that expects a string but gets a non-object
    const testStruct = string();
    const invalidValue = 123;

    expect(() => validateParams(invalidValue, testStruct)).toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters\n\nExpected a string, but received: 123',
      }),
    );
  });
});

describe('validateAndNormalizeAddress', () => {
  const mockOrigin = 'https://example.com';

  it('validates and normalizes a valid address', async () => {
    const validAddress = '0x1234567890123456789012345678901234567890';
    const getPermittedAccountsForOrigin = jest
      .fn()
      .mockResolvedValue([validAddress]);

    const result = await validateAndNormalizeAddress(
      validAddress,
      mockOrigin,
      getPermittedAccountsForOrigin,
    );

    expect(result).toBe(validAddress.toLowerCase());
    expect(getPermittedAccountsForOrigin).toHaveBeenCalledWith(mockOrigin);
  });

  it('throws error for invalid address format', async () => {
    const invalidAddress = '0xinvalid' as unknown as Hex;
    const getPermittedAccountsForOrigin = jest.fn();

    await expect(
      validateAndNormalizeAddress(
        invalidAddress,
        mockOrigin,
        getPermittedAccountsForOrigin,
      ),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an EVM address.',
      }),
    );
  });

  it('throws error for unauthorized account access', async () => {
    const address = '0x1234567890123456789012345678901234567890';
    const getPermittedAccountsForOrigin = jest
      .fn()
      .mockResolvedValue(['0x9999999999999999999999999999999999999999']);

    await expect(
      validateAndNormalizeAddress(
        address,
        mockOrigin,
        getPermittedAccountsForOrigin,
      ),
    ).rejects.toThrow(providerErrors.unauthorized());
  });

  it('throws error for empty string address', async () => {
    const address = '' as unknown as Hex;
    const getPermittedAccountsForOrigin = jest.fn();

    await expect(
      validateAndNormalizeAddress(
        address,
        mockOrigin,
        getPermittedAccountsForOrigin,
      ),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an EVM address.',
      }),
    );
  });

  it('throws error for non-string address', async () => {
    const address = 123 as unknown as Hex;
    const getPermittedAccountsForOrigin = jest.fn();

    await expect(
      validateAndNormalizeAddress(
        address,
        mockOrigin,
        getPermittedAccountsForOrigin,
      ),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an EVM address.',
      }),
    );
  });

  it('throws error for null address', async () => {
    const address = null as unknown as Hex;
    const getPermittedAccountsForOrigin = jest.fn();

    await expect(
      validateAndNormalizeAddress(
        address,
        mockOrigin,
        getPermittedAccountsForOrigin,
      ),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an EVM address.',
      }),
    );
  });

  it('throws error for undefined address', async () => {
    const address = undefined as unknown as Hex;
    const getPermittedAccountsForOrigin = jest.fn();

    await expect(
      validateAndNormalizeAddress(
        address,
        mockOrigin,
        getPermittedAccountsForOrigin,
      ),
    ).rejects.toThrow(
      rpcErrors.invalidParams({
        message: 'Invalid parameters: must provide an EVM address.',
      }),
    );
  });
});
