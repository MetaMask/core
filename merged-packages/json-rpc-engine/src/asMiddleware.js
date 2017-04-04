module.exports = asMiddleware

function asMiddleware (engine) {
  return function engineAsMiddleware(req, res, next, end){
    engine._runMiddleware(req, res, function(err, isComplete){
      if (err) return end(err)
      if (isComplete) {
        end()
      } else {
        next()
      }
    })
  }
}