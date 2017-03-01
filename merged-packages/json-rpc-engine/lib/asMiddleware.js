module.exports = asMiddleware

function asMiddleware (engine) {
  return function engineAsMiddleware(req, res, next, end){
    engine.handle(req, function(err, engineRes){
      if (err) return end(err)
      // copy engine result onto response
      Object.assign(res, engineRes)
      end()
    })
  }
}