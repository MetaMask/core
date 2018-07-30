import BaseController, { BaseConfig, BaseState } from './BaseController';

const BN = require('ethereumjs-util').BN;
const EthQuery = require('eth-query');

/**
 * @type Block
 *
 * Standard block object returned from an EthQuery instance
 *
 * @property difficulty - Integer of the difficulty for this block
 * @property extraData - "Extra data" field of this block
 * @property gasLimit - Maximum gas allowed in this block
 * @property gasPrices - Array of gas prices for every transaction in this block
 * @property gasUsed - Total used gas by all transactions in this block
 * @property hash - Hash of the block null when its pending block
 * @property logsBloom - Bloom filter for the logs of the block null when its pending block
 * @property miner - Address of the beneficiary to whom the mining rewards were given
 * @property nonce - Hash of the generated proof-of-work null when its pending block
 * @property number - Block number null when its pending block
 * @property parentHash - Hash of the parent block
 * @property receiptsRoot - Root of the receipts trie of the block
 * @property sha3Uncles - SHA3 of the uncles data in the block
 * @property size - Integer the size of this block in bytes
 * @property stateRoot - Root of the final state trie of the block
 * @property timestamp - Unix timestamp for when the block was collated
 * @property totalDifficulty - Integer of the total difficulty of the chain until this block
 * @property transactions - Array of transaction objects, or 32 Bytes tx hashes depending on the last given param
 * @property transactionsRoot - Root of the transaction trie of the block
 * @property uncles - Array of uncle hashes
 */
export interface Block {
	difficulty: string;
	extraData: string;
	gasLimit: string;
	gasPrices: number[];
	gasUsed: string;
	hash: string;
	logsBloom: string;
	miner: string;
	nonce: string;
	number: string;
	parentHash: string;
	sha3Uncles: string;
	size: string;
	stateRoot: string;
	timestamp: string;
	totalDifficulty: string;
	transactions: string[];
	transactionsRoot: string;
	uncles: string[];
}

/**
 * @type BlockHistoryConfig
 *
 * Block history controller configuration
 *
 * @property blockDepth - Number of past blocks to maintain
 * @property blockTracker - Contains methods for tracking blocks and querying the blockchain
 * @property provider - Provider used to create a new underlying EthQuery instance
 */
export interface BlockHistoryConfig extends BaseConfig {
	blockDepth: number;
	blockTracker: any;
	provider: any;
}

/**
 * @type BlockHistoryState
 *
 * Block history controller state
 *
 * @property recentBlocks - List of recent blocks
 */
export interface BlockHistoryState extends BaseState {
	recentBlocks: Block[];
}

/**
 * Controller responsible for maintaining a set number of past blocks
 */
export class BlockHistoryController extends BaseController<BlockHistoryState, BlockHistoryConfig> {
	private backfilled = false;
	private ethQuery: any;
	private internalBlockDepth = 0;
	private internalBlockTracker: any;

	private backfill() {
		this.internalBlockTracker &&
			this.internalBlockTracker.once('block', async (block: Block) => {
				const currentBlockNumber = Number.parseInt(block.number, 16);
				const blocksToFetch = Math.min(currentBlockNumber, this.internalBlockDepth);
				const blockNumbers = Array(blocksToFetch)
					.fill(null)
					.map((_: Block) => currentBlockNumber - 1);
				const newBlocks = await Promise.all(
					blockNumbers.map((blockNumber: number) => this.getBlockByNumber(blockNumber))
				);
				const filledBlocks = newBlocks.filter((newBlock) => newBlock);
				filledBlocks.sort((a, b) => (a.number < b.number ? /* istanbul ignore next */ -1 : 1));
				const recentBlocks = filledBlocks.map((filledBlock) => this.mapGasPrices(filledBlock));
				recentBlocks.forEach((pricedBlock) => {
					delete pricedBlock.transactions;
				});
				this.update({ recentBlocks });
				this.backfilled = true;
			});
	}

	private getBlockByNumber(blockNumber: number): Promise<Block> {
		const bigBlockNumber = new BN(blockNumber);
		return new Promise((resolve, reject) => {
			this.ethQuery.getBlockByNumber(`0x${bigBlockNumber.toString(16)}`, true, (error: Error, block: Block) => {
				/* istanbul ignore next */
				if (error) {
					reject(error);
					return;
				}
				resolve(block);
			});
		});
	}

	private mapGasPrices(block: Block) {
		return { ...block, ...{ gasPrices: block.transactions.map((tx: any) => tx.gasPrice) } };
	}

	private onBlock(block: Block) {
		const { recentBlocks } = this.state;
		if (!this.backfilled) {
			return;
		}
		block = this.mapGasPrices(block);
		recentBlocks.push(block);
		while (recentBlocks.length > this.internalBlockDepth) {
			recentBlocks.shift();
		}
		this.update({ recentBlocks });
	}

	/**
	 * Creates a BlockHistoryController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<BlockHistoryState>, config?: Partial<BlockHistoryConfig>) {
		super(state, config);
		this.defaultState = { recentBlocks: [] };
		this.defaultConfig = {
			blockDepth: 40,
			blockTracker: undefined,
			provider: undefined
		};
		this.initialize();
		this.backfill();
	}

	/**
	 * Sets a new BlockTracker instance
	 *
	 * @param blockDepth - Number of past blocks to maintain
	 */
	set blockDepth(blockDepth: number) {
		let { recentBlocks } = this.state;
		this.internalBlockDepth = blockDepth;
		if (recentBlocks.length > blockDepth) {
			recentBlocks = recentBlocks.slice(0, blockDepth);
			this.update({ recentBlocks });
		}
	}

	/**
	 * Sets a new BlockTracker instance
	 *
	 * @param blockTracker - Contains methods for tracking blocks and querying the blockchain
	 */
	set blockTracker(blockTracker: any) {
		this.internalBlockTracker && this.internalBlockTracker.removeAllListeners();
		this.internalBlockTracker = blockTracker;
		this.internalBlockTracker.on('block', this.onBlock.bind(this));
		!this.backfilled && this.backfill();
	}

	/**
	 * Sets a new provider
	 *
	 * @param provider - Provider used to create a new underlying EthQuery instance
	 */
	set provider(provider: any) {
		this.ethQuery = new EthQuery(provider);
	}
}

export default BlockHistoryController;
