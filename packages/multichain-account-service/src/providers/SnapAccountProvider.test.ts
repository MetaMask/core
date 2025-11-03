import type { TraceCallback, TraceRequest } from '@metamask/controller-utils';

import { BtcAccountProvider } from './BtcAccountProvider';
import { isSnapAccountProvider } from './SnapAccountProvider';
import { SolAccountProvider } from './SolAccountProvider';
import { TrxAccountProvider } from './TrxAccountProvider';
import { traceFallback } from '../analytics';
import type { MultichainAccountServiceMessenger } from '../types';

jest.mock('../analytics', () => ({
  ...jest.requireActual('../analytics'),
  traceFallback: jest
    .fn()
    .mockImplementation(async (_request: TraceRequest, fn?: () => unknown) => {
      if (fn) {
        return await fn();
      }
      return undefined;
    }),
}));

describe('SnapAccountProvider', () => {
  describe('constructor default parameters', () => {
    const mockMessenger = {
      call: jest.fn().mockResolvedValue({}),
      registerActionHandler: jest.fn(),
      subscribe: jest.fn(),
      registerMethodActionHandlers: jest.fn(),
      unregisterActionHandler: jest.fn(),
      registerInitialEventPayload: jest.fn(),
      publish: jest.fn(),
      clearEventSubscriptions: jest.fn(),
    } as unknown as MultichainAccountServiceMessenger;

    beforeEach(() => {
      jest.clearAllMocks();
      (traceFallback as jest.Mock).mockClear();
    });

    it('creates SolAccountProvider with default trace using 1 parameter', () => {
      const provider = new SolAccountProvider(mockMessenger);
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with default trace using 2 parameters', () => {
      const provider = new SolAccountProvider(mockMessenger, undefined);
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with custom trace using 3 parameters', () => {
      const customTrace = jest.fn();
      const provider = new SolAccountProvider(
        mockMessenger,
        undefined,
        customTrace,
      );
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates SolAccountProvider with custom config and default trace', () => {
      const customConfig = {
        discovery: {
          timeoutMs: 3000,
          maxAttempts: 5,
          backOffMs: 2000,
        },
        createAccounts: {
          timeoutMs: 5000,
        },
      };
      const provider = new SolAccountProvider(mockMessenger, customConfig);
      expect(provider).toBeDefined();
      expect(provider.snapId).toBe(SolAccountProvider.SOLANA_SNAP_ID);
    });

    it('creates BtcAccountProvider with default trace', () => {
      // Test other subclasses to ensure branch coverage
      const btcProvider = new BtcAccountProvider(mockMessenger);

      expect(btcProvider).toBeDefined();
      expect(isSnapAccountProvider(btcProvider)).toBe(true);
    });

    it('creates TrxAccountProvider with custom trace', () => {
      const customTrace = jest.fn();

      // Explicitly test with all three parameters
      const trxProvider = new TrxAccountProvider(
        mockMessenger,
        undefined,
        customTrace,
      );

      expect(trxProvider).toBeDefined();
      expect(isSnapAccountProvider(trxProvider)).toBe(true);
    });

    it('creates provider without trace parameter', () => {
      // Test creating provider without passing trace parameter
      const provider = new SolAccountProvider(mockMessenger, undefined);

      expect(provider).toBeDefined();
    });

    it('tests parameter spreading to trigger branch coverage', () => {
      type SolConfig = ConstructorParameters<typeof SolAccountProvider>[1];
      type ProviderArgs = [
        MultichainAccountServiceMessenger,
        SolConfig?,
        TraceCallback?,
      ];
      const args: ProviderArgs = [mockMessenger];
      const provider1 = new SolAccountProvider(...args);

      args.push(undefined);
      args.push(jest.fn());
      const provider2 = new SolAccountProvider(...args);

      expect(provider1).toBeDefined();
      expect(provider2).toBeDefined();
    });
  });

  describe('isSnapAccountProvider', () => {
    it('returns false for plain object with snapId property', () => {
      const mockProvider = { snapId: 'test-snap-id' };

      expect(isSnapAccountProvider(mockProvider)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isSnapAccountProvider(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSnapAccountProvider(undefined)).toBe(false);
    });

    it('returns false for object without snapId property', () => {
      const mockProvider = { otherProperty: 'value' };

      expect(isSnapAccountProvider(mockProvider)).toBe(false);
    });

    it('returns false for primitive values', () => {
      expect(isSnapAccountProvider('string')).toBe(false);
      expect(isSnapAccountProvider(123)).toBe(false);
      expect(isSnapAccountProvider(true)).toBe(false);
    });

    it('returns true for actual SnapAccountProvider instance', () => {
      // Create a mock messenger with required methods
      const mockMessenger = {
        call: jest.fn(),
        registerActionHandler: jest.fn(),
        subscribe: jest.fn(),
        registerMethodActionHandlers: jest.fn(),
        unregisterActionHandler: jest.fn(),
        registerInitialEventPayload: jest.fn(),
        publish: jest.fn(),
        clearEventSubscriptions: jest.fn(),
      } as unknown as MultichainAccountServiceMessenger;

      const solProvider = new SolAccountProvider(mockMessenger);
      expect(isSnapAccountProvider(solProvider)).toBe(true);
    });
  });

  describe('trace functionality', () => {
    const mockMessenger = {
      call: jest.fn().mockResolvedValue({}),
      registerActionHandler: jest.fn(),
      subscribe: jest.fn(),
      registerMethodActionHandlers: jest.fn(),
      unregisterActionHandler: jest.fn(),
      registerInitialEventPayload: jest.fn(),
      publish: jest.fn(),
      clearEventSubscriptions: jest.fn(),
    } as unknown as MultichainAccountServiceMessenger;

    beforeEach(() => {
      jest.clearAllMocks();
      (traceFallback as jest.Mock).mockClear();
    });

    it('uses default trace parameter when only messenger is provided', async () => {
      const mockTraceCallback = traceFallback as jest.MockedFunction<
        typeof traceFallback
      >;
      mockTraceCallback.mockImplementation(async (_request, fn) => fn?.());

      // Test with only messenger parameter (uses default config and trace)
      const solProvider = new SolAccountProvider(mockMessenger);
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockResolvedValue('defaultResult');

      // Access protected trace method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (solProvider as any).trace(request, fn);

      expect(mockTraceCallback).toHaveBeenCalledTimes(1);
      expect(mockTraceCallback).toHaveBeenCalledWith(
        request,
        expect.any(Function),
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('uses custom trace when explicitly provided with all parameters', async () => {
      const customTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      // Test with all parameters including custom trace
      const solProvider = new SolAccountProvider(
        mockMessenger,
        {
          discovery: {
            timeoutMs: 2000,
            maxAttempts: 3,
            backOffMs: 1000,
          },
          createAccounts: {
            timeoutMs: 3000,
          },
        },
        customTrace,
      );
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockResolvedValue('customResult');

      // Access protected trace method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (solProvider as any).trace(request, fn);

      expect(result).toBe('customResult');
      expect(customTrace).toHaveBeenCalledTimes(1);
      expect(customTrace).toHaveBeenCalledWith(request, expect.any(Function));
      expect(traceFallback).not.toHaveBeenCalled();
    });

    it('calls trace callback with the correct arguments', async () => {
      const mockTrace = jest.fn().mockImplementation(async (request, fn) => {
        expect(request).toStrictEqual({
          name: 'Test Request',
          data: { test: 'data' },
        });
        return await fn();
      });

      const solProvider = new SolAccountProvider(
        mockMessenger,
        undefined,
        mockTrace,
      );
      const request = { name: 'Test Request', data: { test: 'data' } };
      const fn = jest.fn().mockResolvedValue('testResult');

      // Access protected trace method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (solProvider as any).trace(request, fn);

      expect(result).toBe('testResult');
      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('propagates errors through trace callback', async () => {
      const mockError = new Error('Test error');
      const mockTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      const solProvider = new SolAccountProvider(
        mockMessenger,
        undefined,
        mockTrace,
      );
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockRejectedValue(mockError);

      // Access protected trace method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((solProvider as any).trace(request, fn)).rejects.toThrow(
        mockError,
      );

      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('handles trace callback returning undefined', async () => {
      const mockTrace = jest.fn().mockImplementation(async (_request, fn) => {
        return await fn();
      });

      const solProvider = new SolAccountProvider(
        mockMessenger,
        undefined,
        mockTrace,
      );
      const request = { name: 'Test Request', data: {} };
      const fn = jest.fn().mockResolvedValue(undefined);

      // Access protected trace method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (solProvider as any).trace(request, fn);

      expect(result).toBeUndefined();
      expect(mockTrace).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
