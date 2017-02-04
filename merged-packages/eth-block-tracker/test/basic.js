const test = require('tape')
const RpcBlockTracker = require('../index')

test('basic tests - constructor', (t) => {

  try {
    const provider = {}
    const blockTracker = new RpcBlockTracker({ provider })
    blockTracker._performSync()
    .then(() => {
      console.log('done.')
    })
    .catch((err) => {
      console.error('died:',err) 
    })
  } catch (err) {
    console.error('died:',err)
  }

})