import BlockHistoryController from './BlockHistoryController';

import { EventEmitter } from 'events';
import { stub } from 'sinon';

const BlockTracker = require('eth-block-tracker');
const HttpProvider = require('ethjs-provider-http');

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

	it('should not update state if not backfilled', () => {
		return new Promise((resolve) => {
			const blockTracker = new BlockTracker({ provider: PROVIDER });
			const controller = new BlockHistoryController({ blockTracker });
			blockTracker.emit('block', { number: 1337, transactions: [] });
			expect(controller.state.recentBlocks).toEqual([]);
			resolve();
		});
	});

	it('should add new block to recentBlocks state', () => {
		return new Promise((resolve) => {
			const blockTracker = new BlockTracker({ provider: PROVIDER });
			const controller = new BlockHistoryController({ blockTracker, provider: PROVIDER });
			controller.subscribe(() => {
				setTimeout(() => {
					blockTracker.emit('block', { number: 1337, transactions: [] });
					const [block] = controller.state.recentBlocks.slice(-1);
					expect(block.number).toEqual(1337);
					resolve();
				});
			});
		});
	});

	it('should backfill correct number of blocks', () => {
		return new Promise((resolve) => {
			const blockTracker = new BlockTracker({ provider: PROVIDER });
			const controller = new BlockHistoryController({
				blockDepth: 50,
				blockTracker,
				provider: PROVIDER
			});
			controller.subscribe((state) => {
				expect(state.recentBlocks.length).toBe(50);
				resolve();
			});
		});
	});

	it('should splice recent blocks if new depth is less than old depth', () => {
		const controller = new BlockHistoryController();
		controller.update({ recentBlocks: [{} as any, {} as any, {} as any] });
		controller.blockDepth = 1;
		expect(controller.state.recentBlocks.length).toBe(1);
	});

	it('should remove old block tracker listeners', () => {
		const mockBlockTracker = new EventEmitter();
		mockBlockTracker.removeAllListeners = stub();
		const controller = new BlockHistoryController({ blockTracker: mockBlockTracker });
		controller.blockTracker = new EventEmitter();
		expect((mockBlockTracker.removeAllListeners as any).called).toBe(true);
	});

	it('should get latest block', async () => {
		const blockTracker = new BlockTracker({ provider: PROVIDER });
		const controller = new BlockHistoryController({ blockTracker, provider: PROVIDER });
		const block = await controller.getLatestBlock();
		expect(block).toHaveProperty('number');
	});
});
