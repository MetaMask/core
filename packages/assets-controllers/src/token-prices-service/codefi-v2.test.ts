import nock from 'nock';
import { useFakeTimers } from 'sinon';

import {
  CodefiTokenPricesServiceV2,
  SUPPORTED_CHAIN_IDS,
  SUPPORTED_CURRENCIES,
} from './codefi-v2';

// We're not customizing the default max delay
// The default can be found here: https://github.com/connor4312/cockatiel?tab=readme-ov-file#exponentialbackoff
const defaultMaxRetryDelay = 30_000;

describe('CodefiTokenPricesServiceV2', () => {
  describe('fetchTokenPrices', () => {
    it('uses the /spot-prices endpoint of the Codefi Price API to gather prices for the given tokens', async () => {
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .reply(200, {
          '0xaaa': {
            eth: 148.17205755299946,
          },
          '0xbbb': {
            eth: 33689.98134554716,
          },
          '0xccc': {
            eth: 148.1344197578456,
          },
        });

      const pricedTokensByAddress =
        await new CodefiTokenPricesServiceV2().fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        });

      expect(pricedTokensByAddress).toStrictEqual({
        '0xAAA': {
          tokenAddress: '0xAAA',
          value: 148.17205755299946,
          currency: 'ETH',
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          value: 33689.98134554716,
          currency: 'ETH',
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          value: 148.1344197578456,
          currency: 'ETH',
        },
      });
    });

    it('should not include token price object for token address when token price in not included the response data', async () => {
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .reply(200, {
          '0xbbb': {
            eth: 33689.98134554716,
          },
          '0xccc': {
            eth: 148.1344197578456,
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        chainId: '0x1',
        tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
        currency: 'ETH',
      });
      expect(result).toStrictEqual({
        '0xBBB': {
          tokenAddress: '0xBBB',
          value: 33689.98134554716,
          currency: 'ETH',
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          value: 148.1344197578456,
          currency: 'ETH',
        },
      });
    });

    it('should not include token price object for token address when price is undefined for token response data', async () => {
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .reply(200, {
          '0xaaa': {},
          '0xbbb': {
            eth: 33689.98134554716,
          },
          '0xccc': {
            eth: 148.1344197578456,
          },
        });

      const result = await new CodefiTokenPricesServiceV2().fetchTokenPrices({
        chainId: '0x1',
        tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
        currency: 'ETH',
      });

      expect(result).toStrictEqual({
        '0xBBB': {
          tokenAddress: '0xBBB',
          value: 33689.98134554716,
          currency: 'ETH',
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          value: 148.1344197578456,
          currency: 'ETH',
        },
      });
    });

    it('throws if the request fails consistently', async () => {
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .replyWithError('Failed to fetch')
        .persist();

      await expect(
        new CodefiTokenPricesServiceV2().fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('throws if the initial request and all retries fail', async () => {
      const retries = 3;
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .times(1 + retries)
        .replyWithError('Failed to fetch');

      await expect(
        new CodefiTokenPricesServiceV2({ retries }).fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        }),
      ).rejects.toThrow('Failed to fetch');
    });

    it('succeeds if the last retry succeeds', async () => {
      const retries = 3;
      // Initial interceptor for failing requests
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .times(retries)
        .replyWithError('Failed to fetch');
      // Interceptor for successful request
      nock('https://price-api.metafi.codefi.network')
        .get('/v2/chains/1/spot-prices')
        .query({
          tokenAddresses: '0xAAA,0xBBB,0xCCC',
          vsCurrency: 'ETH',
        })
        .reply(200, {
          '0xaaa': {
            eth: 148.17205755299946,
          },
          '0xbbb': {
            eth: 33689.98134554716,
          },
          '0xccc': {
            eth: 148.1344197578456,
          },
        });

      const pricedTokensByAddress = await new CodefiTokenPricesServiceV2({
        retries,
      }).fetchTokenPrices({
        chainId: '0x1',
        tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
        currency: 'ETH',
      });

      expect(pricedTokensByAddress).toStrictEqual({
        '0xAAA': {
          tokenAddress: '0xAAA',
          value: 148.17205755299946,
          currency: 'ETH',
        },
        '0xBBB': {
          tokenAddress: '0xBBB',
          value: 33689.98134554716,
          currency: 'ETH',
        },
        '0xCCC': {
          tokenAddress: '0xCCC',
          value: 148.1344197578456,
          currency: 'ETH',
        },
      });
    });

    describe('before circuit break', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = useFakeTimers({ now: Date.now() });
      });

      afterEach(() => {
        clock.restore();
      });

      it('does not call onDegraded when requests succeeds faster than threshold', async () => {
        const degradedThreshold = 1000;
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .delay(degradedThreshold / 2)
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          degradedThreshold,
          onDegraded: onDegradedHandler,
        });

        await service.fetchTokenPrices({
          chainId: '0x1',
          tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
          currency: 'ETH',
        });

        expect(onDegradedHandler).not.toHaveBeenCalled();
      });

      it('does not call onDegraded when requests succeeds on retry faster than threshold', async () => {
        // Set threshold above max retry delay to ensure the time is always under the threshold,
        // even with random jitter
        const degradedThreshold = defaultMaxRetryDelay + 1000;
        const retries = 1;
        // Initial interceptor for failing request
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .replyWithError('Failed to fetch');
        // Second interceptor for successful response
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .delay(500)
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          degradedThreshold,
          onDegraded: onDegradedHandler,
          retries,
        });

        await fetchTokenPricesWithFakeTimers({
          clock,
          fetchTokenPrices: () =>
            service.fetchTokenPrices({
              chainId: '0x1',
              tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
              currency: 'ETH',
            }),
          retries,
        });

        expect(onDegradedHandler).not.toHaveBeenCalled();
      });

      it('calls onDegraded when request fails', async () => {
        const retries = 0;
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .replyWithError('Failed to fetch');
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          onDegraded: onDegradedHandler,
          retries,
        });

        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices: () =>
              service.fetchTokenPrices({
                chainId: '0x1',
                tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
                currency: 'ETH',
              }),
            retries,
          }),
        ).rejects.toThrow('Failed to fetch');

        expect(onDegradedHandler).toHaveBeenCalledTimes(1);
      });

      it('calls onDegraded when request is slower than threshold', async () => {
        const degradedThreshold = 1000;
        const retries = 0;
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .delay(degradedThreshold * 2)
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          degradedThreshold,
          onDegraded: onDegradedHandler,
          retries,
        });

        await fetchTokenPricesWithFakeTimers({
          clock,
          fetchTokenPrices: () =>
            service.fetchTokenPrices({
              chainId: '0x1',
              tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
              currency: 'ETH',
            }),
          retries,
        });

        expect(onDegradedHandler).toHaveBeenCalledTimes(1);
      });

      it('calls onDegraded when request is slower than threshold after retry', async () => {
        const degradedThreshold = 1000;
        const retries = 1;
        // Initial interceptor for failing request
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .replyWithError('Failed to fetch');
        // Second interceptor for successful response
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .delay(degradedThreshold * 2)
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          degradedThreshold,
          onDegraded: onDegradedHandler,
          retries,
        });

        await fetchTokenPricesWithFakeTimers({
          clock,
          fetchTokenPrices: () =>
            service.fetchTokenPrices({
              chainId: '0x1',
              tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
              currency: 'ETH',
            }),
          retries,
        });

        expect(onDegradedHandler).toHaveBeenCalledTimes(1);
      });
    });

    describe('after circuit break', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = useFakeTimers({ now: Date.now() });
      });

      afterEach(() => {
        clock.restore();
      });

      it('stops making fetch requests after too many consecutive failures', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Initial interceptor for failing requests
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .times(maximumConsecutiveFailures)
          .replyWithError('Failed to fetch');
        // This interceptor should not be used
        const successfullCallScope = nock(
          'https://price-api.metafi.codefi.network',
        )
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          // Ensure break duration is well over the max delay for a single request, so that the
          // break doesn't end during a retry attempt
          circuitBreakDuration: defaultMaxRetryDelay * 10,
        });
        const fetchTokenPrices = () =>
          service.fetchTokenPrices({
            chainId: '0x1',
            tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
            currency: 'ETH',
          });
        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          // eslint-disable-next-line no-loop-func
          await expect(() =>
            fetchTokenPricesWithFakeTimers({
              clock,
              fetchTokenPrices,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }

        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow(
          'Execution prevented because the circuit breaker is open',
        );
        expect(successfullCallScope.isDone()).toBe(false);
      });

      it('calls onBreak handler upon break', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Initial interceptor for failing requests
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .times(maximumConsecutiveFailures)
          .replyWithError('Failed to fetch');
        // This interceptor should not be used
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const onBreakHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          // Ensure break duration is well over the max delay for a single request, so that the
          // break doesn't end during a retry attempt
          onBreak: onBreakHandler,
          circuitBreakDuration: defaultMaxRetryDelay * 10,
        });
        const fetchTokenPrices = () =>
          service.fetchTokenPrices({
            chainId: '0x1',
            tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
            currency: 'ETH',
          });
        expect(onBreakHandler).not.toHaveBeenCalled();

        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          // eslint-disable-next-line no-loop-func
          await expect(() =>
            fetchTokenPricesWithFakeTimers({
              clock,
              fetchTokenPrices,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }

        expect(onBreakHandler).toHaveBeenCalledTimes(1);
      });

      it('stops calling onDegraded after circuit break', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Initial interceptor for failing requests
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .times(maximumConsecutiveFailures)
          .replyWithError('Failed to fetch');
        const onBreakHandler = jest.fn();
        const onDegradedHandler = jest.fn();
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          // Ensure break duration is well over the max delay for a single request, so that the
          // break doesn't end during a retry attempt
          onBreak: onBreakHandler,
          onDegraded: onDegradedHandler,
          circuitBreakDuration: defaultMaxRetryDelay * 10,
        });
        const fetchTokenPrices = () =>
          service.fetchTokenPrices({
            chainId: '0x1',
            tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
            currency: 'ETH',
          });
        expect(onBreakHandler).not.toHaveBeenCalled();
        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          // eslint-disable-next-line no-loop-func
          await expect(() =>
            fetchTokenPricesWithFakeTimers({
              clock,
              fetchTokenPrices,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }
        // Confirm that circuit is broken
        expect(onBreakHandler).toHaveBeenCalledTimes(1);
        // Should be called twice by now, once per update attempt prior to break
        expect(onDegradedHandler).toHaveBeenCalledTimes(2);

        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow(
          'Execution prevented because the circuit breaker is open',
        );

        expect(onDegradedHandler).toHaveBeenCalledTimes(2);
      });

      it('keeps circuit closed if first request fails when half-open', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Ensure break duration is well over the max delay for a single request, so that the
        // break doesn't end during a retry attempt
        const circuitBreakDuration = defaultMaxRetryDelay * 10;
        // Initial interceptor for failing requests
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          // The +1 is for the additional request when the circuit is half-open
          .times(maximumConsecutiveFailures + 1)
          .replyWithError('Failed to fetch');
        // This interceptor should not be used
        const successfullCallScope = nock(
          'https://price-api.metafi.codefi.network',
        )
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          circuitBreakDuration,
        });
        const fetchTokenPrices = () =>
          service.fetchTokenPrices({
            chainId: '0x1',
            tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
            currency: 'ETH',
          });
        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          // eslint-disable-next-line no-loop-func
          await expect(() =>
            fetchTokenPricesWithFakeTimers({
              clock,
              fetchTokenPrices,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }
        // Confirm that circuit has broken
        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow(
          'Execution prevented because the circuit breaker is open',
        );
        // Wait for circuit to move to half-open
        await clock.tickAsync(circuitBreakDuration);

        // The circuit should remain open after the first request fails
        // The fetch error is replaced by the circuit break error due to the retries
        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow(
          'Execution prevented because the circuit breaker is open',
        );

        // Confirm that the circuit is still open
        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow(
          'Execution prevented because the circuit breaker is open',
        );
        expect(successfullCallScope.isDone()).toBe(false);
      });

      it('recovers after circuit break', async () => {
        const retries = 3;
        // Max consencutive failures is set to match number of calls in three update attempts (including retries)
        const maximumConsecutiveFailures = (1 + retries) * 3;
        // Ensure break duration is well over the max delay for a single request, so that the
        // break doesn't end during a retry attempt
        const circuitBreakDuration = defaultMaxRetryDelay * 10;
        // Initial interceptor for failing requests
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .times(maximumConsecutiveFailures)
          .replyWithError('Failed to fetch');
        // Later interceptor for successfull request after recovery
        nock('https://price-api.metafi.codefi.network')
          .get('/v2/chains/1/spot-prices')
          .query({
            tokenAddresses: '0xAAA,0xBBB,0xCCC',
            vsCurrency: 'ETH',
          })
          .reply(200, {
            '0xaaa': {
              eth: 148.17205755299946,
            },
            '0xbbb': {
              eth: 33689.98134554716,
            },
            '0xccc': {
              eth: 148.1344197578456,
            },
          });
        const service = new CodefiTokenPricesServiceV2({
          retries,
          maximumConsecutiveFailures,
          circuitBreakDuration,
        });
        const fetchTokenPrices = () =>
          service.fetchTokenPrices({
            chainId: '0x1',
            tokenAddresses: ['0xAAA', '0xBBB', '0xCCC'],
            currency: 'ETH',
          });
        // Initial three calls to exhaust maximum allowed failures
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _retryAttempt of Array(retries).keys()) {
          // eslint-disable-next-line no-loop-func
          await expect(() =>
            fetchTokenPricesWithFakeTimers({
              clock,
              fetchTokenPrices,
              retries,
            }),
          ).rejects.toThrow('Failed to fetch');
        }
        // Confirm that circuit has broken
        await expect(() =>
          fetchTokenPricesWithFakeTimers({
            clock,
            fetchTokenPrices,
            retries,
          }),
        ).rejects.toThrow(
          'Execution prevented because the circuit breaker is open',
        );
        // Wait for circuit to move to half-open
        await clock.tickAsync(circuitBreakDuration);

        const pricedTokensByAddress = await fetchTokenPricesWithFakeTimers({
          clock,
          fetchTokenPrices,
          retries,
        });

        expect(pricedTokensByAddress).toStrictEqual({
          '0xAAA': {
            tokenAddress: '0xAAA',
            value: 148.17205755299946,
            currency: 'ETH',
          },
          '0xBBB': {
            tokenAddress: '0xBBB',
            value: 33689.98134554716,
            currency: 'ETH',
          },
          '0xCCC': {
            tokenAddress: '0xCCC',
            value: 148.1344197578456,
            currency: 'ETH',
          },
        });
      });
    });
  });

  describe('validateChainIdSupported', () => {
    it.each(SUPPORTED_CHAIN_IDS)(
      'returns true if the given chain ID is %s',
      (chainId) => {
        expect(
          new CodefiTokenPricesServiceV2().validateChainIdSupported(chainId),
        ).toBe(true);
      },
    );

    it('returns false if the given chain ID is not one of the supported chain IDs', () => {
      expect(
        new CodefiTokenPricesServiceV2().validateChainIdSupported(
          '0x999999999999999',
        ),
      ).toBe(false);
    });
  });

  describe('validateCurrencySupported', () => {
    it.each(SUPPORTED_CURRENCIES)(
      'returns true if the given currency is %s',
      (currency) => {
        expect(
          new CodefiTokenPricesServiceV2().validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it.each(SUPPORTED_CURRENCIES.map((currency) => currency.toLowerCase()))(
      'returns true if the given currency is %s',
      (currency) => {
        expect(
          new CodefiTokenPricesServiceV2().validateCurrencySupported(currency),
        ).toBe(true);
      },
    );

    it('returns false if the given currency is not one of the supported currencies', () => {
      expect(
        new CodefiTokenPricesServiceV2().validateCurrencySupported('LOL'),
      ).toBe(false);
    });
  });
});

/**
 * Calls the 'fetchTokenPrices' function while advancing the clock, allowing
 * the function to resolve.
 *
 * Fetching token rates is challenging in an environment with fake timers
 * because we're using a library that automatically retries failed requests,
 * which uses `setTimeout` internally. We have to advance the clock after the
 * update call starts but before awaiting the result, otherwise it never
 * resolves.
 *
 * @param args - Arguments
 * @param args.clock - The fake timers clock to advance.
 * @param args.fetchTokenPrices - The "fetchTokenPrices" function to call.
 * @param args.retries - The number of retries the fetch call is configured to make.
 */
async function fetchTokenPricesWithFakeTimers({
  clock,
  fetchTokenPrices,
  retries,
}: {
  clock: sinon.SinonFakeTimers;
  fetchTokenPrices: () => Promise<unknown>;
  retries: number;
}) {
  const pendingUpdate = fetchTokenPrices();
  pendingUpdate.catch(() => {
    // suppress Unhandled Promise error
  });

  // Advance timer enough to exceed max possible retry delay for initial call, and all
  // subsequent retries
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _retryAttempt of Array(retries + 1).keys()) {
    await clock.tickAsync(defaultMaxRetryDelay);
  }

  return await pendingUpdate;
}
