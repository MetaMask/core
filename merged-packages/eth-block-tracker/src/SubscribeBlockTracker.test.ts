import { SubscribeBlockTracker } from '.';
import buildDeferred from '../tests/buildDeferred';
import EMPTY_FUNCTION from '../tests/emptyFunction';
import recordCallsToSetTimeout from '../tests/recordCallsToSetTimeout';
import { withSubscribeBlockTracker } from '../tests/withBlockTracker';

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
const originalSetTimeout = setTimeout;

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

  describe('destroy', () => {
    it('should stop the block tracker if any "latest" and "sync" events were added previously', async () => {
      recordCallsToSetTimeout();

      await withSubscribeBlockTracker(async ({ blockTracker }) => {
        blockTracker.on('latest', EMPTY_FUNCTION);
        await new Promise<void>((resolve) => {
          blockTracker.on('sync', resolve);
        });
        expect(blockTracker.isRunning()).toBe(true);

        await blockTracker.destroy();

        expect(blockTracker.isRunning()).toBe(false);
      });
    });

    it('should not start a timer to clear the current block number if called after removing all listeners but before enough time passes that the cache would have been cleared', async () => {
      const setTimeoutRecorder = recordCallsToSetTimeout();
      const blockResetDuration = 500;

      await withSubscribeBlockTracker(
        {
          blockTracker: {
            blockResetDuration,
          },
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          await new Promise((resolve) => {
            blockTracker.on('sync', resolve);
          });
          expect(blockTracker.getCurrentBlock()).toBe('0x0');
          blockTracker.removeAllListeners();
          expect(setTimeoutRecorder.calls).not.toHaveLength(0);

          await blockTracker.destroy();

          expect(setTimeoutRecorder.calls).toHaveLength(0);
          await new Promise((resolve) =>
            originalSetTimeout(resolve, blockResetDuration),
          );
          expect(blockTracker.getCurrentBlock()).toBe('0x0');
        },
      );
    });

    it('should only clear the current block number if enough time passes after all "latest" and "sync" events are removed', async () => {
      const setTimeoutRecorder = recordCallsToSetTimeout();

      await withSubscribeBlockTracker(
        {
          provider: {
            stubs: [
              {
                methodName: 'eth_blockNumber',
                result: '0x0',
              },
            ],
          },
        },
        async ({ blockTracker }) => {
          blockTracker.on('latest', EMPTY_FUNCTION);
          await new Promise((resolve) => {
            blockTracker.on('sync', resolve);
          });
          expect(blockTracker.getCurrentBlock()).toBe('0x0');
          blockTracker.removeAllListeners();
          await setTimeoutRecorder.next();

          await blockTracker.destroy();

          expect(blockTracker.getCurrentBlock()).toBeNull();
        },
      );
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

      it('should resolve all returned promises when a new block is available', async () => {
        recordCallsToSetTimeout();

        await withSubscribeBlockTracker(
          {
            provider: {
              stubs: [
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            const promises = [
              blockTracker.getLatestBlock(),
              blockTracker.getLatestBlock(),
            ];

            expect(await Promise.all(promises)).toStrictEqual(['0x1', '0x1']);
          },
        );
      });

      it('should reject the returned promise if the block tracker is destroyed in the meantime', async () => {
        await withSubscribeBlockTracker(async ({ blockTracker }) => {
          const promiseToGetLatestBlock =
            blockTracker[methodToGetLatestBlock]();
          await blockTracker.destroy();

          await expect(promiseToGetLatestBlock).rejects.toThrow(
            'Block tracker destroyed',
          );
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
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            const latestBlockNumber = await blockTracker[
              methodToGetLatestBlock
            ]();
            expect(latestBlockNumber).toBe('0x0');
          },
        );
      });

      it('should not ask for a new block number while the current block number is cached', async () => {
        recordCallsToSetTimeout();

        await withSubscribeBlockTracker(async ({ provider, blockTracker }) => {
          const requestSpy = jest.spyOn(provider, 'request');
          await blockTracker[methodToGetLatestBlock]();
          await blockTracker[methodToGetLatestBlock]();
          const requestsForLatestBlock = requestSpy.mock.calls.filter(
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
                  result: '0x0',
                },
                {
                  methodName: 'eth_subscribe',
                  result: '0x0',
                },
                {
                  methodName: 'eth_unsubscribe',
                  result: true,
                },
                {
                  methodName: 'eth_blockNumber',
                  result: '0x1',
                },
                {
                  methodName: 'eth_subscribe',
                  result: '0x1',
                },
                {
                  methodName: 'eth_unsubscribe',
                  result: true,
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ provider, blockTracker }) => {
            const requestSpy = jest.spyOn(provider, 'request');
            await blockTracker[methodToGetLatestBlock]();
            // For PollingBlockTracker, there are possibly multiple
            // `setTimeout`s in play at this point. For SubscribeBlockTracker
            // that is not the case, as it does not poll, but there is no harm
            // in doing this.
            await setTimeoutRecorder.nextMatchingDuration(
              blockTrackerOptions.blockResetDuration,
            );
            await blockTracker[methodToGetLatestBlock]();
            const requestsForLatestBlock = requestSpy.mock.calls.filter(
              (args) => {
                return args[0].method === 'eth_blockNumber';
              },
            );
            expect(requestsForLatestBlock).toHaveLength(2);
          },
        );
      });

      METHODS_TO_ADD_LISTENER.forEach((methodToAddListener) => {
        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should reject if, while making the request for the latest block number, the provider throws an Error`, async () => {
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
              const listener = jest.fn();
              blockTracker[methodToAddListener]('error', listener);

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForLatestBlock).rejects.toThrow(thrownError);
              expect(listener).toHaveBeenCalledWith(thrownError);
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should reject if, while making the request for the latest block number, the provider throws a string`, async () => {
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
              const listener = jest.fn();
              blockTracker[methodToAddListener]('error', listener);

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForLatestBlock).rejects.toBe(thrownString);
              expect(listener).toHaveBeenCalledWith(thrownString);
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should reject if, while making the request for the latest block number, the provider rejects with an error`, async () => {
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
              const listener = jest.fn();
              blockTracker[methodToAddListener]('error', listener);

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForLatestBlock).rejects.toThrow('boom');
              expect(listener).toHaveBeenCalledWith(new Error('boom'));
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should reject if, while making the request to subscribe, the provider throws an Error`, async () => {
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
              const listener = jest.fn();
              blockTracker[methodToAddListener]('error', listener);

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForLatestBlock).rejects.toThrow(thrownError);
              expect(listener).toHaveBeenCalledWith(thrownError);
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should reject if, while making the request to subscribe, the provider throws a string`, async () => {
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
              const listener = jest.fn();
              blockTracker[methodToAddListener]('error', listener);

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForLatestBlock).rejects.toBe(thrownString);
              expect(listener).toHaveBeenCalledWith(thrownString);
            },
          );
        });

        it(`should emit the "error" event (added via \`${methodToAddListener}\`) and should reject if, while making the request to subscribe, the provider rejects with an error`, async () => {
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
              const listener = jest.fn();
              blockTracker[methodToAddListener]('error', listener);

              const promiseForLatestBlock =
                blockTracker[methodToGetLatestBlock]();

              await expect(promiseForLatestBlock).rejects.toThrow('boom');
              expect(listener).toHaveBeenCalledWith(new Error('boom'));
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
              expect(caughtError.message).toBe('boom');
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
                  result: '0x0',
                },
              ],
            },
          },
          async ({ blockTracker }) => {
            await blockTracker[methodToGetLatestBlock]();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toBe('0x0');
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
                  result: '0x0',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await blockTracker[methodToGetLatestBlock]();
            const currentBlockNumber = blockTracker.getCurrentBlock();
            expect(currentBlockNumber).toBe('0x0');

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
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              const latestBlockNumber = await new Promise<string>((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });
              expect(latestBlockNumber).toBe('0x0');
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
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('latest', resolve);
              });
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x0');
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
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_subscribe',
                    result: '0x64',
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
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_subscribe',
                    result: '0x64',
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
              expect(caughtError.message).toBe('boom');
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
              expect(caughtError).toBe('boom');
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
                    result: '0x64',
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
              expect(caughtError.message).toBe('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
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
              expect(caughtError.message).toBe('boom');
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
              expect(caughtError).toBe('boom');
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
              expect(caughtError.message).toBe('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
            },
          );
        });

        describe.each([
          ['not initialized with `usePastBlocks`', {}],
          ['initialized with `usePastBlocks: false`', { usePastBlocks: false }],
        ] as const)(
          'after a block number is cached if the block tracker was %s',
          (_description, blockTrackerOptions) => {
            it('should emit "latest" if the published block number is greater than the current block number', async () => {
              recordCallsToSetTimeout();

              await withSubscribeBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_subscribe',
                        result: '0x64',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
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

            it('should not emit "latest" if the published block number is less than the current block number', async () => {
              recordCallsToSetTimeout();

              await withSubscribeBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x1',
                      },
                      {
                        methodName: 'eth_subscribe',
                        result: '0x64',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
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

            it('should not emit "latest" if the published block number is the same as the current block number', async () => {
              recordCallsToSetTimeout();

              await withSubscribeBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_subscribe',
                        result: '0x64',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
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

                  expect(receivedBlockNumbers).toStrictEqual(['0x0']);
                },
              );
            });
          },
        );

        describe('after a block number is cached if the block tracker was initialized with `usePastBlocks: true`', () => {
          it('should emit "latest" if the published block number is greater than the current block number', async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_subscribe',
                      result: '0x64',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
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

          it('should not emit "latest" if the published block number is less than the current block number', async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x1',
                    },
                    {
                      methodName: 'eth_subscribe',
                      result: '0x64',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
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

                expect(receivedBlockNumbers).toStrictEqual(['0x1', '0x0']);
              },
            );
          });

          it('should not emit "latest" if the published block number is the same as the current block number', async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_subscribe',
                      result: '0x64',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
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

                expect(receivedBlockNumbers).toStrictEqual(['0x0']);
              },
            );
          });
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
                    result: '0x0',
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

        it('should update the current block number', async () => {
          recordCallsToSetTimeout();

          await withSubscribeBlockTracker(
            {
              provider: {
                stubs: [
                  {
                    methodName: 'eth_blockNumber',
                    result: '0x0',
                  },
                ],
              },
            },
            async ({ blockTracker }) => {
              await new Promise((resolve) => {
                blockTracker[methodToAddListener]('sync', resolve);
              });
              const currentBlockNumber = blockTracker.getCurrentBlock();
              expect(currentBlockNumber).toBe('0x0');
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
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_subscribe',
                    result: '0x64',
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
                    result: '0x0',
                  },
                  {
                    methodName: 'eth_subscribe',
                    result: '0x64',
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
              expect(caughtError.message).toBe('boom');
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
              expect(caughtError).toBe('boom');
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
              expect(caughtError.message).toBe('boom');
              await expect(promiseForSync).toNeverResolve();
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
              expect(caughtError.message).toBe('boom');
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
              expect(caughtError).toBe('boom');
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
              expect(caughtError.message).toBe('boom');
              await expect(promiseForSync).toNeverResolve();
            },
          );
        });

        describe.each([
          ['not initialized with `usePastBlocks`', {}],
          ['initialized with `usePastBlocks: false`', { usePastBlocks: false }],
        ] as const)(
          'after a block number is cached if the block tracker was %s',
          (_description, blockTrackerOptions) => {
            it('should emit "sync" if the published block number is greater than the current block number', async () => {
              recordCallsToSetTimeout();

              await withSubscribeBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_subscribe',
                        result: '0x64',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
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

            it('should not emit "sync" if the published block number is less than the current block number', async () => {
              recordCallsToSetTimeout();

              await withSubscribeBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x1',
                      },
                      {
                        methodName: 'eth_subscribe',
                        result: '0x64',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
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

            it('should not emit "sync" if the published block number is the same as the current block number', async () => {
              recordCallsToSetTimeout();

              await withSubscribeBlockTracker(
                {
                  provider: {
                    stubs: [
                      {
                        methodName: 'eth_blockNumber',
                        result: '0x0',
                      },
                      {
                        methodName: 'eth_subscribe',
                        result: '0x64',
                      },
                    ],
                  },
                  blockTracker: blockTrackerOptions,
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
                    { oldBlock: null, newBlock: '0x0' },
                  ]);
                },
              );
            });
          },
        );

        describe('after a block number is cached if the block tracker was initialized with `usePastBlocks: true`', () => {
          it('should emit "sync" if the published block number is greater than the current block number', async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_subscribe',
                      result: '0x64',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
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

          it('should emit "sync" if the published block number is less than the current block number', async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x1',
                    },
                    {
                      methodName: 'eth_subscribe',
                      result: '0x64',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
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
                  { oldBlock: '0x1', newBlock: '0x0' },
                ]);
              },
            );
          });

          it('should not emit "sync" if the published block number is the same as the current block number', async () => {
            recordCallsToSetTimeout();

            await withSubscribeBlockTracker(
              {
                provider: {
                  stubs: [
                    {
                      methodName: 'eth_blockNumber',
                      result: '0x0',
                    },
                    {
                      methodName: 'eth_subscribe',
                      result: '0x64',
                    },
                  ],
                },
                blockTracker: { usePastBlocks: true },
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
                  { oldBlock: null, newBlock: '0x0' },
                ]);
              },
            );
          });
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
                    result: '0x0',
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
                    result: '0x0',
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
              expect(currentBlockNumber).toBe('0x0');

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
                      result: {
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
                expect(caughtError.message).toBe('boom');
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
                expect(caughtError).toBe('boom');
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
                expect(caughtError.message).toBe('boom');
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
                    result: '0x0',
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
              expect(currentBlockNumber).toBe('0x0');

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
                      result: {
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
                expect(caughtError.message).toBe('boom');
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
                expect(caughtError).toBe('boom');
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
                expect(caughtError.message).toBe('boom');
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
                  result: '0x0',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await new Promise((resolve) => {
              blockTracker.once('latest', resolve);
            });
            expect(blockTracker.getCurrentBlock()).toBe('0x0');

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
              expect(caughtError.message).toBe('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
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
              expect(caughtError.message).toBe('boom');
              await expect(promiseForLatestBlock).toNeverResolve();
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
              expect(caughtError.message).toBe('boom');
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
              expect(caughtError).toBe('boom');
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
              expect(caughtError.message).toBe('boom');
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
                  result: '0x0',
                },
              ],
            },
            blockTracker: blockTrackerOptions,
          },
          async ({ blockTracker }) => {
            await new Promise((resolve) => {
              blockTracker.once('sync', resolve);
            });
            expect(blockTracker.getCurrentBlock()).toBe('0x0');

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
              expect(caughtError.message).toBe('boom');
              await expect(promiseForSync).toNeverResolve();
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
              expect(caughtError.message).toBe('boom');
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
              expect(caughtError.message).toBe('boom');
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
              expect(caughtError).toBe('boom');
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
              expect(caughtError.message).toBe('boom');
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
                  result: '0x0',
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
                result: '0x0',
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
          expect(blockTracker.getCurrentBlock()).toBe('0x0');

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
                result: '0x0',
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
          expect(blockTracker.getCurrentBlock()).toBe('0x0');

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
