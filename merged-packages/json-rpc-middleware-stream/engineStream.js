const DuplexStream = require('readable-stream').Duplex

module.exports = createEngineStream

function createEngineStream({ engine }) {
  if (!engine) throw new Error('Missing engine parameter!')

  return new DuplexStream({ objectMode: true, read, write })

  function read () {
    return false
  }
  function write (req, encoding, cb) {
    engine.handle(req, (err, res) => {
      this.push(res)
    })
    cb()
  }
}