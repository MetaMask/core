import BlockHistoryController, { BlockHistoryState } from './BlockHistoryController';

import { EventEmitter } from 'events';
import { stub } from 'sinon';

const BlockTracker = require('eth-block-tracker');
const HttpProvider = require('ethjs-provider-http');

const TEST_BLOCK_NUMBER = 3394900;
const PROVIDER = new HttpProvider('https://ropsten.infura.io');

describe('BlockHistoryController', () => {
	it('should set default state', () => {
		const controller = new BlockHistoryController();
		expect(controller.state).toEqual({ recentBlocks: [] });
	});

	it('should set default config', () => {
		const controller = new BlockHistoryController();
		expect(controller.config).toEqual({
			blockDepth: 40,
			blockTracker: undefined,
			provider: undefined
		});
	});

	it('should add new block to recentBlocks state', () => {
		return new Promise((resolve) => {
			const blockTracker = new BlockTracker({ provider: PROVIDER });
			const controller = new BlockHistoryController(undefined, { blockTracker, provider: PROVIDER });
			controller.subscribe((state) => {
				setTimeout(() => {
					blockTracker.emit('block', { number: 1337, transactions: [] });
					const [block] = controller.state.recentBlocks.slice(-1);
					expect(block.number).toEqual(1337);
					resolve();
				});
			});
			blockTracker.emit('block', { number: TEST_BLOCK_NUMBER.toString(16) });
		});
	});

	it('should backfill correct number of blocks', () => {
		return new Promise((resolve) => {
			const blockTracker = new BlockTracker({ provider: PROVIDER });
			const controller = new BlockHistoryController(undefined, {
				blockDepth: 50,
				blockTracker,
				provider: PROVIDER
			});
			controller.subscribe((state) => {
				expect(state.recentBlocks.length).toBe(50);
				resolve();
			});
			blockTracker.emit('block', { number: TEST_BLOCK_NUMBER.toString(16) });
		});
	});

	it('should splice recent blocks if new depth is less than old depth', () => {
		return new Promise((resolve) => {
			const blockTracker = new BlockTracker({ provider: PROVIDER });
			const controller = new BlockHistoryController(undefined, {
				blockDepth: 50,
				blockTracker,
				provider: PROVIDER
			});
			function onChange(state: BlockHistoryState) {
				controller.unsubscribe(onChange);
				expect(state.recentBlocks.length).toBe(50);
				controller.blockDepth = 25;
				setTimeout(() => {
					expect(controller.state.recentBlocks.length).toBe(25);
					resolve();
				});
			}
			controller.subscribe(onChange);
			blockTracker.emit('block', { number: TEST_BLOCK_NUMBER.toString(16) });
		});
	});

	it('should remove old block tracker listeners', () => {
		const mockBlockTracker = new EventEmitter();
		mockBlockTracker.removeAllListeners = stub();
		const controller = new BlockHistoryController(undefined, { blockTracker: mockBlockTracker });
		controller.blockTracker = new EventEmitter();
		expect((mockBlockTracker.removeAllListeners as any).called).toBe(true);
	});
});
