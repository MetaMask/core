
ethjs-query
new BlockTracker({ provider })







//
// public
//

getCurrentBlock()
start()
stop()

### EVENTS
block <-- every block in order
fork  <-- common root of fork
force <-- latest block was forced
latest  <-- the latest block, possibly skipping blocks

//
// private
//

async _performSync() {
  const latestBlock = await this._fetchLatestBlock()
  return this._considerBlock(latestBlock)
}

async _considerBlock(newBlock) {
  const currentBlock = this.getCurrentBlock()
  // check if new block should be head
  if (!difficultyLessThan(currentBlock, newBlock)) {
    return Promise.resolve()
  }
  const blockPath = await _fetchPathBetweenBlocks(currentBlock, newBlock) 
}

_fetchPathBetweenBlocks (startBlock, endBlock) {
  // walk from end to start
}

_fetchLatestBlock

_fetchBlockByHash

_fetchBlockByTag

poll latest,
walk back to current block,
abort if too far?
ignore if 'latest' if less difficulty
