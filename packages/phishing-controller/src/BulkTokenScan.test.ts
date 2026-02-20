import { safelyExecuteWithTimeout } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import nock, { cleanAll } from 'nock';

import {
  PhishingController,
  SECURITY_ALERTS_BASE_URL,
  TOKEN_BULK_SCANNING_ENDPOINT,
} from './PhishingController';
import type {
  PhishingControllerMessenger,
  PhishingControllerOptions,
} from './PhishingController';
import { TokenScanResultType } from './types';
import type { BulkTokenScanRequest, TokenScanApiResponse } from './types';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  safelyExecuteWithTimeout: jest.fn(),
}));

const mockSafelyExecuteWithTimeout =
  safelyExecuteWithTimeout as jest.MockedFunction<
    typeof safelyExecuteWithTimeout
  >;

const controllerName = 'PhishingController';

type AllPhishingControllerActions =
  MessengerActions<PhishingControllerMessenger>;

type AllPhishingControllerEvents = MessengerEvents<PhishingControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllPhishingControllerActions,
  AllPhishingControllerEvents,
  RootMessenger
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Constructs a messenger with transaction events enabled.
 *
 * @returns A restricted messenger that can listen to TransactionController events.
 */
function getMessengerWithTransactionEvents() {
  const rootMessenger = getRootMessenger();

  const messenger = new Messenger<
    typeof controllerName,
    AllPhishingControllerActions,
    AllPhishingControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [],
    events: ['TransactionController:stateChange'],
    messenger,
  });

  return {
    messenger,
  };
}

/**
 * Construct a Phishing Controller with the given options if any.
 *
 * @param options - The Phishing Controller options.
 * @returns The constructed Phishing Controller.
 */
function getPhishingController(options?: Partial<PhishingControllerOptions>) {
  return new PhishingController({
    messenger: getMessengerWithTransactionEvents().messenger,
    ...options,
  });
}

describe('PhishingController - Bulk Token Scanning', () => {
  let controller: PhishingController;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    controller = getPhishingController();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // Reset the mock to its default behavior (pass through to real implementation)
    mockSafelyExecuteWithTimeout.mockImplementation(
      (fn, throwOnTimeout, timeout) => {
        return jest
          .requireActual('@metamask/controller-utils')
          .safelyExecuteWithTimeout(fn, throwOnTimeout, timeout);
      },
    );
  });

  afterEach(() => {
    cleanAll();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('bulkScanTokens', () => {
    describe('input validation', () => {
      it('should return empty object when tokens array is empty', async () => {
        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens: [],
        };

        const result = await controller.bulkScanTokens(request);

        expect(result).toStrictEqual({});
      });

      it('should return empty object when tokens is null/undefined', async () => {
        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          // @ts-expect-error Testing invalid input
          tokens: null,
        };

        const result = await controller.bulkScanTokens(request);

        expect(result).toStrictEqual({});
      });

      it('should return empty object and log warning when too many tokens provided', async () => {
        const tokens = Array.from(
          { length: 101 },
          (_, i) => `0x${i.toString().padStart(40, '0')}`,
        );
        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(result).toStrictEqual({});
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Maximum of 100 tokens allowed per request',
        );
      });

      it('should return empty object and log warning for unknown chain ID', async () => {
        const request: BulkTokenScanRequest = {
          chainId: '0x999',
          tokens: ['0x1234567890123456789012345678901234567890'],
        };

        const result = await controller.bulkScanTokens(request);

        expect(result).toStrictEqual({});
        expect(consoleWarnSpy).toHaveBeenCalledWith('Unknown chain ID: 0x999');
      });

      it('should handle case insensitive chainId', async () => {
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            '0x1234567890123456789012345678901234567890': {
              result_type: TokenScanResultType.Benign,
            },
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0X1', // Mixed case
          tokens: ['0x1234567890123456789012345678901234567890'],
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({
          '0x1234567890123456789012345678901234567890': {
            result_type: TokenScanResultType.Benign,
            chain: '0x1', // Should be normalized to lowercase
            address: '0x1234567890123456789012345678901234567890',
          },
        });
      });
    });

    describe('successful API responses', () => {
      it('should return scan results for valid tokens', async () => {
        const tokens = [
          '0x1234567890123456789012345678901234567890',
          '0xABCDEF1234567890123456789012345678901234',
        ];
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            '0x1234567890123456789012345678901234567890': {
              result_type: TokenScanResultType.Benign,
            },
            '0xabcdef1234567890123456789012345678901234': {
              result_type: TokenScanResultType.Malicious,
              chain: 'ethereum',
              address: '0xabcdef1234567890123456789012345678901234',
            },
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT, {
            chain: 'ethereum',
            tokens: [
              '0x1234567890123456789012345678901234567890',
              '0xabcdef1234567890123456789012345678901234',
            ],
          })
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({
          '0x1234567890123456789012345678901234567890': {
            result_type: TokenScanResultType.Benign,
            chain: '0x1',
            address: '0x1234567890123456789012345678901234567890',
          },
          '0xabcdef1234567890123456789012345678901234': {
            result_type: TokenScanResultType.Malicious,
            chain: 'ethereum',
            address: '0xabcdef1234567890123456789012345678901234',
          },
        });
      });

      it('should handle partial API responses (some tokens missing)', async () => {
        const tokens = [
          '0x1234567890123456789012345678901234567890',
          '0xABCDEF1234567890123456789012345678901234',
        ];
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            '0x1234567890123456789012345678901234567890': {
              result_type: TokenScanResultType.Benign,
            },
            // Missing second token in response
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({
          '0x1234567890123456789012345678901234567890': {
            result_type: TokenScanResultType.Benign,
            chain: '0x1',
            address: '0x1234567890123456789012345678901234567890',
          },
          // Second token should be omitted
        });
      });

      it('should handle API response with no results field', async () => {
        const tokens = ['0x1234567890123456789012345678901234567890'];
        const mockApiResponse = {}; // No results field

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({});
      });

      it('should handle API response with results containing tokens without result_type', async () => {
        const tokens = ['0x1234567890123456789012345678901234567890'];
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            '0x1234567890123456789012345678901234567890': {
              // @ts-expect-error Testing invalid response
              result_type: undefined,
            },
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({});
      });
    });

    describe('API error responses', () => {
      it.each([
        [400, 'Bad Request'],
        [401, 'Unauthorized'],
        [403, 'Forbidden'],
        [404, 'Not Found'],
        [500, 'Internal Server Error'],
        [502, 'Bad Gateway'],
        [503, 'Service Unavailable'],
        [504, 'Gateway Timeout'],
      ])(
        'should handle %i HTTP error and return empty results',
        async (statusCode, statusText) => {
          const tokens = ['0x1234567890123456789012345678901234567890'];

          const scope = nock(SECURITY_ALERTS_BASE_URL)
            .post(TOKEN_BULK_SCANNING_ENDPOINT)
            .reply(statusCode, statusText);

          const request: BulkTokenScanRequest = {
            chainId: '0x1',
            tokens,
          };

          const result = await controller.bulkScanTokens(request);

          expect(scope.isDone()).toBe(true);
          expect(result).toStrictEqual({});
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            `Token bulk screening API error: ${statusCode} ${statusText}`,
          );
        },
      );

      it('should handle network errors and return empty results', async () => {
        const tokens = ['0x1234567890123456789012345678901234567890'];

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .replyWithError('Network error');

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({});

        // Check that console.error was called (may be called multiple times due to timeout)
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      });

      it('should handle API timeout and return empty results', async () => {
        const tokens = ['0x1234567890123456789012345678901234567890'];

        // Mock safelyExecuteWithTimeout to return null (simulating a timeout)
        mockSafelyExecuteWithTimeout.mockResolvedValueOnce(null);

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(result).toStrictEqual({});
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error scanning tokens: timeout of 8000ms exceeded',
        );
      });
    });

    describe('caching behavior', () => {
      it('should return cached results without making API calls', async () => {
        const tokens = ['0x1234567890123456789012345678901234567890'];
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            '0x1234567890123456789012345678901234567890': {
              result_type: TokenScanResultType.Benign,
            },
          },
        };

        // First call should hit the API
        const scope1 = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        // First call
        const result1 = await controller.bulkScanTokens(request);
        expect(scope1.isDone()).toBe(true);

        // Second call should use cache (no additional API call)
        const result2 = await controller.bulkScanTokens(request);

        expect(result1).toStrictEqual(result2);
        expect(result2).toStrictEqual({
          '0x1234567890123456789012345678901234567890': {
            result_type: TokenScanResultType.Benign,
            chain: '0x1',
            address: '0x1234567890123456789012345678901234567890',
          },
        });
      });

      it('should handle mixed cached and non-cached tokens', async () => {
        const cachedToken = '0x1234567890123456789012345678901234567890';
        const newToken = '0xABCDEF1234567890123456789012345678901234';

        // First, cache one token
        const scope1 = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, {
            results: {
              [cachedToken]: {
                result_type: TokenScanResultType.Benign,
              },
            },
          });

        await controller.bulkScanTokens({
          chainId: '0x1',
          tokens: [cachedToken],
        });

        expect(scope1.isDone()).toBe(true);

        // Now request both cached and new token
        const scope2 = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT, {
            chain: 'ethereum',
            tokens: [newToken.toLowerCase()], // Should only request the new token
          })
          .reply(200, {
            results: {
              [newToken.toLowerCase()]: {
                result_type: TokenScanResultType.Malicious,
              },
            },
          });

        const result = await controller.bulkScanTokens({
          chainId: '0x1',
          tokens: [cachedToken, newToken],
        });

        expect(scope2.isDone()).toBe(true);
        expect(result).toStrictEqual({
          [cachedToken]: {
            result_type: TokenScanResultType.Benign,
            chain: '0x1',
            address: cachedToken,
          },
          [newToken.toLowerCase()]: {
            result_type: TokenScanResultType.Malicious,
            chain: '0x1',
            address: newToken.toLowerCase(),
          },
        });
      });

      it('should handle case insensitive token addresses for caching', async () => {
        const tokenMixedCase = '0x1234567890123456789012345678901234567890';
        const tokenLowerCase = tokenMixedCase.toLowerCase();
        const tokenUpperCase = tokenMixedCase.toUpperCase();

        // First call with mixed case
        const scope1 = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, {
            results: {
              [tokenLowerCase]: {
                result_type: TokenScanResultType.Benign,
              },
            },
          });

        const result1 = await controller.bulkScanTokens({
          chainId: '0x1',
          tokens: [tokenMixedCase],
        });

        expect(scope1.isDone()).toBe(true);

        // Second call with uppercase should use cache
        const result2 = await controller.bulkScanTokens({
          chainId: '0x1',
          tokens: [tokenUpperCase],
        });

        expect(result1).toStrictEqual(result2);
        expect(result2[tokenLowerCase]).toBeDefined();
      });
    });

    describe('different chains', () => {
      it('should work with Polygon chain', async () => {
        const tokens = ['0x1234567890123456789012345678901234567890'];
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            '0x1234567890123456789012345678901234567890': {
              result_type: TokenScanResultType.Warning,
            },
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT, {
            chain: 'polygon',
            tokens,
          })
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x89', // Polygon
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({
          '0x1234567890123456789012345678901234567890': {
            result_type: TokenScanResultType.Warning,
            chain: '0x89',
            address: '0x1234567890123456789012345678901234567890',
          },
        });
      });

      it('should work with BSC chain', async () => {
        const tokens = ['0x1234567890123456789012345678901234567890'];
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            '0x1234567890123456789012345678901234567890': {
              result_type: TokenScanResultType.Spam,
            },
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT, {
            chain: 'bsc',
            tokens,
          })
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x38', // BSC
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({
          '0x1234567890123456789012345678901234567890': {
            result_type: TokenScanResultType.Spam,
            chain: '0x38',
            address: '0x1234567890123456789012345678901234567890',
          },
        });
      });
    });

    describe('non-EVM chains', () => {
      it('should work with Solana chain name', async () => {
        const tokens = [
          'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
          'SpamTokenAddress',
        ];
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr: {
              result_type: TokenScanResultType.Benign,
            },
            SpamTokenAddress: {
              result_type: TokenScanResultType.Spam,
            },
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT, {
            chain: 'solana',
            tokens,
          })
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: 'solana',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(result).toStrictEqual({
          Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr: {
            result_type: TokenScanResultType.Benign,
            chain: 'solana',
            address: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
          },
          SpamTokenAddress: {
            result_type: TokenScanResultType.Spam,
            chain: 'solana',
            address: 'SpamTokenAddress',
          },
        });
      });

      it('should preserve address casing for Solana tokens', async () => {
        const originalCaseToken =
          'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            [originalCaseToken]: {
              result_type: TokenScanResultType.Benign,
            },
          },
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT, {
            chain: 'solana',
            tokens: [originalCaseToken],
          })
          .reply(200, mockApiResponse);

        const result = await controller.bulkScanTokens({
          chainId: 'solana',
          tokens: [originalCaseToken],
        });

        expect(scope.isDone()).toBe(true);
        // Result key should preserve original casing
        expect(result[originalCaseToken]).toBeDefined();
        expect(result[originalCaseToken.toLowerCase()]).toBeUndefined();
      });

      it('should cache Solana token results', async () => {
        const token = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
        const mockApiResponse: TokenScanApiResponse = {
          results: {
            [token]: {
              result_type: TokenScanResultType.Benign,
            },
          },
        };

        // First call should hit the API
        const scope1 = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT)
          .reply(200, mockApiResponse);

        const result1 = await controller.bulkScanTokens({
          chainId: 'solana',
          tokens: [token],
        });
        expect(scope1.isDone()).toBe(true);

        // Second call should use cache (no additional API call)
        const result2 = await controller.bulkScanTokens({
          chainId: 'solana',
          tokens: [token],
        });

        expect(result1).toStrictEqual(result2);
        expect(result2[token]).toBeDefined();
      });
    });

    describe('maximum tokens boundary', () => {
      it('should successfully process exactly 100 tokens', async () => {
        const tokens = Array.from(
          { length: 100 },
          (_, i) => `0x${i.toString().padStart(40, '0')}`,
        );

        const mockResults: Record<
          string,
          { result_type: TokenScanResultType }
        > = {};
        tokens.forEach((token) => {
          mockResults[token] = { result_type: TokenScanResultType.Benign };
        });

        const mockApiResponse: TokenScanApiResponse = {
          results: mockResults,
        };

        const scope = nock(SECURITY_ALERTS_BASE_URL)
          .post(TOKEN_BULK_SCANNING_ENDPOINT, {
            chain: 'ethereum',
            tokens,
          })
          .reply(200, mockApiResponse);

        const request: BulkTokenScanRequest = {
          chainId: '0x1',
          tokens,
        };

        const result = await controller.bulkScanTokens(request);

        expect(scope.isDone()).toBe(true);
        expect(Object.keys(result)).toHaveLength(100);
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });
    });
  });
});
