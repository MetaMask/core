# `@metamask/eth-block-tracker`

This module walks the Ethereum blockchain, keeping track of the latest block. It uses a web3 provider as a data source and will continuously poll for the next block.

## Installation

`yarn add @metamask/eth-block-tracker`

or

`npm install @metamask/eth-block-tracker`

## Usage

```js
const createInfuraProvider = require('@metamask/eth-json-rpc-infura');
const { PollingBlockTracker } = require('@metamask/eth-block-tracker');

const provider = createInfuraProvider({
  network: 'mainnet',
  projectId: process.env.INFURA_PROJECT_ID,
});
const blockTracker = new PollingBlockTracker({ provider });

blockTracker.on('sync', ({ newBlock, oldBlock }) => {
  if (oldBlock) {
    console.log(`sync #${Number(oldBlock)} -> #${Number(newBlock)}`);
  } else {
    console.log(`first sync #${Number(newBlock)}`);
  }
});
```

## API

### Methods

#### new PollingBlockTracker({ provider, pollingInterval, retryTimeout, keepEventLoopActive, usePastBlocks })

- Creates a new block tracker with `provider` as a data source and `pollingInterval` (ms) timeout between polling for the latest block.
- If an error is encountered when fetching blocks, it will wait `retryTimeout` (ms) before attempting again.
- If `keepEventLoopActive` is `false`, in Node.js it will [unref the polling timeout](https://nodejs.org/api/timers.html#timers_timeout_unref), allowing the process to exit during the polling interval. Defaults to `true`, meaning the process will be kept alive.
- If `usePastBlocks` is `true`, block numbers less than the current block number can used and emitted. Defaults to `false`, meaning that only block numbers greater than the current block number will be used and emitted.

#### getCurrentBlock()

Synchronously returns the current block. May be `null`.

```js
console.log(blockTracker.getCurrentBlock());
```

#### async getLatestBlock()

Asynchronously returns the latest block. if not immediately available, it will fetch one.

#### async checkForLatestBlock()

Tells the block tracker to ask for a new block immediately, in addition to its normal polling interval. Useful if you received a hint of a new block (e.g. via `tx.blockNumber` from `getTransactionByHash`). Will resolve to the new latest block when done polling.

### Events

#### latest

The `latest` event is emitted for whenever a new latest block is detected. This may mean skipping blocks if there were two created since the last polling period.

```js
blockTracker.on('latest', (newBlock) => console.log(newBlock));
```

#### sync

The `sync` event is emitted the same as "latest" but includes the previous block.

```js
blockTracker.on('sync', ({ newBlock, oldBlock }) =>
  console.log(newBlock, oldBlock),
);
```

#### error

The `error` event means an error occurred while polling for the latest block.

```js
blockTracker.on('error', (err) => console.error(err));
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
