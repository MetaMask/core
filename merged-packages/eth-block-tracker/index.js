const EthQuery = require('ethjs-query')

class RpcBlockTracker {

  constructor(opts = {}) {
    if (!opts.provider) throw new Error('RpcBlockTracker - no provider specified.')
    this._query = new EthQuery(opts.provider)
  }

  //
  // private
  //

  async _performSync() {
    const latestBlock = await this._fetchLatestBlock()
    return this._considerBlock(latestBlock)
  }

  async _considerBlock(newBlock) {
    const currentBlock = this.getCurrentBlock()
    // if no current block, just accept it
    if (!currentBlock) {
      currentBlock = newBlock
      this.emit('block', newBlock)
      this.emit('latest', newBlock)
      return
    }
    // check if new block should be head
    if (!difficultyLessThan(currentBlock, newBlock)) {
      return Promise.resolve()
    }
    // fetch all blocks inbetween
    const blockPath = await this._fetchPathBetweenBlocks(currentBlock, newBlock)
    this.currentBlock = newBlock
    blockPath.forEach((block) => this.emit('block', block))
    this.emit('latest', newBlock)
  }

  async _fetchPathBetweenBlocks (lowBlock, highBlock) {
    // walk from highBlock to lowBlock
    let blockPath = [highBlock]
    let trackingBlock = highBlock
    while (numberGreaterThan(trackingBlock, lowBlock)) {
      const nextBlock = await this._query.getBlockByHash(trackingBlock.parentHash)
      blockPath.push(nextBlock)
      trackingBlock = nextBlock
    }
    return blockPath
  }

  _fetchLatestBlock () {
    return this._query.getBlockByNumber(latest, false)
  }

}

function difficultyLessThan(blockA, blockB) {
  return parseInt(blockA.difficulty, 16) < parseInt(blockB.number, 16)
}

function numberGreaterThan(blockA, blockB) {
  return parseInt(blockA.number, 16) > parseInt(blockB.number, 16)
}

module.exports = RpcBlockTracker

   // ├─ difficulty: 0x2892ddca
   // ├─ extraData: 0xd983010507846765746887676f312e372e348777696e646f7773
   // ├─ gasLimit: 0x47e7c4
   // ├─ gasUsed: 0x6384
   // ├─ hash: 0xf60903687b1559b9c80f2d935b4c4f468ad95c3076928c432ec34f2ef3d4eec9
   // ├─ logsBloom: 0x00000000000000000000000000000000000000000000000000000000000020000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000
   // ├─ miner: 0x01711853335f857442ef6f349b2467c531731318
   // ├─ mixHash: 0xf0d9bec999600eec92e8e4da8fc1182e357468c9ed2f849aa17e0e900412b352
   // ├─ nonce: 0xd556d5a5504198e4
   // ├─ number: 0x72ac8
   // ├─ parentHash: 0xf5239c3ce1085194521435a5052494c02bbb1002b019684dcf368490ea6208e5
   // ├─ receiptsRoot: 0x78c6f8236094b392bcc43b47b0dc1ce93ecd2875bfb5e4e4c3431e5af698ff99
   // ├─ sha3Uncles: 0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347
   // ├─ size: 0x2ad
   // ├─ stateRoot: 0x0554f145c481df2fa02ecd2da17071672740c3aa948c896f1465e6772f741ac6
   // ├─ timestamp: 0x58955844
   // ├─ totalDifficulty: 0x751d0dfa03c1
   // ├─ transactions
   // │  └─ 0
   // │     ├─ blockHash: 0xf60903687b1559b9c80f2d935b4c4f468ad95c3076928c432ec34f2ef3d4eec9
   // │     ├─ blockNumber: 0x72ac8
   // │     ├─ from: 0x201354729f8d0f8b64e9a0c353c672c6a66b3857
   // │     ├─ gas: 0x15f90
   // │     ├─ gasPrice: 0x4a817c800
   // │     ├─ hash: 0xd5a15d7c2449150db4f74f42a6ca0702150a24c46c5b406a7e1b3e44908ef44d
   // │     ├─ input: 0xe1fa8e849bc10d87fb03c6b0603b05a3e29043c7e0b7c927119576a4bec457e96c7d7cde
   // │     ├─ nonce: 0x323e
   // │     ├─ to: 0xd10e3be2bc8f959bc8c41cf65f60de721cf89adf
   // │     ├─ transactionIndex: 0x0
   // │     ├─ value: 0x0
   // │     ├─ v: 0x29
   // │     ├─ r: 0xf35f8ab241e6bb3ccaffd21b268dbfc7fcb5df1c1fb83ee5306207e4a1a3e954
   // │     └─ s: 0x1610cdac2782c91065fd43584cd8974f7f3b4e6d46a2aafe7b101788285bf3f2
   // ├─ transactionsRoot: 0xb090c32d840dec1e9752719f21bbae4a73e58333aecb89bc3b8ed559fb2712a3
   // └─ uncles