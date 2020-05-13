const SafeEventEmitter = require('safe-event-emitter')
const { Duplex: DuplexStream } = require('readable-stream')

module.exports = function createStreamMiddleware () {
  const idMap = {}
  const stream = new DuplexStream({
    objectMode: true,
    read: readNoop,
    write: processMessage,
  })

  const events = new SafeEventEmitter()

  const middleware = (req, res, next, end) => {
    // write req to stream
    stream.push(req)
    // register request on id map
    idMap[req.id] = { req, res, next, end }
  }

  return { events, middleware, stream }

  function readNoop () {
    return false
  }

  function processMessage (res, _encoding, cb) {
    let err
    try {
      const isNotification = !res.id
      if (isNotification) {
        processNotification(res)
      } else {
        processResponse(res)
      }
    } catch (_err) {
      err = _err
    }
    // continue processing stream
    cb(err)
  }

  function processResponse (res) {
    const context = idMap[res.id]
    if (!context) {
      throw new Error(`StreamMiddleware - Unknown response id ${res.id}`)
    }
    delete idMap[res.id]
    // copy whole res onto original res
    Object.assign(context.res, res)
    // run callback on empty stack,
    // prevent internal stream-handler from catching errors
    setTimeout(context.end)
  }

  function processNotification (res) {
    events.emit('notification', res)
  }
}
