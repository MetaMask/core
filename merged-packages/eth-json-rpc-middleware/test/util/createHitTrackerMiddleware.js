
module.exports = createHitTrackerMiddleware

function createHitTrackerMiddleware() {
  const hitTracker = {}
  const middleware = (req, res, next, end) => {
    // mark hit for method
    console.log(`recording hit for "${req.method}"`)
    const hitsForMethod = hitTracker[req.method] || []
    hitsForMethod.push(req)
    hitTracker[req.method] = hitsForMethod
    // continue
    next()
  }
  middleware.getHits = (method) => hitTracker[method] || []
  return middleware
}
