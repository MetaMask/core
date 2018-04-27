const test = require('tape')
const SourcePollingBlockTracker = require('../src/polling')
const DistPollingBlockTracker = require('../dist/PollingBlockTracker')
const SourceBaseBlockTracker = require('../src/base')
const DistBaseBlockTracker = require('../dist/BaseBlockTracker')
const runBaseTests = require('./base')
const runPollingTests = require('./polling')

runBaseTests(test, 'source - BaseBlockTracker', SourceBaseBlockTracker)
runBaseTests(test, 'dist - BaseBlockTracker', DistBaseBlockTracker)

runPollingTests(test, 'source - PollingBlockTracker', SourcePollingBlockTracker)
runPollingTests(test, 'dist - PollingBlockTracker', DistPollingBlockTracker)
