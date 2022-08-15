import EMPTY_FUNCTION from '../tests/emptyFunction';
import recordCallsToSetTimeout from '../tests/recordCallsToSetTimeout';
import { withSubscribeBlockTracker } from '../tests/withBlockTracker';
import buildDeferred from '../tests/buildDeferred';
import { SubscribeBlockTracker } from '.';

interface Sync {
  oldBlock: string;
  newBlock: string;
}

const METHODS_TO_ADD_LISTENER = ['on', 'addListener'] as const;
const METHODS_TO_REMOVE_LISTENER = ['off', 'removeListener'] as const;
const METHODS_TO_GET_LATEST_BLOCK = [
  'getLatestBlock',
  'checkForLatestBlock',
] as const;

describe('SubscribeBlockTracker', () => {
  describe('constructor', () => {
    it('should throw if given no options', () => {
      expect(() => new SubscribeBlockTracker()).toThrow(
        'SubscribeBlockTracker - no provider specified.',
      );
    });

    it('should throw if given options but not given a provider', () => {
      expect(() => new SubscribeBlockTracker({})).toThrow(
        'SubscribeBlockTracker - no provider specified.',
      );
    });

    it('should return a block tracker that is not running', async () => {
      recordCallsToSetTimeout();

      await withSubscribeBlockTracker(({ blockTracker }) => {
        expect(blockTracker.isRunning()).toBe(false);
      });
    });
  });

  METHODS_TO_GET_LATEST_BLOCK.forEach((methodToGetLatestBlock) => {
    describe(`${methodToGetLatestBlock}`, () => {
      it('should start the block tracker immediately after being called', async () => {
        recordCallsToSetTimeout();

        await withSubscribeBlockTracker(async ({ blockTracker }) => {
          const promiseToGetLatestBlock =
            blockTracker[methodToGetLatestBlock]();
          expect(blockTracker.isRunning()).toBe(true);
          // We have to wait for the promise to resolve after the assertion
          // because by the time this promise resolves, the block tracker isn't
          // running anymore
          await promiseToGetLatestBlock;
        });
      });

      it('should stop the block tracker automatically after its promise is fulfilled', async () => {
        recordCallsToSetTimeout();

        await withSubscribeBlockTracker(async ({ blockTracker }) => {
          await blockTracker[methodToGetLatestBlock]();
          expect(blockTracker.isRunning()).toBe(false);
        });
      });

      it('should fetch the latest block number', async () => {
        recordCallsToSetTimeout();

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x0',
                  },
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            const latestBlockNumber = await blockTracker[
              methodToGetLatestBlock
            ]();
            expect(latestBlockNumber).toStrictEqual('0x0');
          },
        );
      });

      it('should not ask for a new block number while the current block number is cached', async () => {
        recordCallsToSetTimeout();

        await withSubscribeBlockTracker(async ({ provider, blockTracker }) => {
          const sendAsyncSpy = jest.spyOn(provider, 'sendAsync');
          await blockTracker[methodToGetLatestBlock]();
          await blockTracker[methodToGetLatestBlock]();
          const requestsForLatestBlock = sendAsyncSpy.mock.calls.filter(
            (args) => {
              return args[0].method === 'eth_blockNumber';
            },
          );
          expect(requestsForLatestBlock).toHaveLength(1);
        });
      });

      it('should ask for a new block number after the cached one is cleared', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x0',
                  },
                },
                {
                  methodName: 'eth_subscribe',
                  response: {
                    result: '0x0',
                  },
                },
                {
                  methodName: 'eth_unsubscribe',
                  response: {
                    result: true,
                  },
                },
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x1',
                  },
                },
                {
                  methodName: 'eth_subscribe',
                  response: {
                    result: '0x1',
                  },
                },
                {
                  methodName: 'eth_unsubscribe',
                  response: {
                    result: true,
                  },
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ provider, blockTracker }) => {
            const sendAsyncSpy = jest.spyOn(provider, 'sendAsync');
            await blockTracker[methodToGetLatestBlock]();
            // For PollingBlockTracker, there are possibly multiple
            // `setTimeout`s in play at this point. For SubscribeBlockTracker
            // that is not the case, as it does not poll, but there is no harm
            // in doing this.
            await setTimeoutRecorder.nextMatchingDuration(
              blockTrackerOptions.blockResetDuration,
            );
            await blockTracker[methodToGetLatestBlock]();
            const requestsForLatestBlock = sendAsyncSpy.mock.calls.filter(
              (args) => {
                return args[0].method === 'eth_blockNumber';
              },
            );
            expect(requestsForLatestBlock).toHaveLength(2);
          },
        );
      });

      METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) and should resolve with undefined if the request for the latest block number returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForCaughtError).toNeverResolve();
              const latestBlock = await promiseForLatestBlock;
              expect(latestBlock).toBeUndefined();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should never resolve if, while making the request for the latest block number, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownError = new Error('boom');

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownError);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should never resolve if, while making the request for the latest block number, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownString = 'boom';

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownString;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownString);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should never resolve if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) and should still resolve with the latest block number if the request to subscribe returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForCaughtError).toNeverResolve();
              const latestBlockNumber = await promiseForLatestBlock;
              expect(latestBlockNumber).toStrictEqual('0x0');
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should never resolve if, while making the request to subscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownError = new Error('boom');

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownError);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should never resolve if, while making the request to subscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownString = 'boom';

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw thrownString;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownString);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should never resolve if, while making the request to subscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) if the request to unsubscribe returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await blockTracker[methodToGetLatestBlock]();

              await expect(promiseForCaughtError).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownError = new Error('boom');

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownError);
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownString = 'boom';

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    implementation: () => {
                      throw thrownString;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownString);
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await blockTracker[methodToGetLatestBlock]();

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
            },
          );
        });
      });

      it('should update the current block number', async () => {
        recordCallsToSetTimeout();

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x0',
                  },
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            await blockTracker[methodToGetLatestBlock]();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toStrictEqual('0x0');
          },
        );
      });

      it('should clear the current block number some time after being called', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x0',
                  },
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await blockTracker[methodToGetLatestBlock]();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toStrictEqual('0x0');

            // For PollingBlockTracker, there are possibly multiple
            // `setTimeout`s in play at this point. For SubscribeBlockTracker
            // that is not the case, as it does not poll, but there is no harm
            // in doing this.
            await setTimeoutRecorder.nextMatchingDuration(
              blockTrackerOptions.blockResetDuration,
            );
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });
    });
  });

  METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
    describe(`${methodToAddListener}`, () => {
      describe('"latest"', () => {
        it('should start the block tracker', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(({ blockTracker }) => {
            blockTracker[methodToAddListener]('latest', EMPTY_FUNCTION);

            expect(blockTracker.isRunning()).toBe(true);
          });
        });

        it('should emit "latest" soon after being listened to', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const latestBlockNumber = await new Promise<string>((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });
              expect(latestBlockNumber).toStrictEqual('0x0');
            },
          );
        });

        it('should emit "latest" as the subscription channel publishes new blocks', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const receivedBlockNumbers: string[] = [];
              blockTracker.on('_started', () => {
                provider.emit('data', null, {
                  method: 'eth_subscription',
                  params: {
                    subscription: '0x64',
                    result: {
                      number: '0x1',
                    },
                  },
                });
              });

              await new Promise<void>((resolve) => {
                blockTracker[methodToAddListener](
                  'latest',
                  (blockNumber: string) => {
                    receivedBlockNumbers.push(blockNumber);
                    if (receivedBlockNumbers.length === 2) {
                      resolve();
                    }
                  },
                );
              });

              expect(receivedBlockNumbers).toStrictEqual(['0x0', '0x1']);
            },
          );
        });

        it('should not emit "latest" if the subscription id of an incoming message does not match the created subscription id', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const receivedBlockNumbers: string[] = [];

              await new Promise<void>((resolve) => {
                blockTracker.on('_started', () => {
                  provider.emit('data', null, {
                    method: 'eth_subscription',
                    params: {
                      subscription: '0x1',
                      result: {
                        number: '0x1',
                      },
                    },
                  });
                  resolve();
                });

                blockTracker[methodToAddListener](
                  'latest',
                  (blockNumber: string) => {
                    receivedBlockNumbers.push(blockNumber);
                  },
                );
              });

              expect(receivedBlockNumbers).toStrictEqual(['0x0']);
            },
          );
        });

        it('should not emit "latest" if the incoming message has no params', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const receivedBlockNumbers: string[] = [];

              await new Promise<void>((resolve) => {
                blockTracker.on('_started', () => {
                  provider.emit('data', null, {
                    method: 'eth_subscription',
                  });
                  resolve();
                });

                blockTracker[methodToAddListener](
                  'latest',
                  (blockNumber: string) => {
                    receivedBlockNumbers.push(blockNumber);
                  },
                );
              });

              expect(receivedBlockNumbers).toStrictEqual(['0x0']);
            },
          );
        });

        it('should not emit "latest" if the newly fetched block number is less than the current block number', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x1',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const receivedBlockNumbers: string[] = [];

              await new Promise<void>((resolve) => {
                blockTracker.on('_started', () => {
                  provider.emit('data', null, {
                    method: 'eth_subscription',
                    params: {
                      subscription: '0x64',
                      result: {
                        number: '0x0',
                      },
                    },
                  });
                  resolve();
                });

                blockTracker[methodToAddListener](
                  'latest',
                  (blockNumber: string) => {
                    receivedBlockNumbers.push(blockNumber);
                  },
                );
              });

              expect(receivedBlockNumbers).toStrictEqual(['0x1']);
            },
          );
        });

        it('should re-throw any error out of band that occurs in the listener', async () => {
          await withSubscribeBlockTracker(async ({ blockTracker }) => {
            const thrownError = new Error('boom');
            const promiseForCaughtError = new Promise<unknown>((resolve) => {
              recordCallsToSetTimeout({
                numAutomaticCalls: 1,
                interceptCallback: (callback, stopPassingThroughCalls) => {
                  return async () => {
                    try {
                      await callback();
                    } catch (error: unknown) {
                      resolve(error);
                      stopPassingThroughCalls();
                    }
                  };
                },
              });
            });

            blockTracker[methodToAddListener]('latest', () => {
              throw thrownError;
            });

            const caughtError = await promiseForCaughtError;
            expect(caughtError).toBe(thrownError);
          });
        });

        it(`should not emit the "error" event and should emit "latest" with undefined if the request for the latest block number returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              const latestBlock = await promiseForLatestBlock;
              expect(latestBlock).toBeUndefined();
            },
          );
        });

        it(`should emit the "error" event and should not emit "latest" if, while making the request for the latest block number, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw new Error('boom');
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "latest" if, while making the request for the latest block number, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw 'boom';
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "latest" if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: 'boom',
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should not emit the "error" event and should still emit "latest" with the latest block number if the request to subscribe returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const latestBlockNumber = await new Promise<string>((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              expect(latestBlockNumber).toStrictEqual('0x0');
            },
          );
        });

        it(`should emit the "error" event and should not emit "latest" if, while making the request to subscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw new Error('boom');
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "latest" if, while making the request to subscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw 'boom';
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "latest" if, while making the request to subscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it('should update the current block number', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toStrictEqual('0x0');
            },
          );
        });
      });

      describe('"sync"', () => {
        it('should start the block tracker', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(({ blockTracker }) => {
            blockTracker[methodToAddListener]('sync', EMPTY_FUNCTION);

            expect(blockTracker.isRunning()).toBe(true);
          });
        });

        it('should emit "sync" soon after being listened to', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const sync = await new Promise<Sync>((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });
              expect(sync).toStrictEqual({ oldBlock: null, newBlock: '0x0' });
            },
          );
        });

        it('should emit "sync" as the subscription channel publishes new blocks', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const syncs: Sync[] = [];
              blockTracker.on('_started', () => {
                provider.emit('data', null, {
                  method: 'eth_subscription',
                  params: {
                    subscription: '0x64',
                    result: {
                      number: '0x1',
                    },
                  },
                });
              });

              await new Promise<void>((resolve) => {
                blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                  syncs.push(sync);
                  if (syncs.length === 2) {
                    resolve();
                  }
                });
              });

              expect(syncs).toStrictEqual([
                { oldBlock: null, newBlock: '0x0' },
                { oldBlock: '0x0', newBlock: '0x1' },
              ]);
            },
          );
        });

        it('should not emit "sync" if the subscription id of an incoming message does not match the created subscription id', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const syncs: Sync[] = [];

              await new Promise<void>((resolve) => {
                blockTracker.on('_started', () => {
                  provider.emit('data', null, {
                    method: 'eth_subscription',
                    params: {
                      subscription: '0x1',
                      result: {
                        number: '0x1',
                      },
                    },
                  });
                  resolve();
                });

                blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                  syncs.push(sync);
                });
              });

              expect(syncs).toStrictEqual([
                { oldBlock: null, newBlock: '0x0' },
              ]);
            },
          );
        });

        it('should not emit "sync" if the incoming message has no params', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const syncs: Sync[] = [];

              await new Promise<void>((resolve) => {
                blockTracker.on('_started', () => {
                  provider.emit('data', null, {
                    method: 'eth_subscription',
                  });
                  resolve();
                });

                blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                  syncs.push(sync);
                });
              });

              expect(syncs).toStrictEqual([
                { oldBlock: null, newBlock: '0x0' },
              ]);
            },
          );
        });

        it('should not emit "sync" if the newly fetched block number is less than the current block number', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x1',
                    },
                  },
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      result: '0x64',
                    },
                  },
                ],
              },
            },
            async ({ provider, blockTracker }) => {
              const syncs: Sync[] = [];

              await new Promise<void>((resolve) => {
                blockTracker.on('_started', () => {
                  provider.emit('data', null, {
                    method: 'eth_subscription',
                    params: {
                      subscription: '0x64',
                      result: {
                        number: '0x0',
                      },
                    },
                  });
                  resolve();
                });

                blockTracker[methodToAddListener]('sync', (sync: Sync) => {
                  syncs.push(sync);
                });
              });

              expect(syncs).toStrictEqual([
                { oldBlock: null, newBlock: '0x1' },
              ]);
            },
          );
        });

        it('should re-throw any error out of band that occurs in the listener', async () => {
          await withSubscribeBlockTracker(async ({ blockTracker }) => {
            const thrownError = new Error('boom');
            const promiseForCaughtError = new Promise<unknown>((resolve) => {
              recordCallsToSetTimeout({
                numAutomaticCalls: 1,
                interceptCallback: (callback, stopPassingThroughCalls) => {
                  return async () => {
                    try {
                      await callback();
                    } catch (error: unknown) {
                      resolve(error);
                      stopPassingThroughCalls();
                    }
                  };
                },
              });
            });

            blockTracker[methodToAddListener]('sync', () => {
              throw thrownError;
            });

            const caughtError = await promiseForCaughtError;
            expect(caughtError).toBe(thrownError);
          });
        });

        it(`should not emit the "error" event and should emit "sync" with undefined in place of the latest block if the request for the latest block number returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              const sync = await promiseForSync;
              expect(sync).toStrictEqual({
                oldBlock: null,
                newBlock: undefined,
              });
            },
          );
        });

        it(`should emit the "error" event and should not emit "sync" if, while making a request for the latest block number, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw new Error('boom');
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "sync" if, while making a request for the latest block number, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw 'boom';
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "sync" if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should not emit the "error" event and should still emit "sync" with the latest block number if the request to subscribe returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              const sync = await promiseForSync;
              expect(sync).toStrictEqual({
                oldBlock: null,
                newBlock: '0x0',
              });
            },
          );
        });

        it(`should emit the "error" event and should not emit "sync" if, while making the request to subscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw new Error('boom');
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "latest" if, while making the request to subscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw 'boom';
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event and should not emit "sync" if, while making the request to subscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it('should update the current block number', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toStrictEqual('0x0');
            },
          );
        });
      });

      describe('some other event', () => {
        it('should not start the block tracker', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(({ blockTracker }) => {
            blockTracker[methodToAddListener]('somethingElse', EMPTY_FUNCTION);

            expect(blockTracker.isRunning()).toBe(false);
          });
        });

        it('should not update the current block number', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              blockTracker[methodToAddListener](
                'somethingElse',
                EMPTY_FUNCTION,
              );
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBeNull();
            },
          );
        });
      });
    });
  });

  METHODS_TO_REMOVE_LISTENER.forEach((methodToRemoveListener) => {
    describe(`${methodToRemoveListener}`, () => {
      describe('"latest"', () => {
        it('should stop the block tracker if the last instance of this event is removed', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(async ({ blockTracker }) => {
            const listener1 = EMPTY_FUNCTION;
            const { promise: promiseForLatestBlock, resolve: listener2 } =
              buildDeferred();

            blockTracker.on('latest', listener1);
            blockTracker.on('latest', listener2);
            expect(blockTracker.isRunning()).toBe(true);

            await promiseForLatestBlock;

            blockTracker[methodToRemoveListener]('latest', listener1);
            blockTracker[methodToRemoveListener]('latest', listener2);
            expect(blockTracker.isRunning()).toBe(false);
          });
        });

        it('should clear the current block number some time after the last instance of this event is removed', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            pollingInterval: 100,
            blockResetDuration: 200,
          };

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              const listener1 = EMPTY_FUNCTION;
              const { promise: promiseForLatestBlock, resolve: listener2 } =
                buildDeferred();

              blockTracker.on('latest', listener1);
              blockTracker.on('latest', listener2);
              await promiseForLatestBlock;
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toStrictEqual('0x0');

              blockTracker[methodToRemoveListener]('latest', listener1);
              blockTracker[methodToRemoveListener]('latest', listener2);
              // For PollingBlockTracker, there are possibly multiple
              // `setTimeout`s in play at this point. For SubscribeBlockTracker
              // that is not the case, as it does not poll, but there is no harm
              // in doing this.
              await setTimeoutRecorder.nextMatchingDuration(
                blockTrackerOptions.blockResetDuration,
              );
              expect(blockTracker.getCurrentBlock()).toBeNull();
            },
          );
        });

        METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
          it(`should not emit the "error" event (added via \`${methodToAddListener}\`) if the request to unsubscribe returns an error response`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      response: {
                        error: 'boom',
                      },
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForLatestBlock, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('latest', listener);
                await promiseForLatestBlock;
                blockTracker[methodToRemoveListener]('latest', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                await expect(promiseForCaughtError).toNeverResolve();
              },
            );
          });

          it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws an Error`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      implementation: () => {
                        throw new Error('boom');
                      },
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForLatestBlock, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('latest', listener);
                await promiseForLatestBlock;
                blockTracker[methodToRemoveListener]('latest', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                const caughtError = await promiseForCaughtError;
                expect(caughtError.message).toStrictEqual('boom');
              },
            );
          });

          it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws a string`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      implementation: () => {
                        throw 'boom';
                      },
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForLatestBlock, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('latest', listener);
                await promiseForLatestBlock;
                blockTracker[methodToRemoveListener]('latest', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                const caughtError = await promiseForCaughtError;
                expect(caughtError).toStrictEqual('boom');
              },
            );
          });

          it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider rejects with an error`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      error: 'boom',
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForLatestBlock, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('latest', listener);
                await promiseForLatestBlock;
                blockTracker[methodToRemoveListener]('latest', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                const caughtError = await promiseForCaughtError;
                expect(caughtError.message).toStrictEqual('boom');
              },
            );
          });
        });
      });

      describe('"sync"', () => {
        it('should stop the block tracker if the last instance of this event is removed', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(async ({ blockTracker }) => {
            const listener1 = EMPTY_FUNCTION;
            const { promise: promiseForLatestBlock, resolve: listener2 } =
              buildDeferred();

            blockTracker.on('sync', listener1);
            blockTracker.on('sync', listener2);
            expect(blockTracker.isRunning()).toBe(true);

            await promiseForLatestBlock;

            blockTracker[methodToRemoveListener]('sync', listener1);
            blockTracker[methodToRemoveListener]('sync', listener2);
            expect(blockTracker.isRunning()).toBe(false);
          });
        });

        it('should clear the current block number some time after the last instance of this event is removed', async () => {
          const setTimeoutRecorder = recordCallsToSetTimeout();
          const blockTrackerOptions = {
            pollingInterval: 100,
            blockResetDuration: 200,
          };

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      result: '0x0',
                    },
                  },
                ],
              },
              blockTracker: blockTrackerOptions,
            },
            async ({ blockTracker }) => {
              const listener1 = EMPTY_FUNCTION;
              const { promise: promiseForLatestBlock, resolve: listener2 } =
                buildDeferred();

              blockTracker.on('sync', listener1);
              blockTracker.on('sync', listener2);
              await promiseForLatestBlock;
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toStrictEqual('0x0');

              blockTracker[methodToRemoveListener]('sync', listener1);
              blockTracker[methodToRemoveListener]('sync', listener2);
              // For PollingBlockTracker, there are possibly multiple
              // `setTimeout`s in play at this point. For SubscribeBlockTracker
              // that is not the case, as it does not poll, but there is no harm
              // in doing this.
              await setTimeoutRecorder.nextMatchingDuration(
                blockTrackerOptions.blockResetDuration,
              );
              expect(blockTracker.getCurrentBlock()).toBeNull();
            },
          );
        });

        METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
          it(`should not emit the "error" event (added via \`${methodToAddListener}\`) if the request to unsubscribe returns an error response`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      response: {
                        error: 'boom',
                      },
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForSync, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('sync', listener);
                await promiseForSync;
                blockTracker[methodToRemoveListener]('sync', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                await expect(promiseForCaughtError).toNeverResolve();
              },
            );
          });

          it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws an Error`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      implementation: () => {
                        throw new Error('boom');
                      },
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForSync, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('sync', listener);
                await promiseForSync;
                blockTracker[methodToRemoveListener]('sync', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                const caughtError = await promiseForCaughtError;
                expect(caughtError.message).toStrictEqual('boom');
              },
            );
          });

          it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws a string`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      implementation: () => {
                        throw 'boom';
                      },
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForSync, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('sync', listener);
                await promiseForSync;
                blockTracker[methodToRemoveListener]('sync', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                const caughtError = await promiseForCaughtError;
                expect(caughtError).toStrictEqual('boom');
              },
            );
          });

          it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider rejects with an error`, async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_unsubscribe',
                      error: 'boom',
                    },
                  ],
                },
              },
              async ({ blockTracker }) => {
                const { promise: promiseForSync, resolve: listener } =
                  buildDeferred();
                const promiseForCaughtError = new Promise<any>((resolve) => {
                  blockTracker[methodToAddListener]('error', resolve);
                });

                blockTracker.on('sync', listener);
                await promiseForSync;
                blockTracker[methodToRemoveListener]('sync', listener);
                await new Promise((resolve) => {
                  blockTracker.on('_ended', resolve);
                });

                const caughtError = await promiseForCaughtError;
                expect(caughtError.message).toStrictEqual('boom');
              },
            );
          });
        });
      });

      describe('some other event', () => {
        it('should not stop the block tracker', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(async ({ blockTracker }) => {
            const { promise: promiseForLatestBlock, resolve: listener1 } =
              buildDeferred();
            const listener2 = EMPTY_FUNCTION;

            blockTracker.on('latest', listener1);
            blockTracker.on('somethingElse', listener2);
            expect(blockTracker.isRunning()).toBe(true);

            await promiseForLatestBlock;

            blockTracker[methodToRemoveListener]('somethingElse', listener2);
            expect(blockTracker.isRunning()).toBe(true);
          });
        });
      });
    });
  });

  describe('once', () => {
    describe('"latest"', () => {
      it('should start and then stop the block tracker automatically', async () => {
        // We stub 2 calls because SubscribeBlockTracker#_synchronize will make a
        // call (to proceed to the next iteration) and BaseBlockTracker will
        // make a call (to reset the current block number when the tracker is
        // not running)
        recordCallsToSetTimeout({ numAutomaticCalls: 2 });

        await withSubscribeBlockTracker(async ({ blockTracker }) => {
          await new Promise((resolve) => {
            blockTracker.on('_ended', resolve);
            blockTracker.once('latest', EMPTY_FUNCTION);
          });

          expect(blockTracker.isRunning()).toBe(false);
        });
      });

      it('should set the current block number and then clear it some time afterward', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x0',
                  },
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await new Promise((resolve) => {
              blockTracker.once('latest', resolve);
            });
            expect(blockTracker.getCurrentBlock()).toStrictEqual('0x0');

            // For PollingBlockTracker, there are possibly multiple
            // `setTimeout`s in play at this point. For SubscribeBlockTracker
            // that is not the case, as it does not poll, but there is no harm
            // in doing this.
            await setTimeoutRecorder.nextMatchingDuration(
              blockTrackerOptions.blockResetDuration,
            );
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });

      METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) and should emit "latest" with undefined if the request for the latest block number returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              const latestBlockNumber = await promiseForLatestBlock;
              expect(latestBlockNumber).toBeUndefined();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "latest" if, while making the request for the latest block number, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownError = new Error('boom');

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownError);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "latest" if, while making the request for the latest block number, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownString = 'boom';

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownString;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toMatch(thrownString);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "latest" if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) and should still emit "latest" if the request to subscribe returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const latestBlockNumber = await new Promise<string>((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              expect(latestBlockNumber).toStrictEqual('0x0');
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "latest" if, while making the request to subscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownError = new Error('boom');

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownError);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "latest" if, while making the request to subscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownString = 'boom';

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw thrownString;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownString);
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "latest" if, while making the request to subscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForLatestBlock = new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) if the request to unsubscribe returns an error response`, async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    implementation: () => {
                      throw new Error('boom');
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    implementation: () => {
                      throw 'boom';
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toStrictEqual('boom');
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await new Promise((resolve) => {
                blockTracker.once('latest', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
            },
          );
        });
      });
    });

    describe('"sync"', () => {
      it('should start and then stop the block tracker automatically', async () => {
        // We stub 2 calls because SubscribeBlockTracker#_synchronize will make a call
        // (to proceed to the next iteration) and BaseBlockTracker will make a call
        // (to reset the current block number when the tracker is not running)
        recordCallsToSetTimeout({ numAutomaticCalls: 2 });

        await withSubscribeBlockTracker(async ({ blockTracker }) => {
          await new Promise((resolve) => {
            blockTracker.on('_ended', resolve);
            blockTracker.once('sync', EMPTY_FUNCTION);
          });

          expect(blockTracker.isRunning()).toBe(false);
        });
      });

      it('should set the current block number and then clear it some time afterward', async () => {
        const setTimeoutRecorder = recordCallsToSetTimeout();
        const blockTrackerOptions = {
          pollingInterval: 100,
          blockResetDuration: 200,
        };

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x0',
                  },
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await new Promise((resolve) => {
              blockTracker.once('sync', resolve);
            });
            expect(blockTracker.getCurrentBlock()).toStrictEqual('0x0');

            // For PollingBlockTracker, there are possibly multiple
            // `setTimeout`s in play at this point. For SubscribeBlockTracker
            // that is not the case, as it does not poll, but there is no harm
            // in doing this.
            await setTimeoutRecorder.nextMatchingDuration(
              blockTrackerOptions.blockResetDuration,
            );
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });

      METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) and should emit "sync" with undefined in place of the latest block number if the request for the latest block number returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              const sync = await promiseForSync;
              expect(sync).toStrictEqual({
                oldBlock: null,
                newBlock: undefined,
              });
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "sync" if, while making the request for the latest block number, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownError = new Error('boom');

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownError);
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "sync" if, while making the request for the latest block number, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownString = 'boom';

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    implementation: () => {
                      throw thrownString;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownString);
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "sync" if, while making the request for the latest block number, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should not emit the "error" event (added via \`${methodToAddListener}\`) and should still emit "sync" if the request to subscribe returns an error response`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    response: {
                      error: 'boom',
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const sync = await new Promise<string>((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });

              await expect(promiseForCaughtError).toNeverResolve();
              expect(sync).toStrictEqual({ oldBlock: null, newBlock: '0x0' });
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "sync" if, while making the request to subscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownError = new Error('boom');

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw thrownError;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownError);
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should not emit "sync" if, while making the request to subscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });
          const thrownString = 'boom';

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    implementation: () => {
                      throw thrownString;
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toBe(thrownString);
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should take a listener that is never called if, while making the request to subscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout({ numAutomaticCalls: 1 });

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_subscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              const promiseForSync = new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws an Error`, async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    implementation: () => {
                      throw new Error('boom');
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider throws a string`, async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    implementation: () => {
                      throw 'boom';
                    },
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError).toStrictEqual('boom');
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) if, while making the request to unsubscribe, the provider rejects with an error`, async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_unsubscribe',
                    error: 'boom',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const promiseForCaughtError = new Promise<any>((resolve) => {
                blockTracker[methodToAddListener]('error', resolve);
              });

              await new Promise((resolve) => {
                blockTracker.once('sync', resolve);
              });

              const caughtError = await promiseForCaughtError;
              expect(caughtError.message).toStrictEqual('boom');
            },
          );
        });
      });
    });

    describe('some other event', () => {
      it('should never start the block tracker', async () => {
        // We stub 2 calls because SubscribeBlockTracker#_synchronize will make a call
        // (to proceed to the next iteration) and BaseBlockTracker will make a call
        // (to reset the current block number when the tracker is not running)
        recordCallsToSetTimeout({ numAutomaticCalls: 2 });

        await withSubscribeBlockTracker(async ({ blockTracker }) => {
          const listener = jest.fn();
          blockTracker.on('_ended', listener);
          blockTracker.once('somethingElse', EMPTY_FUNCTION);

          expect(listener).not.toHaveBeenCalled();
        });
      });

      it('should never set the current block number', async () => {
        recordCallsToSetTimeout({ numAutomaticCalls: 1 });

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  response: {
                    result: '0x0',
                  },
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            blockTracker.once('somethingElse', EMPTY_FUNCTION);
            expect(blockTracker.getCurrentBlock()).toBeNull();
          },
        );
      });
    });
  });

  describe('removeAllListeners', () => {
    it('should stop the block tracker if any "latest" and "sync" events were added previously', async () => {
      recordCallsToSetTimeout();

      await withSubscribeBlockTracker(async ({ blockTracker }) => {
        blockTracker.on('latest', EMPTY_FUNCTION);
        await new Promise((resolve) => {
          blockTracker.on('sync', resolve);
        });
        expect(blockTracker.isRunning()).toBe(true);

        blockTracker.removeAllListeners();
        expect(blockTracker.isRunning()).toBe(false);
      });
    });

    it('should clear the current block number some time after all "latest" and "sync" events are removed', async () => {
      const setTimeoutRecorder = recordCallsToSetTimeout();
      const blockTrackerOptions = {
        pollingInterval: 100,
        blockResetDuration: 200,
      };

      await withSubscribeBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                response: {
                  result: '0x0',
                },
              },
            ],
          },
          blockTracker: blockTrackerOptions,
        },
        async ({ blockTracker }) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          await new Promise((resolve) => {
            blockTracker.on('sync', resolve);
          });
          expect(blockTracker.getCurrentBlock()).toStrictEqual('0x0');

          blockTracker.removeAllListeners();
          // For PollingBlockTracker, there are possibly multiple `setTimeout`s
          // in play at this point. For SubscribeBlockTracker that is not the
          // case, as it does not poll, but there is no harm in doing this.
          await setTimeoutRecorder.nextMatchingDuration(
            blockTrackerOptions.blockResetDuration,
          );
          expect(blockTracker.getCurrentBlock()).toBeNull();
        },
      );
    });

    it('should stop the block tracker when all previously added "latest" and "sync" events are removed specifically', async () => {
      recordCallsToSetTimeout();

      await withSubscribeBlockTracker(async ({ blockTracker }) => {
        await new Promise<void>((resolve) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          blockTracker.on('sync', resolve);
        });
        expect(blockTracker.isRunning()).toBe(true);

        blockTracker.removeAllListeners('latest');
        expect(blockTracker.isRunning()).toBe(true);

        blockTracker.removeAllListeners('sync');
        expect(blockTracker.isRunning()).toBe(false);
      });
    });

    it('should clear the current block number some time after all "latest" and "sync" events are removed specifically', async () => {
      const setTimeoutRecorder = recordCallsToSetTimeout();
      const blockTrackerOptions = {
        pollingInterval: 100,
        blockResetDuration: 200,
      };

      await withSubscribeBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                response: {
                  result: '0x0',
                },
              },
            ],
          },
          blockTracker: blockTrackerOptions,
        },
        async ({ blockTracker }) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          await new Promise((resolve) => {
            blockTracker.on('sync', resolve);
          });
          expect(blockTracker.getCurrentBlock()).toStrictEqual('0x0');

          blockTracker.removeAllListeners('latest');
          blockTracker.removeAllListeners('sync');
          // For PollingBlockTracker, there are possibly multiple `setTimeout`s
          // in play at this point. For SubscribeBlockTracker that is not the
          // case, as it does not poll, but there is no harm in doing this.
          await setTimeoutRecorder.nextMatchingDuration(
            blockTrackerOptions.blockResetDuration,
          );
          expect(blockTracker.getCurrentBlock()).toBeNull();
        },
      );
    });
  });
});
