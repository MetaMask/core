const EthQuery = require('eth-query')
const createVm = require('ethereumjs-vm/lib/hooked').fromWeb3Provider
const blockFromRpc = require('ethereumjs-block/from-rpc')

function createVmMiddleware({ provider }){
  const ethQuery = new EthQuery(provider)

  return scaffold({
    eth_call: (req, res, next, end) => {
      const [txParams, blockRef] = req.params
      ethQuery.getBlockByNumber(blockRef, (err, blockParams) => {
        if (err) return cb(err)
        // create block
        const block = blockFromRpc(blockParams)
        runVm(req, block, (err, results)  => {
          if (err) return cb(err)
          const returnValue = results.vm.return ? '0x' + results.vm.return.toString('hex') : '0x'
          res.result = returnValue
          end()
        })
      })
    },
  })

  function runVm(req, block, cb){

    // create vm with state lookup intercepted
    const blockRef = block.number.toNumber()
    const vm = createVm(provider, blockRef, {
      enableHomestead: true
    })

    // create tx
    const tx = new FakeTransaction(txParams)

    vm.runTx({
      tx: tx,
      block: block,
      skipNonce: true,
      skipBalance: true
    }, function(err, results) {
      if (err) return cb(err)
      if (results.error) {
        return cb(new Error("VM error: " + results.error))
      }
      if (results.vm && results.vm.exception !== 1) {
        return cb(new Error("VM Exception while executing " + req.method + ": " + results.vm.exceptionError))
      }

      cb(null, results)
    })

  }
}

