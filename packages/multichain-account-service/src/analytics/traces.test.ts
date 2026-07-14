import type { TraceRequest } from '@metamask/controller-utils';
import { AccountCreationType } from '@metamask/keyring-api';
import type { CreateAccountOptions } from '@metamask/keyring-api';

import type { Bip44AccountProvider } from '../providers';
import {
  toCreateAccountsV2DataTraces,
  toProviderDataTraces,
  traceFallback,
  TraceName,
} from './traces';

describe('MultichainAccountService - Traces', () => {
  describe('traceFallback', () => {
    let mockTraceRequest: TraceRequest;

    beforeEach(() => {
      mockTraceRequest = {
        name: TraceName.SnapDiscoverAccounts,
        id: 'trace-id-123',
        tags: {},
      };
    });

    it('returns undefined when no function is provided', async () => {
      const result = await traceFallback(mockTraceRequest);

      expect(result).toBeUndefined();
    });

    it('executes the provided function and return its result', async () => {
      const mockResult = 'test-result';
      const mockFn = jest.fn().mockReturnValue(mockResult);

      const result = await traceFallback(mockTraceRequest, mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith();
      expect(result).toBe(mockResult);
    });

    it('executes async function and return its result', async () => {
      const mockResult = { data: 'async-result' };
      const mockAsyncFn = jest.fn().mockResolvedValue(mockResult);

      const result = await traceFallback(mockTraceRequest, mockAsyncFn);

      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResult);
    });

    it('handles function that throws an error', async () => {
      const mockError = new Error('Test error');
      const mockFn = jest.fn().mockImplementation(() => {
        throw mockError;
      });

      await expect(traceFallback(mockTraceRequest, mockFn)).rejects.toThrow(
        mockError,
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('handles function that returns a rejected promise', async () => {
      const mockError = new Error('Async error');
      const mockFn = jest.fn().mockRejectedValue(mockError);

      await expect(traceFallback(mockTraceRequest, mockFn)).rejects.toThrow(
        mockError,
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('toProviderDataTraces', () => {
    const mockProvider = (name: string): Bip44AccountProvider =>
      ({ getName: () => name }) as unknown as Bip44AccountProvider;

    it('returns an empty object for an empty providers list', () => {
      expect(toProviderDataTraces([])).toStrictEqual({});
    });

    it('returns a single entry for a single provider', () => {
      expect(toProviderDataTraces([mockProvider('evm')])).toStrictEqual({
        evm: true,
      });
    });

    it('returns one entry per provider', () => {
      expect(
        toProviderDataTraces([mockProvider('evm'), mockProvider('btc')]),
      ).toStrictEqual({ evm: true, btc: true });
    });
  });

  describe('toCreateAccountsV2DataTraces', () => {
    it('returns groupIndex for bip44:derive-index options', () => {
      const options: CreateAccountOptions = {
        type: AccountCreationType.Bip44DeriveIndex,
        entropySource: 'entropy-source-id',
        groupIndex: 3,
      };

      expect(toCreateAccountsV2DataTraces(options)).toStrictEqual({
        groupIndex: 3,
      });
    });

    it('returns range bounds for bip44:derive-index-range options', () => {
      const options: CreateAccountOptions = {
        type: AccountCreationType.Bip44DeriveIndexRange,
        entropySource: 'entropy-source-id',
        range: { from: 0, to: 5 },
      };

      expect(toCreateAccountsV2DataTraces(options)).toStrictEqual({
        from: 0,
        to: 5,
      });
    });

    it('returns empty options otherwise', () => {
      const options: CreateAccountOptions = {
        type: AccountCreationType.Custom,
      };

      expect(toCreateAccountsV2DataTraces(options)).toStrictEqual({});
    });
  });
});
