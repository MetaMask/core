import TransactionController from './TransactionController';

const BlockTracker = require('eth-block-tracker');
jest.mock('ethjs-query', () => jest.fn().mockImplementation(() => {
	return {
		getTransactionCount: () => ({ toNumber: () => 1337 }),
		sendRawTransaction: () => new Promise((resolve) => { resolve('1337'); })
	};
}));
const HttpProvider = require('ethjs-provider-http');

const MOCK_NETWORK = { state: { network: '3' } };
const PROVIDER = new HttpProvider('https://ropsten.infura.io');
const BLOCK_TRACKER = new BlockTracker({ provider: PROVIDER });
BLOCK_TRACKER.start();

describe('TransactionController', () => {
	it('should set default state', () => {
		const controller = new TransactionController();
		expect(controller.state).toEqual({ transactions: [] });
	});

	it('should set default config', () => {
		const controller = new TransactionController();
		expect(controller.config).toEqual({
			blockTracker: undefined,
			networkKey: 'network',
			provider: undefined
		});
	});

	it('should throw when adding invalid transaction', () => {
		const controller = new TransactionController();
		expect(() => {
			controller.addTransaction({ from: 'foo' } as any);
		}).toThrow();
	});

	it('should add a valid transaction', () => {
		const controller = new TransactionController();
		const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
		controller.context = { network: MOCK_NETWORK } as any;
		controller.addTransaction({
			from,
			to: from
		});
		expect(controller.state.transactions[0].transaction.from).toBe(from);
		expect(controller.state.transactions[0].networkID).toBe(MOCK_NETWORK.state.network);
		expect(controller.state.transactions[0].status).toBe('unapproved');
	});

	it('should cancel a transaction', () => {
		return new Promise((resolve) => {
			const controller = new TransactionController();
			const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			controller.addTransaction({
				from,
				to: from
			}).catch(() => {/* eslint-disable-line no-empty */});
			controller.cancelTransaction('foo');
			controller.hub.once(`${controller.state.transactions[0].id}:finished`, () => {
				expect(controller.state.transactions[0].transaction.from).toBe(from);
				expect(controller.state.transactions[0].status).toBe('rejected');
				resolve();
			});
			controller.cancelTransaction(controller.state.transactions[0].id);
		});
	});

	it('should retry a transaction', () => {
		return new Promise((resolve) => {
			const controller = new TransactionController();
			const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			controller.addTransaction({
				from,
				to: from
			});
			controller.retryTransaction('foo');
			controller.hub.on(`${controller.state.transactions[0].id}:unapproved`, () => {
				expect(controller.state.transactions.length).toBe(2);
				const last = controller.state.transactions.pop();
				expect(last!.transaction.from).toBe(from);
				expect(last!.status).toBe('unapproved');
				resolve();
			});
			controller.retryTransaction(controller.state.transactions[0].id);
		});
	});

	it('should wipe transactions', () => {
		const controller = new TransactionController();
		controller.wipeTransactions();
		controller.context = { network: MOCK_NETWORK } as any;
		const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
		controller.addTransaction({
			from,
			to: from
		});
		controller.wipeTransactions();
		expect(controller.state.transactions.length).toBe(0);
	});

	it('should fail to approve an invalid transaction', () => {
		return new Promise((resolve) => {
			const controller = new TransactionController(undefined, {
				blockTracker: BLOCK_TRACKER,
				provider: PROVIDER,
				sign: async () => { throw new Error('foo'); }
			});
			controller.context = { network: MOCK_NETWORK } as any;
			const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
			const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			controller.addTransaction({ from, to }).catch(resolve);
			controller.hub.once(`${controller.state.transactions[0].id}:finished`, () => {
				const { transaction, status } = controller.state.transactions[0];
				expect(transaction.from).toBe(from);
				expect(transaction.to).toBe(to);
				expect(status).toBe('failed');
			});
			controller.approveTransaction(controller.state.transactions[0].id);
		});
	});

	it('should approve a transaction', () => {
		return new Promise((resolve) => {
			const controller = new TransactionController(undefined, {
				blockTracker: BLOCK_TRACKER,
				provider: PROVIDER,
				sign: async (transaction: any) => transaction
			});
			const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
			const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			controller.addTransaction({ from, to });
			controller.addTransaction({ from, to });
			controller.state.transactions.push({
				status: 'confirmed',
				transaction: {
					from: '0xe6509775f3f3614576c0d83f8647752f87cd6659',
					to: '0xe6509775f3f3614576c0d83f8647752f87cd6659'
				}
			} as any];
			controller.hub.once(`${controller.state.transactions[0].id}:finished`, () => {
				const { transaction, status } = controller.state.transactions[0];
				expect(transaction.from).toBe(from);
				expect(transaction.to).toBe(to);
				expect(status).toBe('submitted');
				controller.approveTransaction(controller.state.transactions[1].id);
				resolve();
			});
			controller.approveTransaction(controller.state.transactions[0].id);
		});
	});

	it('should retry submitted transaction with same nonce', async () => {
		const controller = new TransactionController(undefined, {
			blockTracker: BLOCK_TRACKER,
			provider: PROVIDER,
			sign: async (transaction: any) => transaction
		});
		const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
		const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
		controller.addTransaction({ from, to });
		await controller.approveTransaction(controller.state.transactions[0].id);
		const { gasPrice } = controller.state.transactions[0].transaction;
		controller.retryTransaction(controller.state.transactions[0].id);
		console.log(controller.state.transactions);
		controller.approveTransaction(controller.state.transactions[1].id);
		expect(controller.state.transactions[1].lastGasPrice).toBe(gasPrice);
	});

	it('should fail gracefully if no sign method defined', () => {
		const controller = new TransactionController(undefined, {
			blockTracker: BLOCK_TRACKER,
			provider: PROVIDER
		});
		controller.context = { network: MOCK_NETWORK } as any;
		const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
		const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
		controller.addTransaction({ from, to });
		controller.approveTransaction(controller.state.transactions[0].id);
	});
});
