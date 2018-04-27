### 4.0.0

Significant rewrite of `eth-block-tracker`. Primary reason was optimizing network IO.

BlockTrackers no longer have manual stop/start methods, they now automatically start and stop based on listener count for the `latest` and `sync` events. You can force a stop by calling the `EventEmitter` method `removeAllListeners`.

Transaction bodies have been removed from blocks. Blocks contain transaction hashes.

Block walking behavior has been removed. We now just use the block returned for the "latest" parameter.
Along with this the `block` event has been removed, please use `latest` or `sync`.

- added isRunning
- added `error` event
- renamed awaitCurrentBlock -> getLatestBlock
- removed tx body from block
- removed getTrackingBlock
- removed start/stop
- removed `block` event
- removed test/util/testBlockMiddleware


### 3.0.0

- npm module main now exports unprocessed source
- module includes dist:
  - bundle: `dist/EthBlockTracker.js`
  - es5 source: `dist/es5/`
- fixes `awaitCurrentBlock` return value
- `lib` renamed to `src`
- `eth-block-tracker` is now a normal `EventEmitter`, does not provide a callback to event handlers
