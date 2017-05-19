
module.exports = createStatsMiddleware

function createStatsMiddleware(){
  return (req, res, next, end) => {
    const startTime = Date.now()
    next((done) => {
      const endTime = Date.now()
      const elapsed = startTime - endTime
      res.timeElapsed = elapsed
      done()
    })
  }
}
