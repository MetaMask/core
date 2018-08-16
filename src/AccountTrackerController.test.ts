import AccountTrackerController from './AccountTrackerController';
import { EventEmitter } from 'events';
import { stub } from 'sinon';

const BlockTracker = require('eth-block-tracker');
const HttpProvider = require('ethjs-provider-http');

const provider = new HttpProvider('https://ropsten.infura.io');
const blockTracker = new BlockTracker({ provider });

describe('AccountTrackerController', () => {
	it('should set default state', () => {
		const controller = new AccountTrackerController();
		expect(controller.state).toEqual({
			accounts: {},
			currentBlockGasLimit: ''
		});
	});

	it('should remove old block tracker listeners', () => {
		const mockBlockTracker = new EventEmitter();
		mockBlockTracker.removeAllListeners = stub();
		const controller = new AccountTrackerController({ blockTracker: mockBlockTracker });
		controller.blockTracker = new EventEmitter();
		expect((mockBlockTracker.removeAllListeners as any).called).toBe(true);
	});

	it('should sync addresses', () => {
		const controller = new AccountTrackerController({ provider, blockTracker }, { accounts: { bar: {}, foo: {} } });
		blockTracker.emit('block', { number: 1337, transactions: [] });
		controller.sync(['foo', 'baz']);
		expect(controller.state.accounts).toEqual({ foo: {}, baz: {} });
	});
});
