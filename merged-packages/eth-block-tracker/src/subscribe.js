const createRandomId = require('json-rpc-random-id')()
const BaseBlockTracker = require('./base')

class SubscribeBlockTracker extends BaseBlockTracker {

  constructor (opts = {}) {
    // parse + validate args
    if (!opts.provider) {
      throw new Error('SubscribeBlockTracker - no provider specified.')
    }
    // BaseBlockTracker constructor
    super(opts)
    // config
    this._provider = opts.provider
  }

  //
  // public
  //

  async checkForLatestBlock () {
    return await this.getLatestBlock()
  }

  //
  // private
  //

  async _start () {
    if (this._subscriptionId === undefined || this._subscriptionId === null) {
      try {
        const blockNumber = await this._call('eth_blockNumber')
        this._subscriptionId = await this._call('eth_subscribe', 'newHeads', {})
        this._provider.on('data', this._handleSubData.bind(this))
        this._newPotentialLatest(blockNumber)
      } catch (e) {
        this.emit('error', e)
      }
    }
  }

  async _end () {
    if (this._subscriptionId !== null && this._subscriptionId !== undefined) {
      try {
        await this._call('eth_unsubscribe', this._subscriptionId)
        delete this._subscriptionId
      } catch (e) {
        this.emit('error', e)
      }
    }
  }

  _call (method, ...params) {
    return new Promise((resolve, reject) => {
      this._provider.sendAsync({
        id: createRandomId(), method, params, jsonrpc: '2.0',
      }, (err, res) => {
        if (err) {
          reject(err)
        } else {
          resolve(res.result)
        }
      })
    })
  }

  _handleSubData (_, data) {
    if (data.method === 'eth_subscription' && data.params.subscription === this._subscriptionId) {
      this._newPotentialLatest(data.params.result.number)
    }
  }
}

module.exports = SubscribeBlockTracker
