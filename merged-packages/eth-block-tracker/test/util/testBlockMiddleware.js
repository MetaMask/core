const incrementHexNumber = require('../../lib/hexUtils').incrementHexNumber

module.exports = class TestBlockMiddleware {

  constructor() {
    this._blockchain = {}
    this.setCurrentBlock(createBlock({ number: '0x01' }))
  }

  nextBlock() {
    const nextNumber = incrementHexNumber(this.currentBlock.number)
    this.setCurrentBlock(createBlock({ number: nextNumber }))
  }

  setCurrentBlock(blockParams) {
    const newBlock = createBlock(blockParams)
    this.currentBlock = newBlock
    this._blockchain[newBlock.number] = newBlock
  }
  
  createMiddleware() {
    return (req, res, next, end) => {
      if (req.method !== 'eth_getBlockByNumber') return next()
      const blockRef = req.params[0]
      if (blockRef === 'latest') {
        res.result = this.currentBlock
      } else {
        res.result = this._blockchain[blockRef]
      }
      end()
    }
  }

}

function createBlock(blockParams){
  const hash = '0x'+Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)
  return Object.assign({
    hash: hash,
    difficulty: '0x2892ddca',
    extraData: '0xd983010507846765746887676f312e372e348777696e646f7773',
    gasLimit: '0x47e7c4',
    gasUsed: '0x6384',
    logsBloom: '0x00000000000000000000000000000000000000000000000000000000000020000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000',
    miner: '0x01711853335f857442ef6f349b2467c531731318',
    mixHash: '0xf0d9bec999600eec92e8e4da8fc1182e357468c9ed2f849aa17e0e900412b352',
    nonce: '0xd556d5a5504198e4',
    number: '0x72ac8',
    parentHash: '0xf5239c3ce1085194521435a5052494c02bbb1002b019684dcf368490ea6208e5',
    receiptsRoot: '0x78c6f8236094b392bcc43b47b0dc1ce93ecd2875bfb5e4e4c3431e5af698ff99',
    sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    size: '0x2ad',
    stateRoot: '0x0554f145c481df2fa02ecd2da17071672740c3aa948c896f1465e6772f741ac6',
    timestamp: '0x58955844',
    totalDifficulty: '0x751d0dfa03c1',
    transactionsRoot: '0xb090c32d840dec1e9752719f21bbae4a73e58333aecb89bc3b8ed559fb2712a3',
    transactions: [],
    uncles: [],
  }, blockParams)
}