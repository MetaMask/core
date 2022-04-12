const GanacheCore = require('ganache-core');
const pify = require('pify');

module.exports = (test, testLabel, PollingBlockTracker) => {
  test(`${testLabel} - latest`, async (t) => {
    const provider = GanacheCore.provider();
    const blockTracker = new PollingBlockTracker({
      provider,
      pollingInterval: 100,
    });

    try {
      t.equal(
        blockTracker.isRunning(),
        false,
        'PollingBlockTracker should begin stopped',
      );

      const blocks = [];
      blockTracker.on('latest', (block) => blocks.push(block));
      t.equal(
        blockTracker.isRunning(),
        true,
        'PollingBlockTracker should start after listener is added',
      );
      t.equal(blocks.length, 0, 'no blocks so far');

      await newLatestBlock(blockTracker);
      t.equal(blocks.length, 1, 'saw 1st block');

      await triggerNextBlock(provider);
      await newLatestBlock(blockTracker);
      t.equal(blocks.length, 2, 'saw 2nd block');

      await triggerNextBlock(provider);
      await triggerNextBlock(provider);
      await triggerNextBlock(provider);
      const lastBlock = await newLatestBlock(blockTracker);
      t.equal(blocks.length, 3, 'saw only 5th block');
      t.equal(
        Number.parseInt(lastBlock, 16),
        4,
        'saw correct block, with number 4',
      );

      blockTracker.removeAllListeners();
      t.equal(
        blockTracker.isRunning(),
        false,
        'PollingBlockTracker stops after all listeners are removed',
      );
    } catch (err) {
      t.ifError(err);
    }

    // cleanup
    blockTracker.removeAllListeners();
    t.end();
  });

  test(`${testLabel} - error catch`, async (t) => {
    const provider = GanacheCore.provider();
    const blockTracker = new PollingBlockTracker({
      provider,
      pollingInterval: 100,
    });

    const ignoreError = function (err) {
      // ignore our error
      if (err.message.includes('boom')) {
        return;
      }
      // otherwise fail
      t.ifError(err);
    };

    // ignore our error if registered as an uncaughtException
    process.on('uncaughtException', ignoreError);

    try {
      // keep the block tracker polling
      blockTracker.on('latest', () => undefined);
      // throw error in handler in attempt to break block tracker
      blockTracker.once('latest', () => {
        throw new Error('boom');
      });

      // emit and observe a block
      const nextBlockPromise = nextBlockSeen(blockTracker);
      await triggerNextBlock(provider);
      await nextBlockPromise;

      // emit and observe another block
      const nextNextBlockPromise = nextBlockSeen(blockTracker);
      await triggerNextBlock(provider);
      await nextNextBlockPromise;
    } catch (err) {
      t.ifError(err);
    }

    // setTimeout so we dont remove the uncaughtException handler before
    // the SafeEventEmitter emits the event on next tick
    setTimeout(() => {
      // cleanup
      process.removeListener('uncaughtException', ignoreError);
      blockTracker.removeAllListeners();
    });
  });

  test(`${testLabel} - _fetchLatestBlock error handling`, async (t) => {
    const provider = GanacheCore.provider();
    const blockTracker = new PollingBlockTracker({
      provider,
      pollingInterval: 100,
    });

    // measure if errors are reported to the console
    const consoleErrors = [];
    const originalConsoleErrorMethod = console.error;
    console.error = (err) => consoleErrors.push(err);

    // override _fetchLatestBlock to throw an error
    const originalFetchLatestBlock = blockTracker._fetchLatestBlock;
    blockTracker._fetchLatestBlock = async () => {
      // restore fetch method
      blockTracker._fetchLatestBlock = originalFetchLatestBlock;
      // throw error to try and break block tracker
      throw new Error('TestError');
    };

    try {
      const latestBlock = await blockTracker.getLatestBlock();
      t.ok(latestBlock, 'got a block back');
      t.ok(consoleErrors.length, 1, 'saw expected console error');
    } catch (err) {
      t.ifError(err);
    }

    // setTimeout so we dont remove the uncaughtException handler before
    // the SafeEventEmitter emits the event on next tick
    setTimeout(() => {
      // cleanup
      console.error = originalConsoleErrorMethod;
      blockTracker.removeAllListeners();
    });
  });
};

/**
 * Calls the `evm_mine` RPC method via the given provider.
 *
 * @param {any} provider - The provider.
 * @returns {Promise<any>} A promise that resolves to the result of the `evm_mine` call.
 */
async function triggerNextBlock(provider) {
  await pify((cb) =>
    provider.sendAsync(
      { id: 1, method: 'evm_mine', jsonrpc: '2.0', params: [] },
      cb,
    ),
  )();
}

/**
 * Fetches the latest block via the given block tracker.
 *
 * @param {BaseBlockTracker} blockTracker - The block tracker.
 * @returns {Promise<Block>} The promise for the block.
 */
async function newLatestBlock(blockTracker) {
  return await pify(blockTracker.once, { errorFirst: false }).call(
    blockTracker,
    'latest',
  );
}

/**
 * Fetches the latest block via the given block tracker.
 *
 * @param {BaseBlockTracker} blockTracker - The block tracker.
 * @returns {Promise<Block>} The promise for the block.
 */
async function nextBlockSeen(blockTracker) {
  return new Promise((resolve) => {
    blockTracker.once('latest', resolve);
  });
}
