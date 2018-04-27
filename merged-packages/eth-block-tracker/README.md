
# eth-block-tracker

This module walks the Ethereum blockchain, keeping track of the latest block.
It uses a web3 provider as a data source and will continuously poll for the next block.

```js
const HttpProvider = require('ethjs-provider-http')
const PollingBlockTracker = require('eth-block-tracker')

const provider = new HttpProvider('https://mainnet.infura.io')
const blockTracker = new PollingBlockTracker({ provider })
blockTracker.on('latest', console.log)
```

### methods

##### new PollingBlockTracker({ provider, pollingInterval })

creates a new block tracker with `provider` as a data source and
`pollingInterval` (ms) timeout between polling for the latest block.

##### getCurrentBlock()

synchronous returns the current block. may be `null`.

```js
console.log(blockTracker.getCurrentBlock())
```

##### async getLatestBlock()

Asynchronously returns the latest block.
if not immediately available, it will fetch one.


### EVENTS

##### latest

The `latest` event is emitted for whenever a new latest block is detected.
This may mean skipping blocks if there were two created since the last polling period.

```js
blockTracker.on('latest', (newBlock) => console.log(newBlock))
```

##### sync

The `sync` event is emitted the same as "latest" but includes the previous block.

```js
blockTracker.on('sync', ({ newBlock, oldBlock }) => console.log(newBlock, oldBlock))
```

### NOTES

Version 4.x.x differs significantly from version 3.x.x

Please see the [CHANGELOG](./CHANGELOG.md).
