const test = require('tape')
const SourceBlockTracker = require('../lib/index')
const DistBlockTracker = require('../dist/EthBlockTracker')
const runTests = require('./run')

runTests(test, 'source', SourceBlockTracker)
runTests(test, 'dist', DistBlockTracker)
