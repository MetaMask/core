/* eslint-disable jest/require-top-level-describe, jest/no-export, jest/no-identical-title */

import {
  withMockedCommunications,
  withClient,
  buildMockParamsWithoutBlockParamAt,
  buildMockParamsWithBlockParamAt,
  buildRequestWithReplacedBlockParam,
  MockOptions,
} from './helpers';

const originalSetTimeout = setTimeout;

const infuraClientErrorTimeout =
  /InfuraProvider - cannot complete request\. All retries exhausted[\s\S][\s\S]+Gateway timeout/su;
const infuraClientErrorWithReason = (reason: string) => {
  return new RegExp(
    `^InfuraProvider - cannot complete request. All retries exhausted\\..+${reason}`,
    'us',
  );
};
const jsonRpcClientErrorWithReason = (reason: string) => {
  return new RegExp(
    `request to http://localhost:8545/ failed, reason: ${reason}`,
    'us',
  );
};
const jsonRpcClientErrorTimeout = (method: string) => {
  return new RegExp(
    `JsonRpcEngine: Response has no error or result for request:\\n[\\s\\S][\\s\\S]+${method}`,
    'us',
  );
};

const fill = (arr: any[], val: any) => {
  return arr.map(() => val);
}

/**
 * Some middleware contain logic which retries the request if some condition
 * applies. This retrying always happens out of band via `setTimeout`, and
 * because we are stubbing time via Jest's fake timers, we have to manually
 * advance the clock so that the `setTimeout` handlers get fired. We don't know
 * when these timers will get created, however, so we have to keep advancing
 * timers until the request has been made an appropriate number of times.
 * Unfortunately we don't have a good way to know how many times a request has
 * been retried, but the good news is that the middleware won't end, and thus
 * the promise which the RPC call returns won't get fulfilled, until all retries
 * have been made.
 *
 * @param promise - The promise which is returned by the RPC call.
 * @param clock - A Sinon clock object which can be used to advance to the next
 * `setTimeout` handler.
 */
async function waitForPromiseToBeFulfilledAfterRunningAllTimers(
  promise: Promise<any>,
  clock: sinon.SinonFakeTimers,
) {
  let hasPromiseBeenFulfilled = false;
  let numTimesClockHasBeenAdvanced = 0;

  promise
    .catch(() => {
      // This is used to silence Node.js warnings about the rejection
      // being handled asynchronously. The error is handled later when
      // `promise` is awaited.
    })
    .finally(() => {
      hasPromiseBeenFulfilled = true;
    });

  // `isPromiseFulfilled` is modified asynchronously.
  /* eslint-disable-next-line no-unmodified-loop-condition */
  while (!hasPromiseBeenFulfilled && numTimesClockHasBeenAdvanced < 15) {
    clock.runAll();
    await new Promise((resolve) => originalSetTimeout(resolve, 10));
    numTimesClockHasBeenAdvanced += 1;
  }

  return promise;
}

/**
 * Defines tests which exercise the behavior exhibited by an RPC method that
 * does not support params (which affects how the method is cached).
 *
 * @param options - the options
 * @param options.type - The type of provider being tested. Either `infura` or `custom`
 * (default: "infura").
 */
/* eslint-disable-next-line jest/no-export */
export function testsForRpcMethodNotHandledByMiddleware(
  method: string,
  { numberOfParameters = 0, type = 'infura' }: any,
) {
  it(`attempts to pass the request off to a ${type} provider`, async () => {
    const request = {
      method,
      params: fill(Array(numberOfParameters), 'some value'),
    };
    const expectedResult = 'the result';

    await withMockedCommunications({ type: type }, async (comms) => {
      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request,
        response: { result: expectedResult },
      });
      const actualResult = await withClient(
        { type: type },
        ({ makeRpcCall }) => makeRpcCall(request),
      );

      expect(actualResult).toStrictEqual(expectedResult);
    });
  });
}

/**
 * Defines tests which exercise the behavior exhibited by an RPC method which is
 * assumed to not take a block parameter. Even if it does, the value of this
 * parameter will not be used in determining how to cache the method.
 *
 * @param method - The name of the RPC method under test.
 * @param options - the options
 * @param options.type - The type of provider being tested. Either `infura` or `custom`
 * (default: "infura").
 */
export function testsForRpcMethodAssumingNoBlockParam(
  method: string,
  { type = 'infura' }: MockOptions = { type: 'infura' },
) {
  it(`does not hit ${type} provider more than once for identical requests`, async () => {
    const requests = [{ method }, { method }];
    const mockResults = ['first result', 'second result'];

    await withMockedCommunications({ type }, async (comms) => {
      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request: requests[0],
        response: { result: mockResults[0] },
      });

      const results = await withClient(
        { type: type },
        ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
      );

      expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
    });
  });

  it(`hits ${type} provider and does not reuse the result of a previous request if the latest block number was updated since`, async () => {
    const requests = [{ method }, { method }];
    const mockResults = ['first result', 'second result'];

    await withMockedCommunications({ type: type }, async (comms) => {
      // Note that we have to mock these requests in a specific order. The
      // first block tracker request occurs because of the first RPC request.
      // The second block tracker request, however, does not occur because of
      // the second RPC request, but rather because we call `clock.runAll()`
      // below.
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

      const results = await withClient(
        { type: type },
        async (client) => {
          const firstResult = await client.makeRpcCall(requests[0]);
          // Proceed to the next iteration of the block tracker so that a new
          // block is fetched and the current block is updated.
          client.clock.runAll();
          const secondResult = await client.makeRpcCall(requests[1]);
          return [firstResult, secondResult];
        },
      );

      expect(results).toStrictEqual(mockResults);
    });
  });

  it.each([null, undefined, '\u003cnil\u003e'])(
    'does not reuse the result of a previous request if it was `%s`',
    async (emptyValue) => {
      const requests = [{ method }, { method }];
      const mockResults = [emptyValue, 'some result'];

      await withMockedCommunications({ type: type }, async (comms) => {
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

        const results = await withClient(
          { type: type },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual(mockResults);
      });
    },
  );

  it('queues requests while a previous identical call is still pending, then runs the queue when it finishes, reusing the result from the first request', async () => {
    const requests = [{ method }, { method }, { method }];
    const mockResults = ['first result', 'second result', 'third result'];

    await withMockedCommunications({ type: type }, async (comms) => {
      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request: requests[0],
        response: { result: mockResults[0] },
        delay: 100,
      });
      comms.mockRpcCall({
        request: requests[1],
        response: { result: mockResults[1] },
      });
      comms.mockRpcCall({
        request: requests[2],
        response: { result: mockResults[2] },
      });

      const results = await withClient(
        { type: type },
        async (client) => {
          const resultPromises = [
            client.makeRpcCall(requests[0]),
            client.makeRpcCall(requests[1]),
            client.makeRpcCall(requests[2]),
          ];
          const firstResult = await resultPromises[0];
          // The inflight cache middleware uses setTimeout to run the handlers,
          // so run them now
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

  it(`throws a custom error if the request to ${type} provider returns a 405 response`, async () => {
    await withMockedCommunications({ type: type }, async (comms) => {
      const request = { method };

      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request,
        response: {
          httpStatus: 405,
        },
      });
      const promiseForResult = withClient(
        { type: type },
        async ({ makeRpcCall }) => makeRpcCall(request),
      );

      await expect(promiseForResult).rejects.toThrow(
        'The method does not exist / is not available',
      );
    });
  });

  it(`throws a custom error if the request to ${type} provider returns a 429 response`, async () => {
    await withMockedCommunications({ type: type }, async (comms) => {
      const request = { method };

      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request,
        response: {
          httpStatus: 429,
        },
      });
      const promiseForResult = withClient(
        { type: type },
        async ({ makeRpcCall }) => makeRpcCall(request),
      );

      const errMsg =
        type === 'infura'
          ? 'Request is being rate limited'
          : "Non-200 status code: '429'";
      await expect(promiseForResult).rejects.toThrow(errMsg);
    });
  });

  it(`throws a custom error if the request to ${type} provider returns a response that is not 405, 429, 503, or 504`, async () => {
    await withMockedCommunications({ type: type }, async (comms) => {
      const request = { method };

      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request,
        response: {
          id: 12345,
          jsonrpc: '2.0',
          error: 'some error',
          httpStatus: 420,
        },
      });
      const promiseForResult = withClient(
        { type: type },
        async ({ makeRpcCall }) => makeRpcCall(request),
      );

      const errMsg =
        type === 'infura'
          ? '{"id":12345,"jsonrpc":"2.0","error":"some error"}'
          : "Non-200 status code: '420'";
      await expect(promiseForResult).rejects.toThrow(errMsg);
    });
  });

  [503, 504].forEach((httpStatus) => {
    it(`retries the request to ${type} provider up to 5 times if it returns a ${httpStatus} response, returning the successful result if there is one on the 5th try`, async () => {
      await withMockedCommunications({ type: type }, async (comms) => {
        const request = { method };

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        // Here we have the request fail for the first 4 tries, then succeed
        // on the 5th try.
        comms.mockRpcCall({
          request,
          response: {
            error: 'Some error',
            httpStatus,
          },
          times: 4,
        });
        comms.mockRpcCall({
          request,
          response: {
            result: 'the result',
            httpStatus: 200,
          },
        });
        const result = await withClient(
          { type: type },
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

    it(`causes a request to fail with a custom error if the request to ${type} provider returns a ${httpStatus} response 5 times in a row`, async () => {
      await withMockedCommunications({ type: type }, async (comms) => {
        const request = { method };

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request,
          response: {
            error: 'Some error',
            httpStatus,
          },
          times: 5,
        });
        comms.mockNextBlockTrackerRequest();
        const promiseForResult = withClient(
          { type: type },
          async ({ makeRpcCall, clock }) => {
            return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
              makeRpcCall(request),
              clock,
            );
          },
        );
        const err =
          type === 'infura'
            ? infuraClientErrorTimeout
            : jsonRpcClientErrorTimeout(method);
        await expect(promiseForResult).rejects.toThrow(err);
      });
    });
  });

  ['ETIMEDOUT', 'ECONNRESET', 'SyntaxError'].forEach((errorMessagePrefix) => {
    if (
      type === 'infura' ||
      ['ECONNRESET', 'SyntaxError'].includes(errorMessagePrefix) === false
    ) {
      it(`retries the request to ${type} provider up to 5 times if an "${errorMessagePrefix}" error is thrown while making the request, returning the successful result if there is one on the 5th try`, async () => {
        await withMockedCommunications(
          { type: type },
          async (comms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the latest block
            // number is retrieved through the block tracker first. It doesn't
            // matter what this is — it's just used as a cache key.
            comms.mockNextBlockTrackerRequest();
            // Here we have the request fail for the first 4 tries, then succeed
            // on the 5th try.
            comms.mockRpcCall({
              request,
              error: `${errorMessagePrefix}: Some message`,
              times: 4,
            });
            comms.mockRpcCall({
              request,
              response: {
                result: 'the result',
                httpStatus: 200,
              },
            });

            const result = await withClient(
              { type: type },
              async ({ makeRpcCall, clock }) => {
                return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                  makeRpcCall(request),
                  clock,
                );
              },
            );

            expect(result).toStrictEqual('the result');
          },
        );
      });
    }

    it(`causes a request to fail with a custom error if an "${errorMessagePrefix}" error is thrown while making the request to ${type} provider 5 times in a row`, async () => {
      await withMockedCommunications({ type: type }, async (comms) => {
        const request = { method };

        // The first time a block-cacheable request is made, the latest block
        // number is retrieved through the block tracker first. It doesn't
        // matter what this is — it's just used as a cache key.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request,
          error: `${errorMessagePrefix}: Some message`,
          times: 5,
        });
        const promiseForResult = withClient(
          { type: type },
          async ({ makeRpcCall, clock }) => {
            return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
              makeRpcCall(request),
              clock,
            );
          },
        );

        const errMsg = `${errorMessagePrefix}: Some message`;

        let err;
        if (type === 'infura') {
          err = infuraClientErrorWithReason(errMsg);
        } else if (errorMessagePrefix === 'ETIMEDOUT') {
          err = jsonRpcClientErrorTimeout(method);
        } else {
          err = jsonRpcClientErrorWithReason(errMsg);
        }

        await expect(promiseForResult).rejects.toThrow(err);
      });
    });
  });
}

/**
 * Defines tests which exercise the behavior exhibited by an RPC method that
 * use `blockHash` in the response data to determine whether the response is
 * cacheable.
 *
 * @param method - The name of the RPC method under test.
 * @param options - the options
 * @param options.type - The type of provider being tested. Either `infura` or `custom`
 * (default: "infura").
 */
export function testsForRpcMethodsThatCheckForBlockHashInResponse(
  method: string,
  { type = 'infura' } = { type: 'infura' },
) {
  it(`does not hit ${type} provider more than once for identical requests and it has a valid blockHash`, async () => {
    const requests = [{ method }, { method }];
    const mockResults = [{ blockHash: '0x100' }, { blockHash: '0x200' }];

    await withMockedCommunications({ type: type }, async (comms) => {
      // The first time a block-cacheable request is made, the latest block
      // number is retrieved through the block tracker first. It doesn't
      // matter what this is — it's just used as a cache key.
      comms.mockNextBlockTrackerRequest();
      comms.mockRpcCall({
        request: requests[0],
        response: { result: mockResults[0] },
      });

      const results = await withClient(
        { type: type },
        ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
      );

      expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
    });
  });

  it(`hits ${type} provider and does not reuse the result of a previous request if the latest block number was updated since`, async () => {
    const requests = [{ method }, { method }];
    const mockResults = [{ blockHash: '0x100' }, { blockHash: '0x200' }];

    await withMockedCommunications({ type: type }, async (comms) => {
      // Note that we have to mock these requests in a specific order. The
      // first block tracker request occurs because of the first RPC
      // request. The second block tracker request, however, does not occur
      // because of the second RPC request, but rather because we call
      // `clock.runAll()` below.
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

      const results = await withClient(
        { type: type },
        async (client) => {
          const firstResult = await client.makeRpcCall(requests[0]);
          // Proceed to the next iteration of the block tracker so that a new
          // block is fetched and the current block is updated.
          client.clock.runAll();
          const secondResult = await client.makeRpcCall(requests[1]);
          return [firstResult, secondResult];
        },
      );

      expect(results).toStrictEqual(mockResults);
    });
  });

  it.each([null, undefined, '\u003cnil\u003e'])(
    'does not reuse the result of a previous request if it was `%s`',
    async (emptyValue) => {
      const requests = [{ method }, { method }];
      const mockResults = [emptyValue, { blockHash: '0x100' }];

      await withMockedCommunications({ type: type }, async (comms) => {
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

        const results = await withClient(
          { type: type },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        // TODO: Does this work?
        expect(results).toStrictEqual(mockResults);
      });
    },
  );

  it('does not reuse the result of a previous request if result.blockHash was null', async () => {
    const requests = [{ method }, { method }];
    const mockResults = [
      { blockHash: null, extra: 'some value' },
      { blockHash: '0x100', extra: 'some other value' },
    ];

    await withMockedCommunications({ type: type }, async (comms) => {
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

      const results = await withClient(
        { type: type },
        ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
      );

      expect(results).toStrictEqual(mockResults);
    });
  });

  it('does not reuse the result of a previous request if result.blockHash was undefined', async () => {
    const requests = [{ method }, { method }];
    const mockResults = [
      { extra: 'some value' },
      { blockHash: '0x100', extra: 'some other value' },
    ];

    await withMockedCommunications({ type: type }, async (comms) => {
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

      const results = await withClient(
        { type: type },
        ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
      );

      expect(results).toStrictEqual(mockResults);
    });
  });

  it('does not reuse the result of a previous request if result.blockHash was "0x0000000000000000000000000000000000000000000000000000000000000000"', async () => {
    const requests = [{ method }, { method }];
    const mockResults = [
      {
        blockHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        extra: 'some value',
      },
      { blockHash: '0x100', extra: 'some other value' },
    ];

    await withMockedCommunications({ type: type }, async (comms) => {
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

      const results = await withClient(
        { type: type },
        ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
      );

      expect(results).toStrictEqual(mockResults);
    });
  });
}

/**
 * Defines tests which exercise the behavior exhibited by an RPC method that
 * takes a block parameter. The value of this parameter can be either a block
 * number or a block tag ("latest", "earliest", or "pending") and affects how
 * the method is cached.
 *
 * @param options - the options
 * @param options.type - The type of provider being tested. Either `infura` or `custom`
 * (default: "infura").
 */
/* eslint-disable-next-line jest/no-export */
export function testsForRpcMethodSupportingBlockParam(
  method: string,
  { blockParamIndex = 0, type = 'infura' },
) {
  describe.each([
    ['given no block tag', 'none', 'none'],
    ['given a block tag of "latest"', 'latest', 'latest'],
  ])('%s', (_desc, blockParamType, blockParam) => {
    const params =
      blockParamType === 'none'
        ? buildMockParamsWithoutBlockParamAt(blockParamIndex)
        : buildMockParamsWithBlockParamAt(blockParamIndex, blockParam);

    it(`does not hit ${type} provider more than once for identical requests`, async () => {
      const requests = [
        { method, params },
        { method, params },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ type: type }, async (comms) => {
        // The first time a block-cacheable request is made, the block-cache
        // middleware will request the latest block number through the block
        // tracker to determine the cache key. Later, the block-ref
        // middleware will request the latest block number again to resolve
        // the value of "latest", but the block number is cached once made,
        // so we only need to mock the request once.
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
        // The block-ref middleware will make the request as specified
        // except that the block param is replaced with the latest block
        // number.
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[0],
            blockParamIndex,
            '0x100',
          ),
          response: { result: mockResults[0] },
        });

        const results = await withClient(
          { type: type },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
      });
    });

    if (type === 'infura') {
      it(`hits ${type} provider and does not reuse the result of a previous request if the latest block number was updated since`, async () => {
        const requests = [
          { method, params },
          { method, params },
        ];
        const mockResults = ['first result', 'second result'];

        await withMockedCommunications(
          { type: type },
          async (comms) => {
            // Note that we have to mock these requests in a specific order.
            // The first block tracker request occurs because of the first RPC
            // request. The second block tracker request, however, does not
            // occur because of the second RPC request, but rather because we
            // call `clock.runAll()` below.
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest block
            // number.
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                requests[0],
                blockParamIndex,
                '0x100',
              ),
              response: { result: mockResults[0] },
            });
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x200' });
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                requests[1],
                blockParamIndex,
                '0x200',
              ),
              response: { result: mockResults[1] },
            });

            const results = await withClient(
              { type: type },
              async (client) => {
                const firstResult = await client.makeRpcCall(requests[0]);
                // Proceed to the next iteration of the block tracker so that a
                // new block is fetched and the current block is updated.
                client.clock.runAll();
                const secondResult = await client.makeRpcCall(requests[1]);
                return [firstResult, secondResult];
              },
            );

            expect(results).toStrictEqual(mockResults);
          },
        );
      });
    }

    it.each([null, undefined, '\u003cnil\u003e'])(
      'does not reuse the result of a previous request if it was `%s`',
      async (emptyValue) => {
        const requests = [
          { method, params },
          { method, params },
        ];
        const mockResults = [emptyValue, 'some result'];

        await withMockedCommunications(
          { type: type },
          async (comms) => {
            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key. Later,
            // the block-ref middleware will request the latest block number
            // again to resolve the value of "latest", but the block number is
            // cached once made, so we only need to mock the request once.
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest block
            // number.
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

            const results = await withClient(
              { type: type },
              ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
            );

            expect(results).toStrictEqual(mockResults);
          },
        );
      },
    );

    it('queues requests while a previous identical call is still pending, then runs the queue when it finishes, reusing the result from the first request', async () => {
      const requests = [{ method }, { method }, { method }];
      const mockResults = ['first result', 'second result', 'third result'];

      await withMockedCommunications({ type: type }, async (comms) => {
        // The first time a block-cacheable request is made, the
        // block-cache middleware will request the latest block number
        // through the block tracker to determine the cache key. Later,
        // the block-ref middleware will request the latest block number
        // again to resolve the value of "latest", but the block number is
        // cached once made, so we only need to mock the request once.
        comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
        // The block-ref middleware will make the request as specified
        // except that the block param is replaced with the latest block
        // number, and we delay it.
        comms.mockRpcCall({
          delay: 100,
          request: buildRequestWithReplacedBlockParam(
            requests[0],
            blockParamIndex,
            '0x100',
          ),
          response: { result: mockResults[0] },
        });
        // The previous two requests will happen again, in the same order.
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[1],
            blockParamIndex,
            '0x100',
          ),
          response: { result: mockResults[1] },
        });
        comms.mockRpcCall({
          request: buildRequestWithReplacedBlockParam(
            requests[2],
            blockParamIndex,
            '0x100',
          ),
          response: { result: mockResults[2] },
        });

        const results = await withClient(
          { type: type },
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

    if (blockParamType === 'none') {
      it(`throws a custom error if the request to ${type} provider returns a 405 response`, async () => {
        await withMockedCommunications(
          { type: type },
          async (comms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key. Later,
            // the block-ref middleware will request the latest block number
            // again to resolve the value of "latest", but the block number is
            // cached once made, so we only need to mock the request once.
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest block
            // number.
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                request,
                blockParamIndex,
                '0x100',
              ),
              response: {
                httpStatus: 405,
              },
            });
            const promiseForResult = withClient(
              { type: type },
              async ({ makeRpcCall }) => makeRpcCall(request),
            );

            await expect(promiseForResult).rejects.toThrow(
              'The method does not exist / is not available',
            );
          },
        );
      });

      it(`throws a custom error if the request to ${type} provider returns a 429 response`, async () => {
        await withMockedCommunications(
          { type: type },
          async (comms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key. Later,
            // the block-ref middleware will request the latest block number
            // again to resolve the value of "latest", but the block number is
            // cached once made, so we only need to mock the request once.
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest block
            // number.
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                request,
                blockParamIndex,
                '0x100',
              ),
              response: {
                httpStatus: 429,
              },
            });
            const promiseForResult = withClient(
              { type: type },
              async ({ makeRpcCall }) => makeRpcCall(request),
            );

            const msg =
              type === 'infura'
                ? 'Request is being rate limited'
                : "Non-200 status code: '429'";

            await expect(promiseForResult).rejects.toThrow(msg);
          },
        );
      });

      it(`throws a custom error if the request to ${type} provider returns a response that is not 405, 429, 503, or 504`, async () => {
        await withMockedCommunications(
          { type: type },
          async (comms) => {
            const request = { method };

            // The first time a block-cacheable request is made, the
            // block-cache middleware will request the latest block number
            // through the block tracker to determine the cache key. Later,
            // the block-ref middleware will request the latest block number
            // again to resolve the value of "latest", but the block number is
            // cached once made, so we only need to mock the request once.
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            // The block-ref middleware will make the request as specified
            // except that the block param is replaced with the latest block
            // number.
            comms.mockRpcCall({
              request: buildRequestWithReplacedBlockParam(
                request,
                blockParamIndex,
                '0x100',
              ),
              response: {
                id: 12345,
                jsonrpc: '2.0',
                error: 'some error',
                httpStatus: 420,
              },
            });
            const promiseForResult = withClient(
              { type: type },
              async ({ makeRpcCall }) => makeRpcCall(request),
            );

            const msg =
              type === 'infura'
                ? '{"id":12345,"jsonrpc":"2.0","error":"some error"}'
                : "Non-200 status code: '420'";
            await expect(promiseForResult).rejects.toThrow(msg);
          },
        );
      });

      [503, 504].forEach((httpStatus) => {
        it(`retries the request to ${type} provider up to 5 times if it returns a ${httpStatus} response, returning the successful result if there is one on the 5th try`, async () => {
          await withMockedCommunications(
            { type: type },
            async (comms) => {
              const request = { method };

              // The first time a block-cacheable request is made, the
              // block-cache middleware will request the latest block number
              // through the block tracker to determine the cache key. Later,
              // the block-ref middleware will request the latest block number
              // again to resolve the value of "latest", but the block number is
              // cached once made, so we only need to mock the request once.
              comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
              // The block-ref middleware will make the request as specified
              // except that the block param is replaced with the latest block
              // number.
              //
              // Here we have the request fail for the first 4 tries, then succeed
              // on the 5th try.
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  request,
                  blockParamIndex,
                  '0x100',
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
                  '0x100',
                ),
                response: {
                  result: 'the result',
                  httpStatus: 200,
                },
              });
              const result = await withClient(
                { type: type },
                async ({ makeRpcCall, clock }) => {
                  return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                    makeRpcCall(request),
                    clock,
                  );
                },
              );

              expect(result).toStrictEqual('the result');
            },
          );
        });

        it(`causes a request to fail with a custom error if the request to ${type} provider returns a ${httpStatus} response 5 times in a row`, async () => {
          await withMockedCommunications(
            { type: type },
            async (comms) => {
              const request = { method };

              // The first time a block-cacheable request is made, the
              // block-cache middleware will request the latest block number
              // through the block tracker to determine the cache key. Later,
              // the block-ref middleware will request the latest block number
              // again to resolve the value of "latest", but the block number is
              // cached once made, so we only need to mock the request once.
              comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
              // The block-ref middleware will make the request as specified
              // except that the block param is replaced with the latest block
              // number.
              comms.mockRpcCall({
                request: buildRequestWithReplacedBlockParam(
                  request,
                  blockParamIndex,
                  '0x100',
                ),
                response: {
                  error: 'Some error',
                  httpStatus,
                },
                times: 5,
              });
              const promiseForResult = withClient(
                { type: type },
                async ({ makeRpcCall, clock }) => {
                  return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                    makeRpcCall(request),
                    clock,
                  );
                },
              );
              const err =
                type === 'infura'
                  ? infuraClientErrorTimeout
                  : jsonRpcClientErrorTimeout(method);
              await expect(promiseForResult).rejects.toThrow(err);
            },
          );
        });
      });

      ['ETIMEDOUT', 'ECONNRESET', 'SyntaxError'].forEach(
        (errorMessagePrefix) => {
          if (type === 'infura' || errorMessagePrefix === 'ETIMEDOUT') {
            it(`retries the request to Infura up to 5 times if an "${errorMessagePrefix}" error is thrown while making the request, returning the successful result if there is one on the 5th try`, async () => {
              await withMockedCommunications(
                { type: type },
                async (comms) => {
                  const request = { method };

                  // The first time a block-cacheable request is made, the
                  // block-cache middleware will request the latest block number
                  // through the block tracker to determine the cache key. Later,
                  // the block-ref middleware will request the latest block number
                  // again to resolve the value of "latest", but the block number is
                  // cached once made, so we only need to mock the request once.
                  comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
                  // The block-ref middleware will make the request as specified
                  // except that the block param is replaced with the latest block
                  // number.
                  //
                  // Here we have the request fail for the first 4 tries, then
                  // succeed on the 5th try.
                  comms.mockRpcCall({
                    request: buildRequestWithReplacedBlockParam(
                      request,
                      blockParamIndex,
                      '0x100',
                    ),
                    error: `${errorMessagePrefix}: Some message`,
                    times: 4,
                  });
                  comms.mockRpcCall({
                    request: buildRequestWithReplacedBlockParam(
                      request,
                      blockParamIndex,
                      '0x100',
                    ),
                    response: {
                      result: 'the result',
                      httpStatus: 200,
                    },
                  });
                  const result = await withClient(
                    { type: type },
                    async ({ makeRpcCall, clock }) => {
                      return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                        makeRpcCall(request),
                        clock,
                      );
                    },
                  );

                  expect(result).toStrictEqual('the result');
                },
              );
            });
          }

          it(`causes a request to fail with a custom error if an "${errorMessagePrefix}" error is thrown while making the request to Infura 5 times in a row`, async () => {
            await withMockedCommunications(
              { type: type },
              async (comms) => {
                const request = { method };

                // The first time a block-cacheable request is made, the
                // block-cache middleware will request the latest block number
                // through the block tracker to determine the cache key. Later,
                // the block-ref middleware will request the latest block number
                // again to resolve the value of "latest", but the block number is
                // cached once made, so we only need to mock the request once.
                comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
                // The block-ref middleware will make the request as specified
                // except that the block param is replaced with the latest block
                // number.

                const reason = `${errorMessagePrefix}: Some message`;
                comms.mockRpcCall({
                  request: buildRequestWithReplacedBlockParam(
                    request,
                    blockParamIndex,
                    '0x100',
                  ),
                  error: reason,
                  times: 5,
                });
                const promiseForResult = withClient(
                  { type: type },
                  async ({ makeRpcCall, clock }) => {
                    return await waitForPromiseToBeFulfilledAfterRunningAllTimers(
                      makeRpcCall(request),
                      clock,
                    );
                  },
                );

                let err;
                if (type === 'infura') {
                  err = infuraClientErrorWithReason(reason);
                } else if (errorMessagePrefix === 'ETIMEDOUT') {
                  err = jsonRpcClientErrorTimeout(method);
                } else {
                  err = jsonRpcClientErrorWithReason(reason);
                }

                await expect(promiseForResult).rejects.toThrow(err);
              },
            );
          });
        },
      );
    }
  });

  describe.each([
    ['given a block tag of "earliest"', 'earliest', 'earliest'],
    ['given a block number', 'block number', '0x100'],
  ])('%s', (_desc, blockParamType, blockParam) => {
    const params = buildMockParamsWithBlockParamAt(blockParamIndex, blockParam);

    it(`does not hit ${type} provider more than once for identical requests`, async () => {
      const requests = [
        { method, params },
        { method, params },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ type: type }, async (comms) => {
        // The first time a block-cacheable request is made, the block-cache
        // middleware will request the latest block number through the block
        // tracker to determine the cache key. This block number doesn't
        // matter.
        comms.mockNextBlockTrackerRequest();
        comms.mockRpcCall({
          request: requests[0],
          response: { result: mockResults[0] },
        });

        const results = await withClient(
          { type: type },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
      });
    });

    it('reuses the result of a previous request even if the latest block number was updated since', async () => {
      const requests = [
        { method, params },
        { method, params },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ type: type }, async (comms) => {
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

        const results = await withClient(
          { type: type },
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

    it.each([null, undefined, '\u003cnil\u003e'])(
      'does not reuse the result of a previous request if it was `%s`',
      async (emptyValue) => {
        const requests = [
          { method, params },
          { method, params },
        ];
        const mockResults = [emptyValue, 'some result'];

        await withMockedCommunications(
          { type: type },
          async (comms) => {
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

            const results = await withClient(
              { type: type },
              ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
            );

            expect(results).toStrictEqual(mockResults);
          },
        );
      },
    );

    if (blockParamType === 'earliest') {
      it('treats "0x00" as a synonym for "earliest"', async () => {
        const requests = [
          {
            method,
            params: buildMockParamsWithBlockParamAt(
              blockParamIndex,
              blockParam,
            ),
          },
          {
            method,
            params: buildMockParamsWithBlockParamAt(blockParamIndex, '0x00'),
          },
        ];
        const mockResults = ['first result', 'second result'];

        await withMockedCommunications(
          { type: type },
          async (comms) => {
            // The first time a block-cacheable request is made, the latest
            // block number is retrieved through the block tracker first. It
            // doesn't matter what this is — it's just used as a cache key.
            comms.mockNextBlockTrackerRequest();
            comms.mockRpcCall({
              request: requests[0],
              response: { result: mockResults[0] },
            });

            const results = await withClient(
              { type: type },
              ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
            );

            expect(results).toStrictEqual([mockResults[0], mockResults[0]]);
          },
        );
      });
    }

    if (blockParamType === 'block number') {
      it('does not reuse the result of a previous request if it was made with different arguments than this one', async () => {
        await withMockedCommunications(
          { type: type },
          async (comms) => {
            const requests = [
              {
                method,
                params: buildMockParamsWithBlockParamAt(
                  blockParamIndex,
                  '0x100',
                ),
              },
              {
                method,
                params: buildMockParamsWithBlockParamAt(
                  blockParamIndex,
                  '0x200',
                ),
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

            const results = await withClient(
              { type: type },
              ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
            );

            expect(results).toStrictEqual(['first result', 'second result']);
          },
        );
      });

      it('makes an additional request to Infura if the given block number matches the latest block number', async () => {
        await withMockedCommunications(
          { type: type },
          async (comms) => {
            const request = {
              method,
              params: buildMockParamsWithBlockParamAt(blockParamIndex, '0x100'),
            };

            // The first time a block-cacheable request is made, the latest
            // block number is retrieved through the block tracker first. This
            // also happens within the retry-on-empty middleware (although the
            // latest block is cached by now).
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            comms.mockRpcCall({
              request,
              response: { result: 'the result' },
            });

            const result = await withClient(
              { type: type },
              ({ makeRpcCall }) => makeRpcCall(request),
            );

            expect(result).toStrictEqual('the result');
          },
        );
      });

      it('makes an additional request to Infura if the given block number is less than the latest block number', async () => {
        await withMockedCommunications(
          { type: type },
          async (comms) => {
            const request = {
              method,
              params: buildMockParamsWithBlockParamAt(blockParamIndex, '0x50'),
            };

            // The first time a block-cacheable request is made, the latest
            // block number is retrieved through the block tracker first. This
            // also happens within the retry-on-empty middleware (although the
            // latest block is cached by now).
            comms.mockNextBlockTrackerRequest({ blockNumber: '0x100' });
            comms.mockRpcCall({
              request,
              response: { result: 'the result' },
            });

            const result = await withClient(
              { type: type },
              ({ makeRpcCall }) => makeRpcCall(request),
            );

            expect(result).toStrictEqual('the result');
          },
        );
      });
    }
  });

  describe('given a block tag of "pending"', () => {
    const params = buildMockParamsWithBlockParamAt(blockParamIndex, 'pending');

    it(`hits ${type} provider on all calls and does not cache anything`, async () => {
      const requests = [
        { method, params },
        { method, params },
      ];
      const mockResults = ['first result', 'second result'];

      await withMockedCommunications({ type }, async (comms) => {
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

        const results = await withClient(
          { type: type },
          ({ makeRpcCallsInSeries }) => makeRpcCallsInSeries(requests),
        );

        expect(results).toStrictEqual(mockResults);
      });
    });
  });
}
