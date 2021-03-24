const test = require('tape');

const {
  BaseBlockTracker,
  PollingBlockTracker,
  SubscribeBlockTracker,
} = require('../dist');

const runBaseTests = require('./base');
const runPollingTests = require('./polling');
const runSubscribeTests = require('./subscribe');

runBaseTests(test, 'BaseBlockTracker', BaseBlockTracker);
runPollingTests(test, 'PollingBlockTracker', PollingBlockTracker);
runSubscribeTests(test, 'SubscribeBlockTracker', SubscribeBlockTracker);
