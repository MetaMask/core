/* eslint-disable no-loop-func */
import {
  buildMockParams,
  buildRequestWithReplacedBlockParam,
  ProviderType,
  waitForNextBlockTracker,
  waitForPromiseToBeFulfilledAfterRunningAllTimers,
  withMockedCommunications,
  withNetworkClient,
} from './helpers';
import {
  buildFetchFailedErrorMessage,
  buildInfuraClientRetriesExhaustedErrorMessage,
} from './shared-tests';

type TestsForRpcMethodSupportingBlockParam = {
  providerType: ProviderType;
  blockParamIndex: number;
  numberOfParameters: number;
};

export const testsForRpcMethodSupportingBlockParam = (
  method: string,
  {
    blockParamIndex,
    numberOfParameters,
    providerType,
  }: TestsForRpcMethodSupportingBlockParam,
) => {
  describe.each([
    ['given no block tag', undefined],
    ['given a block tag of "latest"', 'latest'],
  ])('%s', (_desc, blockParam) => {
    it('does not hit the RPC endpoint more than once for identical requests', async () => {
      const requests = [
        {
          method,
          params: buildMockParams({ blockParamIndex, blockParam }),
        },
        { method, params: buildMockParams({ blockParamIndex, blockParam }) },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ providerType }, async (comms) => {
        // The first time a block-cacheable request is made, the block-cache
        // middleware will request the latest block number through the block
        // tracker to determine the cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[0],
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: { result: mockResults[0] },
        });

        const results = await withNetworkClient(
          { providerType },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
      });
    });

    for (const paramIndex of [...Array(numberOfParameters).keys()]) {
      if (paramIndex === blockParamIndex) {
        // testing changes in block param is covered under later tests
        continue;
      }

      it(`does not reuse the result of a previous request if parameter at index "${paramIndex}" differs`, async () => {// eslint-disable-line
        const firstMockParams = [
          ...new Array(numberOfParameters).fill('some value'),
        ];
        firstMockParams[blockParamIndex] = blockParam;
        const secondMockParams = firstMockParams.slice();
        secondMockParams[paramIndex] = 'another value';
        const requests = [
          {
            method,
            params: firstMockParams,
          },
          { method, params: secondMockParams },
        ];
        const mockResults = ['first result', 'second result'];

        await withMockedCommunications({ providerType }, async (comms) => {
          // The first time a block-cacheable request is made, the block-cache
          // middleware will request the latest block number through the block
          // tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              requests[0],
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: { result: mockResults[0] },
          });

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              requests[1],
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: { result: mockResults[1] },
          });

          const results = await withNetworkClient(
            { providerType },
            ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
          );

          expect(results).toStrictEqual([mockResults[0], mockResults[1]]);
        });
      });
    }

    it('hits the RPC endpoint and does not reuse the result of a previous request if the latest block number was updated since', async () => {
      const requests = [
        { method, params: buildMockParams({ blockParamIndex, blockParam }) },
        { method, params: buildMockParams({ blockParamIndex, blockParam }) },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ providerType }, async (comms) => {
        // Note that we have to mock these requests in a specific order.
        // The first block tracker request occurs because of the first RPC
        // request. The second block tracker request, however, does not
        // occur because of the second RPC request, but rather because we
        // call `clock.runAll()` below.
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[0],
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: { result: mockResults[0] },
        });
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x200' });
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[1],
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: { result: mockResults[1] },
        });

        const results = await withNetworkClient(
          { providerType },
          async (client) => {
            const firstResult = await client.makeRpcCall(requests[0]);
            // Proceed to the next iteration of the block tracker so that a
            // new block is fetched and the current block is updated.
            await waitForNextBlockTracker(client.blockTracker, client.clock);
            const secondResult = await client.makeRpcCall(requests[1]);
            return [firstResult, secondResult];
          },
        );

        expect(results).toStrictEqual(mockResults);
      });
    });

    for (const emptyValue of [null, undefined, '\u003cnil\u003e']) {
      it(`does not retry an empty response of "${emptyValue}"`, async () => {
        const request = {
          method,
          params: buildMockParams({ blockParamIndex, blockParam }),
        };
        const mockResult = emptyValue;

        await withMockedCommunications({ providerType }, async (comms) => {
          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: { result: mockResult },
          });

          const result = await withNetworkClient(
            { providerType },
            ({ makeRpcCall }) => makeRpcCall(request),
          );

          expect(result).toStrictEqual(mockResult);
        });
      });

      it(`does not reuse the result of a previous request if it was "${emptyValue}"`, async () => {
        const requests = [
          { method, params: buildMockParams({ blockParamIndex, blockParam }) },
          { method, params: buildMockParams({ blockParamIndex, blockParam }) },
        ];
        const mockResults = [emptyValue, 'some result'];

        await withMockedCommunications({ providerType }, async (comms) => {
          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              requests[0],
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: { result: mockResults[0] },
          });
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              requests[1],
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: { result: mockResults[1] },
          });

          const results = await withNetworkClient(
            { providerType },
            ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
          );

          expect(results).toStrictEqual(mockResults);
        });
      });
    }

    it('queues requests while a previous identical call is still pending, then runs the queue when it finishes, reusing the result from the first request', async () => {
      const requests = [
        { method, params: buildMockParams({ blockParam, blockParamIndex }) },
        { method, params: buildMockParams({ blockParam, blockParamIndex }) },
        { method, params: buildMockParams({ blockParam, blockParamIndex }) },
      ];
      const mockResults = ['first result', 'second result', 'third result'];

      await withMockedCommunications({ providerType }, async (comms) => {
        // The first time a block-cacheable request is made, the
        // block-cache middleware will request the latest block number
        // through the block tracker to determine the cache key.
        comms.mockNextBlockTrackerRequest();
        // A second block tracker request is made for some reason
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          delay: 100,
          request: buildRequestWithReplacedBlockParam(
            requests[0],
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: { result: mockResults[0] },
        });

        // The previous two requests will happen again, in the same order.
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[1],
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: { result: mockResults[1] },
        });

        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[2],
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: { result: mockResults[2] },
        });

        const results = await withNetworkClient(
          { providerType },
          async (client) => {
            const resultPromises = [
              client.makeRpcCall(requests[0]),
              client.makeRpcCall(requests[1]),
              client.makeRpcCall(requests[2]),
            ];
            const firstResult = await resultPromises[0];
            // The inflight cache middleware uses setTimeout to run the
            // handlers, so run them now
            client.clock.runAll();
            const remainingResults = await Promise.all(resultPromises.slice(1));
            return [firstResult, ...remainingResults];
          },
        );

        expect(results).toStrictEqual([
          mockResults[0],
          mockResults[0],
          mockResults[0],
        ]);
      });
    });

    it('throws an error with a custom message if the request to the RPC endpoint returns a 405 response', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = {
          method,
          params: buildMockParams({ blockParam, blockParamIndex }),
        };

        // The first time a block-cacheable request is made, the
        // block-cache middleware will request the latest block number
        // through the block tracker to determine the cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            request,
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: {
            httpStatus: 405,
          },
        });
        const promiseForResult = withNetworkClient(
          { providerType },
          async ({ makeRpcCall }) => makeRpcCall(request),
        );

        await expect(promiseForResult).rejects.toThrow(
          'The method does not exist / is not available',
        );
      });
    });

    // There is a difference in how we are testing the Infura middleware vs. the
    // custom RPC middleware (or, more specifically, the fetch middleware)
    // because of what both middleware treat as rate limiting errors. In this
    // case, the fetch middleware treats a 418 response from the RPC endpoint as
    // such an error, whereas to the Infura middleware, it is a 429 response.
    if (providerType === 'infura') {
      it('throws a generic, undescriptive error if the request to the RPC endpoint returns a 418 response', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            id: 123,
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              httpStatus: 418,
            },
          });
          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall }) => makeRpcCall(request),
          );

          await expect(promiseForResult).rejects.toThrow(
            '{"id":123,"jsonrpc":"2.0"}',
          );
        });
      });

      it('throws an error with a custom message if the request to the RPC endpoint returns a 429 response', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              httpStatus: 429,
            },
          });
          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall }) => makeRpcCall(request),
          );

          await expect(promiseForResult).rejects.toThrow(
            'Request is being rate limited',
          );
        });
      });
    } else {
      it('throws an error with a custom message if the request to the RPC endpoint returns a 418 response', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              httpStatus: 418,
            },
          });
          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall }) => makeRpcCall(request),
          );

          await expect(promiseForResult).rejects.toThrow(
            'Request is being rate limited.',
          );
        });
      });

      it('throws an undescriptive error if the request to the RPC endpoint returns a 429 response', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              httpStatus: 429,
            },
          });
          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall }) => makeRpcCall(request),
          );

          await expect(promiseForResult).rejects.toThrow(
            "Non-200 status code: '429'",
          );
        });
      });
    }

    it('throws an undescriptive error message if the request to the RPC endpoint returns a response that is not 405, 418, 429, 503, or 504', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = {
          method,
          params: buildMockParams({ blockParam, blockParamIndex }),
        };

        // The first time a block-cacheable request is made, the
        // block-cache middleware will request the latest block number
        // through the block tracker to determine the cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            request,
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: {
            id: 12345,
            error: 'some error',
            httpStatus: 420,
          },
        });
        const promiseForResult = withNetworkClient(
          { providerType },
          async ({ makeRpcCall }) => makeRpcCall(request),
        );

        const msg =
          providerType === 'infura'
            ? '{"id":12345,"jsonrpc":"2.0","error":"some error"}'
            : "Non-200 status code: '420'";
        await expect(promiseForResult).rejects.toThrow(msg);
      });
    });

    [503, 504].forEach((httpStatus) => {
      it(`retries the request to the RPC endpoint up to 5 times if it returns a ${httpStatus} response, returning the successful result if there is one on the 5th try`, async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          // Here we have the request fail for the first 4 tries, then succeed
          // on the 5th try.
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              error: 'some error',
              httpStatus,
            },
            times: 4,
          });

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              result: 'the result',
              httpStatus: 200,
            },
          });
          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toStrictEqual('the result');
        });
      });

      // Both the Infura middleware and custom RPC middleware detect a 503 or 504
      // response and retry the request to the RPC endpoint automatically but
      // differ in what sort of response is returned when the number of retries is
      // exhausted.
      if (providerType === 'infura') {
        it(`causes a request to fail with a custom error if the request to the RPC endpoint returns a ${httpStatus} response 5 times in a row`, async () => {
          await withMockedCommunications({ providerType }, async (comms) => {
            const request = {
              method,
              params: buildMockParams({ blockParam, blockParamIndex }),
            };

            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key.
            comms.mockNextBlockTrackerRequest();
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                request,
                blockParamIndex,
                blockParam === undefined ? null : 'latest',
              ),
              response: {
                error: 'Some error',
                httpStatus,
              },
              times: 5,
            });
            const promiseForResult = withNetworkClient(
              { providerType },
              async ({ makeRpcCall, clock }) => {
                return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                  makeRpcCall(request),
                  clock,
                );
              },
            );
            await expect(promiseForResult).rejects.toThrow(
              buildInfuraClientRetriesExhaustedErrorMessage('Gateway timeout'),
            );
          });
        });
      } else {
        it(`produces a response without a result if the request to the RPC endpoint returns a ${httpStatus} response 5 times in a row`, async () => {
          await withMockedCommunications({ providerType }, async (comms) => {
            const request = {
              method,
              params: buildMockParams({ blockParam, blockParamIndex }),
            };

            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key.
            comms.mockNextBlockTrackerRequest();
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                request,
                blockParamIndex,
                blockParam === undefined ? null : 'latest',
              ),
              response: {
                error: 'Some error',
                httpStatus,
              },
              times: 5,
            });
            const result = await withNetworkClient(
              { providerType },
              async ({ makeRpcCall, clock }) => {
                return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                  makeRpcCall(request),
                  clock,
                );
              },
            );
            expect(result).toBeUndefined();
          });
        });
      }
    });

    it('retries the request to the RPC endpoint up to 5 times if an "ETIMEDOUT" error is thrown while making the request, returning the successful result if there is one on the 5th try', async () => {
      await withMockedCommunications({ providerType }, async (comms) => {
        const request = {
          method,
          params: buildMockParams({ blockParam, blockParamIndex }),
        };

        // The first time a block-cacheable request is made, the
        // block-cache middleware will request the latest block number
        // through the block tracker to determine the cache key.
        comms.mockNextBlockTrackerRequest();
        // Here we have the request fail for the first 4 tries, then
        // succeed on the 5th try.
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            request,
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          error: 'ETIMEDOUT: Some message',
          times: 4,
        });

        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            request,
            blockParamIndex,
            blockParam === undefined ? null : 'latest',
          ),
          response: {
            result: 'the result',
            httpStatus: 200,
          },
        });

        const result = await withNetworkClient(
          { providerType },
          async ({ makeRpcCall, clock }) => {
            return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
              makeRpcCall(request),
              clock,
            );
          },
        );

        expect(result).toStrictEqual('the result');
      });
    });

    // Both the Infura and fetch middleware detect ETIMEDOUT errors and will
    // automatically retry the request to the RPC endpoint in question, but each
    // produces a different error if the number of retries is exhausted.
    if (providerType === 'infura') {
      it('causes a request to fail with a custom error if an "ETIMEDOUT" error is thrown while making the request to the RPC endpoint 5 times in a row', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'ETIMEDOUT: Some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
            times: 5,
          });

          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          await expect(promiseForResult).rejects.toThrow(
            buildInfuraClientRetriesExhaustedErrorMessage(errorMessage),
          );
        });
      });
    } else {
      it('produces a response without a result if an "ETIMEDOUT" error is thrown while making the request to the RPC endpoint 5 times in a row', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'ETIMEDOUT: Some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
            times: 5,
          });

          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toBeUndefined();
        });
      });
    }

    // The Infura middleware treats a response that contains an ECONNRESET
    // message as an innocuous error that is likely to disappear on a retry. The
    // custom RPC middleware, on the other hand, does not specially handle this
    // error.
    if (providerType === 'infura') {
      it('retries the request to the RPC endpoint up to 5 times if an "ECONNRESET" error is thrown while making the request, returning the successful result if there is one on the 5th try', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          // Here we have the request fail for the first 4 tries, then
          // succeed on the 5th try.
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: 'ECONNRESET: Some message',
            times: 4,
          });

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              result: 'the result',
              httpStatus: 200,
            },
          });

          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toStrictEqual('the result');
        });
      });

      it('causes a request to fail with a custom error if an "ECONNRESET" error is thrown while making the request to the RPC endpoint 5 times in a row', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'ECONNRESET: Some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
            times: 5,
          });

          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          await expect(promiseForResult).rejects.toThrow(
            buildInfuraClientRetriesExhaustedErrorMessage(errorMessage),
          );
        });
      });
    } else {
      it('does not retry the request to the RPC endpoint, but throws immediately, if an "ECONNRESET" error is thrown while making the request', async () => {
        const customRpcUrl = 'http://example.com';

        await withMockedCommunications(
          { providerType, customRpcUrl },
          async (comms) => {
            const request = {
              method,
              params: buildMockParams({ blockParam, blockParamIndex }),
            };
            const errorMessage = 'ECONNRESET: Some message';

            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key.
            comms.mockNextBlockTrackerRequest();
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                request,
                blockParamIndex,
                blockParam === undefined ? null : 'latest',
              ),
              error: errorMessage,
            });

            const promiseForResult = withNetworkClient(
              { providerType, customRpcUrl },
              async ({ makeRpcCall }) => makeRpcCall(request),
            );

            await expect(promiseForResult).rejects.toThrow(
              buildFetchFailedErrorMessage(customRpcUrl, errorMessage),
            );
          },
        );
      });
    }

    // Both the Infura and fetch middleware will attempt to parse the response
    // body as JSON, and if this step produces an error, both middleware will
    // also attempt to retry the request. However, this error handling code is
    // slightly different between the two. As the error in this case is a
    // SyntaxError, the Infura middleware will catch it immediately, whereas the
    // custom RPC middleware will catch it and re-throw a separate error, which
    // it then catches later.
    if (providerType === 'infura') {
      it('retries the request to the RPC endpoint up to 5 times if a "SyntaxError" error is thrown while making the request, returning the successful result if there is one on the 5th try', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          // Here we have the request fail for the first 4 tries, then
          // succeed on the 5th try.
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: 'SyntaxError: Some message',
            times: 4,
          });

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              result: 'the result',
              httpStatus: 200,
            },
          });
          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toStrictEqual('the result');
        });
      });

      it('causes a request to fail with a custom error if a "SyntaxError" error is thrown while making the request to the RPC endpoint 5 times in a row', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'SyntaxError: Some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
            times: 5,
          });

          const promiseForResult = withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          await expect(promiseForResult).rejects.toThrow(
            buildInfuraClientRetriesExhaustedErrorMessage(errorMessage),
          );
        });
      });

      it('does not retry the request to the RPC endpoint, but throws immediately, if a "failed to parse response body" error is thrown while making the request', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'failed to parse response body: Some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
          });

          const promiseForResult = withNetworkClient(
            { providerType, infuraNetwork: comms.infuraNetwork },
            async ({ makeRpcCall }) => makeRpcCall(request),
          );

          await expect(promiseForResult).rejects.toThrow(
            buildFetchFailedErrorMessage(comms.rpcUrl, errorMessage),
          );
        });
      });
    } else {
      it('does not retry the request to the RPC endpoint, but throws immediately, if a "SyntaxError" error is thrown while making the request', async () => {
        const customRpcUrl = 'http://example.com';

        await withMockedCommunications(
          { providerType, customRpcUrl },
          async (comms) => {
            const request = {
              method,
              params: buildMockParams({ blockParam, blockParamIndex }),
            };

            const errorMessage = 'SyntaxError: Some message';

            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key.
            comms.mockNextBlockTrackerRequest();
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                request,
                blockParamIndex,
                blockParam === undefined ? null : 'latest',
              ),
              error: errorMessage,
            });

            const promiseForResult = withNetworkClient(
              { providerType, customRpcUrl },
              async ({ makeRpcCall }) => makeRpcCall(request),
            );

            await expect(promiseForResult).rejects.toThrow(
              buildFetchFailedErrorMessage(customRpcUrl, errorMessage),
            );
          },
        );
      });

      it('retries the request to the RPC endpoint up to 5 times if a "failed to parse response body" error is thrown while making the request, returning the successful result if there is one on the 5th try', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          // Here we have the request fail for the first 4 tries, then
          // succeed on the 5th try.
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: 'failed to parse response body: Some message',
            times: 4,
          });

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              result: 'the result',
              httpStatus: 200,
            },
          });

          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toStrictEqual('the result');
        });
      });

      it('produces a response without a result if a "failed to parse response body" error is thrown while making the request to the RPC endpoint 5 times in a row', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'failed to parse response body: some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
            times: 5,
          });
          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toBeUndefined();
        });
      });
    }

    // Only the custom RPC middleware will detect a "Failed to fetch" error and
    // attempt to retry the request to the RPC endpoint; the Infura middleware
    // does not.
    if (providerType === 'infura') {
      it('does not retry the request to the RPC endpoint, but throws immediately, if a "Failed to fetch" error is thrown while making the request', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'Failed to fetch: Some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
          });

          const promiseForResult = withNetworkClient(
            { providerType, infuraNetwork: comms.infuraNetwork },
            async ({ makeRpcCall }) => makeRpcCall(request),
          );

          await expect(promiseForResult).rejects.toThrow(
            buildFetchFailedErrorMessage(comms.rpcUrl, errorMessage),
          );
        });
      });
    } else {
      it('retries the request to the RPC endpoint up to 5 times if a "Failed to fetch" error is thrown while making the request, returning the successful result if there is one on the 5th try', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          // Here we have the request fail for the first 4 tries, then
          // succeed on the 5th try.
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: 'Failed to fetch: Some message',
            times: 4,
          });

          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            response: {
              result: 'the result',
              httpStatus: 200,
            },
          });

          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toStrictEqual('the result');
        });
      });

      it('produces a response without a result if a "Failed to fetch" error is thrown while making the request to the RPC endpoint 5 times in a row', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const request = {
            method,
            params: buildMockParams({ blockParam, blockParamIndex }),
          };
          const errorMessage = 'Failed to fetch: some message';

          // The first time a block-cacheable request is made, the
          // block-cache middleware will request the latest block number
          // through the block tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: buildRequestWithReplacedBlockParam(
              request,
              blockParamIndex,
              blockParam === undefined ? null : 'latest',
            ),
            error: errorMessage,
            times: 5,
          });
          const result = await withNetworkClient(
            { providerType },
            async ({ makeRpcCall, clock }) => {
              return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                makeRpcCall(request),
                clock,
              );
            },
          );

          expect(result).toBeUndefined();
        });
      });
    }
  });

  describe.each([
    ['given a block tag of "earliest"', 'earliest', 'earliest'],
    ['given a block number', 'block number', '0x100'],
  ])('%s', (_desc, blockParamType, blockParam) => {
    it(`does not hit the RPC endpoint more than once for identical requests when block param is ${blockParam} and param type of ${blockParamType}`, async () => {
      const requests = [
        {
          method,
          params: buildMockParams({ blockParamIndex, blockParam }),
        },
        {
          method,
          params: buildMockParams({ blockParamIndex, blockParam }),
        },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ providerType }, async (comms) => {
        // The first time a block-cacheable request is made, the block-cache
        // middleware will request the latest block number through the block
        // tracker to determine the cache key. This block number doesn't
        // matter.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request: requests[0],
          response: { result: mockResults[0] },
        });

        const results = await withNetworkClient(
          { providerType },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
      });
    });

    for (const paramIndex of [...Array(numberOfParameters).keys()]) {
      if (paramIndex === blockParamIndex) {
        // testing changes in block param is covered under later tests
        continue;
      }

      it(`does not reuse the result of a previous request if parameter at index "${paramIndex}" differs`, async () => {// eslint-disable-line
        const firstMockParams = [
          ...new Array(numberOfParameters).fill('some value'),
        ];
        firstMockParams[blockParamIndex] = blockParam;
        const secondMockParams = firstMockParams.slice();
        secondMockParams[paramIndex] = 'another value';
        const requests = [
          {
            method,
            params: firstMockParams,
          },
          { method, params: secondMockParams },
        ];
        const mockResults = ['first result', 'second result'];

        await withMockedCommunications({ providerType }, async (comms) => {
          // The first time a block-cacheable request is made, the block-cache
          // middleware will request the latest block number through the block
          // tracker to determine the cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: requests[0],
            response: { result: mockResults[0] },
          });

          comms.mockRpcCall({
            request: requests[1],
            response: { result: mockResults[1] },
          });

          const results = await withNetworkClient(
            { providerType },
            ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
          );

          expect(results).toStrictEqual([mockResults[0], mockResults[1]]);
        });
      });
    }

    it('reuses the result of a previous request even if the latest block number was updated since', async () => {
      const requests = [
        {
          method,
          params: buildMockParams({ blockParamIndex, blockParam }),
        },
        {
          method,
          params: buildMockParams({ blockParamIndex, blockParam }),
        },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ providerType }, async (comms) => {
        // Note that we have to mock these requests in a specific order. The
        // first block tracker request occurs because of the first RPC
        // request. The second block tracker request, however, does not
        // occur because of the second RPC request, but rather because we
        // call `clock.runAll()` below.
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x1' });
        comms.mockRpcCall({
          request: requests[0],
          response: { result: mockResults[0] },
        });
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x2' });
        comms.mockRpcCall({
          request: requests[1],
          response: { result: mockResults[1] },
        });

        const results = await withNetworkClient(
          { providerType },
          async (client) => {
            const firstResult = await client.makeRpcCall(requests[0]);
            // Proceed to the next iteration of the block tracker so that a
            // new block is fetched and the current block is updated.
            client.clock.runAll();
            const secondResult = await client.makeRpcCall(requests[1]);
            return [firstResult, secondResult];
          },
        );

        expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
      });
    });

    if (blockParamType === 'earliest') {
      it('treats "0x00" as a synonym for "earliest"', async () => {
        const requests = [
          {
            method,
            params: buildMockParams({ blockParamIndex, blockParam }),
          },
          {
            method,
            params: buildMockParams({ blockParamIndex, blockParam: '0x00' }),
          },
        ];
        const mockResults = ['first result', 'second result'];

        await withMockedCommunications({ providerType }, async (comms) => {
          // The first time a block-cacheable request is made, the latest
          // block number is retrieved through the block tracker first. It
          // doesn't matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: requests[0],
            response: { result: mockResults[0] },
          });

          const results = await withNetworkClient(
            { providerType },
            ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
          );

          expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
        });
      });

      for (const emptyValue of [null, undefined, '\u003cnil\u003e']) {
        it(`does not retry an empty response of "${emptyValue}"`, async () => {
          const request = {
            method,
            params: buildMockParams({ blockParamIndex, blockParam }),
          };
          const mockResult = emptyValue;

          await withMockedCommunications({ providerType }, async (comms) => {
            // The first time a block-cacheable request is made, the latest block
            // number is retrieved through the block tracker first. It doesn't
            // matter what this is — it's just used as a cache key.
            comms.mockNextBlockTrackerRequest();
            comms.mockRpcCall({
              request,
              response: { result: mockResult },
            });

            const result = await withNetworkClient(
              { providerType },
              ({ makeRpcCall }) => makeRpcCall(request),
            );

            expect(result).toStrictEqual(mockResult);
          });
        });

        it(`does not reuse the result of a previous request if it was "${emptyValue}"`, async () => {
          const requests = [
            {
              method,
              params: buildMockParams({ blockParamIndex, blockParam }),
            },
            {
              method,
              params: buildMockParams({ blockParamIndex, blockParam }),
            },
          ];
          const mockResults = [emptyValue, 'some result'];

          await withMockedCommunications({ providerType }, async (comms) => {
            // The first time a block-cacheable request is made, the latest block
            // number is retrieved through the block tracker first. It doesn't
            // matter what this is — it's just used as a cache key.
            comms.mockNextBlockTrackerRequest();
            comms.mockRpcCall({
              request: requests[0],
              response: { result: mockResults[0] },
            });
            comms.mockRpcCall({
              request: requests[1],
              response: { result: mockResults[1] },
            });

            const results = await withNetworkClient(
              { providerType },
              ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
            );

            expect(results).toStrictEqual(mockResults);
          });
        });
      }
    }

    if (blockParamType === 'block number') {
      it('does not reuse the result of a previous request if it was made with different arguments than this one', async () => {
        await withMockedCommunications({ providerType }, async (comms) => {
          const requests = [
            {
              method,
              params: buildMockParams({ blockParamIndex, blockParam: '0x100' }),
            },
            {
              method,
              params: buildMockParams({ blockParamIndex, blockParam: '0x200' }),
            },
          ];

          // The first time a block-cacheable request is made, the latest block
          // number is retrieved through the block tracker first. It doesn't
          // matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: requests[0],
            response: { result: 'first result' },
          });

          comms.mockRpcCall({
            request: requests[1],
            response: { result: 'second result' },
          });

          const results = await withNetworkClient(
            { providerType },
            ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
          );

          expect(results).toStrictEqual(['first result', 'second result']);
        });
      });

      describe.each([
        ['less than the current block number', '0x200'],
        ['equal to the current block number', '0x100'],
      ])('%s', (_nestedDesc, currentBlockNumber) => {
        it('makes an additional request to the RPC endpoint', async () => {
          await withMockedCommunications({ providerType }, async (comms) => {
            const request = {
              method,
              // Note that `blockParam` is `0x100` here
              params: buildMockParams({ blockParamIndex, blockParam }),
            };

            // The first time a block-cacheable request is made, the latest
            // block number is retrieved through the block tracker first.
            comms.mockNextBlockTrackerRequest({
              blockNumber: currentBlockNumber,
            });
            comms.mockRpcCall({
              request,
              response: { result: 'the result' },
            });

            const result = await withNetworkClient(
              { providerType },
              ({ makeRpcCall }) => makeRpcCall(request),
            );

            expect(result).toStrictEqual('the result');
          });
        });

        for (const emptyValue of [null, undefined, '\u003cnil\u003e']) {
          it(`does not retry an empty response of "${emptyValue}"`, async () => {
            const request = {
              method,
              // Note that `blockParam` is `0x100` here
              params: buildMockParams({ blockParamIndex, blockParam }),
            };
            const mockResult = emptyValue;

            await withMockedCommunications({ providerType }, async (comms) => {
              // The first time a block-cacheable request is made, the latest block
              // number is retrieved through the block tracker first.
              comms.mockNextBlockTrackerRequest({
                blockNumber: currentBlockNumber,
              });
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  request,
                  blockParamIndex,
                  '0x100',
                ),
                response: { result: mockResult },
              });

              const result = await withNetworkClient(
                { providerType },
                ({ makeRpcCall }) => makeRpcCall(request),
              );

              expect(result).toStrictEqual(mockResult);
            });
          });

          it(`does not reuse the result of a previous request if it was "${emptyValue}"`, async () => {
            const requests = [
              {
                method,
                // Note that `blockParam` is `0x100` here
                params: buildMockParams({ blockParamIndex, blockParam }),
              },
              {
                method,
                // Note that `blockParam` is `0x100` here
                params: buildMockParams({ blockParamIndex, blockParam }),
              },
            ];
            const mockResults = [emptyValue, { blockHash: '0x100' }];

            await withMockedCommunications({ providerType }, async (comms) => {
              // The first time a block-cacheable request is made, the latest block
              // number is retrieved through the block tracker first.
              comms.mockNextBlockTrackerRequest({
                blockNumber: currentBlockNumber,
              });
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  requests[0],
                  blockParamIndex,
                  '0x100',
                ),
                response: { result: mockResults[0] },
              });
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  requests[1],
                  blockParamIndex,
                  '0x100',
                ),
                response: { result: mockResults[1] },
              });

              const results = await withNetworkClient(
                { providerType },
                ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
              );

              expect(results).toStrictEqual(mockResults);
            });
          });
        }
      });

      describe('greater than the current block number', () => {
        it('makes an additional request to the RPC endpoint', async () => {
          await withMockedCommunications({ providerType }, async (comms) => {
            const request = {
              method,
              // Note that `blockParam` is `0x100` here
              params: buildMockParams({ blockParamIndex, blockParam }),
            };

            // The first time a block-cacheable request is made, the latest
            // block number is retrieved through the block tracker first.
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x42' });
            comms.mockRpcCall({
              request,
              response: { result: 'the result' },
            });

            const result = await withNetworkClient(
              { providerType },
              ({ makeRpcCall }) => makeRpcCall(request),
            );

            expect(result).toStrictEqual('the result');
          });
        });

        for (const emptyValue of [null, undefined, '\u003cnil\u003e']) {
          it(`does not retry an empty response of "${emptyValue}"`, async () => {
            const request = {
              method,
              // Note that `blockParam` is `0x100` here
              params: buildMockParams({ blockParamIndex, blockParam }),
            };
            const mockResult = emptyValue;

            await withMockedCommunications({ providerType }, async (comms) => {
              // The first time a block-cacheable request is made, the latest block
              // number is retrieved through the block tracker first.
              comms.mockNextBlockTrackerRequest({ blockNumber: '0x42' });
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  request,
                  blockParamIndex,
                  '0x100',
                ),
                response: { result: mockResult },
              });

              const result = await withNetworkClient(
                { providerType },
                ({ makeRpcCall }) => makeRpcCall(request),
              );

              expect(result).toStrictEqual(mockResult);
            });
          });

          it(`does not reuse the result of a previous request if it was "${emptyValue}"`, async () => {
            const requests = [
              {
                method,
                // Note that `blockParam` is `0x100` here
                params: buildMockParams({ blockParamIndex, blockParam }),
              },
              {
                method,
                // Note that `blockParam` is `0x100` here
                params: buildMockParams({ blockParamIndex, blockParam }),
              },
            ];
            const mockResults = [emptyValue, { blockHash: '0x100' }];

            await withMockedCommunications({ providerType }, async (comms) => {
              // The first time a block-cacheable request is made, the latest block
              // number is retrieved through the block tracker first.
              comms.mockNextBlockTrackerRequest({ blockNumber: '0x42' });
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  requests[0],
                  blockParamIndex,
                  '0x100',
                ),
                response: { result: mockResults[0] },
              });
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  requests[1],
                  blockParamIndex,
                  '0x100',
                ),
                response: { result: mockResults[1] },
              });

              const results = await withNetworkClient(
                { providerType },
                ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
              );

              expect(results).toStrictEqual(mockResults);
            });
          });
        }
      });
    }
  });

  if (method !== 'eth_getTransactionCount') {
    describe('given a block tag of "pending"', () => {
      const params = buildMockParams({
        blockParamIndex,
        blockParam: 'pending',
      });

      it('hits the RPC endpoint once per request', async () => {
        const requests = [
          { method, params },
          { method, params },
        ];
        const mockResults = ['first result', 'second result'];

        await withMockedCommunications({ providerType }, async (comms) => {
          // The first time a block-cacheable request is made, the latest
          // block number is retrieved through the block tracker first. It
          // doesn't matter what this is — it's just used as a cache key.
          comms.mockNextBlockTrackerRequest();
          comms.mockRpcCall({
            request: requests[0],
            response: { result: mockResults[0] },
          });

          comms.mockRpcCall({
            request: requests[1],
            response: { result: mockResults[1] },
          });

          const results = await withNetworkClient(
            { providerType },
            ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
          );

          expect(results).toStrictEqual([mockResults[0], mockResults[1]]);
        });
      });
    });
  }
};
