const EthQuery = require('eth-query')
const EventEmitter = require('events')
const pify = require('pify')
const BaseBlockTracker = require('./base')
const timeout = (duration) => new Promise(resolve => setTimeout(resolve, duration))

const sec = 1000
const min = 60 * sec

class PollingBlockTracker extends BaseBlockTracker {

  constructor(opts = {}) {
    // parse + validate args
    if (!opts.provider) throw new Error('PollingBlockTracker - no provider specified.')
    const pollingInterval = opts.pollingInterval || 20 * sec
    // BaseBlockTracker constructor
    super(Object.assign({
      blockFreshnessDuration: pollingInterval,
    }, opts))
    // config
    this._provider = opts.provider
    this._pollingInterval = pollingInterval
    // util
    this._query = new EthQuery(this._provider)
  }

  //
  // private
  //

  async _fetchLatestBlock () {
    return await pify(this._query.getBlockByNumber).call(this._query, 'latest', false)
  }

  _start() {
    this._performSync().catch(err => this.emit('error', err))
  }

  async _performSync () {
    while (this._isRunning) {
      try {
        // fetch + set latest block
        const latestBlock = await this._fetchLatestBlock()
        this._newPotentialLatest(latestBlock)
      } catch (err) {
        this.emit('error', err)
      }
      await timeout(this._pollingInterval)
    }
  }

}

module.exports = PollingBlockTracker
