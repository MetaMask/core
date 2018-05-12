const test = require('tape')
const JsonRpcEngine = require('json-rpc-engine')
const BlockTracker = require('eth-block-tracker')
const EthQuery = require('ethjs-query')
const GanacheCore = require('ganache-core')
const pify = require('pify')
// const providerAsMiddleware = require('../providerAsMiddleware')
const providerFromEngine = require('../providerFromEngine')
// const createScaffoldMiddleware = require('../scaffold')
const createWalletMiddleware = require('../wallet')

//
// accounts
//

accountsTest({
  testLabel: 'no accounts',
  accounts: [],
})

accountsTest({
  testLabel: 'one account',
  accounts: ['0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb'],
})

accountsTest({
  testLabel: 'two account',
  accounts: ['0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb', '0x1234362ef32bcd26d3dd18ca749378213625ba0b'],
})

//
// message signature
//

ecRecoverTest({
  testLabel: 'geth kumavis manual I recover',
  // "hello world"
  message: '0x68656c6c6f20776f726c64',
  signature: '0xce909e8ea6851bc36c007a0072d0524b07a3ff8d4e623aca4c71ca8e57250c4d0a3fc38fa8fbaaa81ead4b9f6bd03356b6f8bf18bccad167d78891636e1d69561b',
  addressHex: '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
})

ecRecoverTest({
  testLabel: 'geth kumavis manual II recover',
  // message from parity's test - note result is different than what they are testing against
  // https://github.com/ethcore/parity/blob/5369a129ae276d38f3490abb18c5093b338246e0/rpc/src/v1/tests/mocked/eth.rs#L301-L317
  message: '0x0cc175b9c0f1b6a831c399e26977266192eb5ffee6ae2fec3ad71c777531578f',
  signature: '0x9ff8350cc7354b80740a3580d0e0fd4f1f02062040bc06b893d70906f8728bb5163837fd376bf77ce03b55e9bd092b32af60e86abce48f7b8d3539988ee5a9be1c',
  addressHex: '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
})

// test util

function accountsTest({ testLabel, accounts }) {
  const { engine, query, ganacheQuery } = createTestSetup()

  const getAccounts = async () => accounts.slice()
  engine.push(createWalletMiddleware({ getAccounts }))

  test(testLabel, async (t) => {
    t.plan(2)

    try {
      const accountsResult = await query.accounts()
      t.deepEqual(accountsResult, accounts, 'returned all provided accounts')
      const coinbaseResult = await query.coinbase()
      if (accounts.length) {
        t.equal(coinbaseResult, accounts[0], 'returned first from provided accounts')
      } else {
        t.equal(coinbaseResult, null, 'returned null because of empty provided accounts')
      }
    } catch (err) {
      t.ifError(err)
    }
  })
}


function ecRecoverTest({ testLabel, addressHex, message, signature }) {
  const { engine, ganacheQuery } = createTestSetup()

  // setup wallet middleware
  const getAccounts = ganacheQuery.accounts.bind(ganacheQuery)
  engine.push(createWalletMiddleware({ getAccounts }))

  const payload = {
    id: 1,
    method: 'personal_ecRecover',
    params: [message, signature],
  }

  singleRpcTest({ testLabel, engine, payload, expectedResult: addressHex })
}

function singleRpcTest({ testLabel, payload, expectedResult, engine }) {
  test(testLabel, async (t) => {
    t.plan(2)

    try {
      const response = await pify(engine.handle).call(engine, payload)
      t.ok(response, 'has response')
      t.equal(response.result, expectedResult, 'rpc result is as expected')
    } catch (err) {
      t.ifError(err)
    }

    t.end()
  })
}


// util

function createTestSetup () {
  // raw data source
  const ganacheProvider = GanacheCore.provider()
  // create higher level
  const engine = new JsonRpcEngine()
  const provider = providerFromEngine(engine)
  const query = new EthQuery(provider)
  const ganacheQuery = new EthQuery(ganacheProvider)

  return { engine, provider, ganacheProvider, query, ganacheQuery }
}
