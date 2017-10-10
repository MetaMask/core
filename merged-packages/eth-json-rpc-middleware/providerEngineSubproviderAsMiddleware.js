const EthQuery = require('eth-query')

// this is a really minimal shim
// doesnt handle block tracking
// sorry

function providerEngineSubproviderAsMiddle({ subprovider, provider }) {
  const ethQuery = new EthQuery(provider)
  // set engine
  subprovider.engine = provider
  // ethQuery fills in omitted params like id
  subprovider.emitPayload = ethQuery.sendAsync.bind(ethQuery)

  // create middleware
  return (req, res, next, end) => {
    // send request to subprovider
    subprovider.handleRequest(req, subproviderNext, subproviderEnd)
    // adapter for next handler
    function subproviderNext(nextHandler) {
      next((done) => {
        nextHandler(res.error, res.result, done)
      })
    }
    // adapter for end handler
    function subproviderEnd(err, result) {
      if (err) return end(err)
      if (result)
      res.result = result
      end()
    }
  }
}