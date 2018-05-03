const test = require('tape')
const GanacheCore = require('ganache-core')
const pify = require('pify')
const PollingBlockTracker = require('../src/polling')
const noop = () => {}

module.exports = (test, testLabel, PollingBlockTracker) => {

  test(`${testLabel} - latest`, async (t) => {
    const provider = GanacheCore.provider()
    const blockTracker = new PollingBlockTracker({
      provider,
      pollingInterval: 100,
    })

    try {
      t.equal(blockTracker.isRunning(), false, 'PollingBlockTracker should begin stopped')

      const blocks = []
      blockTracker.on('latest', (block) => blocks.push(block))
      t.equal(blockTracker.isRunning(), true, 'PollingBlockTracker should start after listener is added')
      t.equal(blocks.length, 0, 'no blocks so far')

      await newLatestBlock(blockTracker)
      t.equal(blocks.length, 1, 'saw 1st block')

      await triggerNextBlock(provider)
      await newLatestBlock(blockTracker)
      t.equal(blocks.length, 2, 'saw 2nd block')

      await triggerNextBlock(provider)
      await triggerNextBlock(provider)
      await triggerNextBlock(provider)
      const lastBlock = await newLatestBlock(blockTracker)
      t.equal(blocks.length, 3, 'saw only 5th block')
      t.equal(Number.parseInt(lastBlock, 16), 4, 'saw correct block, with number 4')

      blockTracker.removeAllListeners()
      t.equal(blockTracker.isRunning(), false, 'PollingBlockTracker stops after all listeners are removed')


    } catch (err) {
      t.ifError(err)
    }

    // cleanup
    blockTracker.removeAllListeners()
    t.end()
  })

}

async function triggerNextBlock(provider) {
  await pify((cb) => provider.sendAsync({ id: 1, method: 'evm_mine', jsonrpc: '2.0', params: [] }, cb))()
}

async function newLatestBlock(blockTracker) {
  return await pify(blockTracker.once, { errorFirst: false }).call(blockTracker, 'latest')
}
