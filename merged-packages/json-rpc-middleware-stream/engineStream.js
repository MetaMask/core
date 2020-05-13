const { Duplex: DuplexStream } = require('readable-stream')

module.exports = function createEngineStream ({ engine }) {

  if (!engine) {
    throw new Error('Missing engine parameter!')
  }

  const stream = new DuplexStream({ objectMode: true, read, write })
  // forward notifications
  if (engine.on) {
    engine.on('notification', (message) => {
      stream.push(message)
    })
  }
  return stream

  function read () {
    return false
  }

  function write (req, _encoding, cb) {
    engine.handle(req, (_err, res) => {
      this.push(res)
    })
    cb()
  }
}
