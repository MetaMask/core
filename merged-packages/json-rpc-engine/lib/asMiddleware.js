module.exports = asMiddleware

function asMiddleware (engine) {
  return function engineAsMiddleware(req, res, next, end){
    engine.handle(req, function(err, engineRes){
      if (err) return end(err)
      // copy engine result onto response
      res.result = engineRes.result
      end()
    })
  }
}