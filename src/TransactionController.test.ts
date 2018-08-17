import { stub } from 'sinon';
import TransactionController from './TransactionController';

const mockFlags: { [key: string]: any } = {
	estimateGas: null
};

jest.mock('eth-query', () =>
	jest.fn().mockImplementation(() => {
		return {
			estimateGas: (_transaction: any, callback: any) => {
				if (mockFlags.estimateGas) {
					callback(new Error(mockFlags.estimateGas));
				}
				callback(undefined, '0x0');
			},
			gasPrice: (callback: any) => {
				callback(undefined, '0x0');
			},
			getCode: (_to: any, callback: any) => {
				callback(undefined, '0x0');
			},
			getTransactionCount: (_from: any, _to: any, callback: any) => {
				callback(undefined, '0x0');
			},
			sendRawTransaction: (_transaction: any, callback: any) => {
				callback(undefined, '1337');
			}
		};
	})
);

const HttpProvider = require('ethjs-provider-http');
const MOCK_BLOCK_HISTORY = {
	getLatestBlock: () => ({ gasLimit: '0x0' }),
	state: { recentBlocks: [{ number: '0x0', transactions: [{ hash: '1337' }] }] }
};
const MOCK_NETWORK = { state: { network: '3' } };
const MOCK_PRFERENCES = { state: { selectedAddress: 'foo' } };
const PROVIDER = new HttpProvider('https://ropsten.infura.io');

describe('TransactionController', () => {
	beforeEach(() => {
		for (const key in mockFlags) {
			mockFlags[key] = null;
		}
	});

	it('should set default state', () => {
		const controller = new TransactionController();
		expect(controller.state).toEqual({ transactions: [] });
	});

	it('should set default config', () => {
		const controller = new TransactionController();
		expect(controller.config).toEqual({
			interval: 5000,
			provider: undefined
		});
	});

	it('should poll on correct interval', () => {
		const func = stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new TransactionController({ interval: 1337 });
		expect(func.getCall(0).args[1]).toBe(1337);
		func.restore();
	});

	it('should update rates on interval', () => {
		return new Promise((resolve) => {
			const controller = new TransactionController({ interval: 10 });
			const func = stub(controller, 'queryTransactionStatuses');
			setTimeout(() => {
				expect(func.called).toBe(true);
				func.restore();
				resolve();
			}, 20);
		});
	});

	it('should clear previous interval', () => {
		const func = stub(global, 'clearInterval');
		const controller = new TransactionController({ interval: 1337 });
		controller.interval = 1338;
		expect(func.called).toBe(true);
		func.restore();
	});

	it('should throw when adding invalid transaction', () => {
		return new Promise(async (resolve) => {
			const controller = new TransactionController();
			try {
				await controller.addTransaction({ from: 'foo' } as any);
			} catch (error) {
				expect(error.message).toContain('Invalid "from" address');
				resolve();
			}
		});
	});

	it('should add a valid transaction', async () => {
		const controller = new TransactionController({ provider: PROVIDER });
		const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
		controller.context = {
			BlockHistoryController: MOCK_BLOCK_HISTORY,
			NetworkController: MOCK_NETWORK
		} as any;
		await controller.addTransaction({
			from,
			to: from
		});
		expect(controller.state.transactions[0].transaction.from).toBe(from);
		expect(controller.state.transactions[0].networkID).toBe(MOCK_NETWORK.state.network);
		expect(controller.state.transactions[0].status).toBe('unapproved');
	});

	it('should cancel a transaction', () => {
		return new Promise(async (resolve) => {
			const controller = new TransactionController({ provider: PROVIDER });
			controller.context = { BlockHistoryController: MOCK_BLOCK_HISTORY } as any;
			const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			const { result } = await controller.addTransaction({
				from,
				to: from
			});
			controller.cancelTransaction('foo');
			controller.hub.once(`${controller.state.transactions[0].id}:finished`, () => {
				expect(controller.state.transactions[0].transaction.from).toBe(from);
				expect(controller.state.transactions[0].status).toBe('rejected');
			});
			controller.cancelTransaction(controller.state.transactions[0].id);
			result.catch((error) => {
				expect(error.message).toContain('User rejected the transaction');
				resolve();
			});
		});
	});

	it('should wipe transactions', async () => {
		const controller = new TransactionController({ provider: PROVIDER });
		controller.wipeTransactions();
		controller.context = {
			BlockHistoryController: MOCK_BLOCK_HISTORY,
			NetworkController: MOCK_NETWORK
		} as any;
		const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
		await controller.addTransaction({
			from,
			to: from
		});
		controller.wipeTransactions();
		expect(controller.state.transactions.length).toBe(0);
	});

	it('should fail to approve an invalid transaction', () => {
		return new Promise(async (resolve) => {
			const controller = new TransactionController({
				provider: PROVIDER,
				sign: () => {
					throw new Error('foo');
				}
			});
			controller.context = { BlockHistoryController: MOCK_BLOCK_HISTORY } as any;
			const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
			const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			const { result } = await controller.addTransaction({ from, to });
			result.catch((error) => {
				const { transaction, status } = controller.state.transactions[0];
				expect(transaction.from).toBe(from);
				expect(transaction.to).toBe(to);
				expect(status).toBe('failed');
				expect(error.message).toContain('foo');
				resolve();
			});
			await controller.approveTransaction(controller.state.transactions[0].id);
		});
	});

	it('should fail transaction if gas calculation fails', () => {
		return new Promise(async (resolve) => {
			const controller = new TransactionController({ provider: PROVIDER });
			const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			controller.context = {
				BlockHistoryController: MOCK_BLOCK_HISTORY,
				NetworkController: MOCK_NETWORK
			} as any;
			mockFlags.estimateGas = 'Uh oh';
			try {
				await controller.addTransaction({
					from,
					to: from
				});
			} catch (error) {
				expect(error.message).toContain('Uh oh');
				resolve();
			}
		});
	});

	it('should fail if no sign method defined', () => {
		return new Promise(async (resolve) => {
			const controller = new TransactionController({
				provider: PROVIDER
			});
			controller.context = { BlockHistoryController: MOCK_BLOCK_HISTORY } as any;
			const from = '0xe6509775f3f3614576c0d83f8647752f87cd6659';
			const to = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			const { result } = await controller.addTransaction({ from, to });
			result.catch((error) => {
				const { transaction, status } = controller.state.transactions[0];
				expect(transaction.from).toBe(from);
				expect(transaction.to).toBe(to);
				expect(status).toBe('failed');
				expect(error.message).toContain('No sign method defined');
				resolve();
			});
			await controller.approveTransaction(controller.state.transactions[0].id);
		});
	});

	it('should approve a transaction', () => {
		return new Promise(async (resolve) => {
			const controller = new TransactionController({
				provider: PROVIDER,
				sign: async (transaction: any) => transaction
			});
			const from = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
			controller.context = {
				BlockHistoryController: MOCK_BLOCK_HISTORY,
				NetworkController: MOCK_NETWORK
			} as any;
			await controller.addTransaction({
				from,
				gas: '0x0',
				gasPrice: '0x0',
				to: from,
				value: '0x0'
			});
			controller.hub.once(`${controller.state.transactions[0].id}:finished`, () => {
				const { transaction, status } = controller.state.transactions[0];
				expect(transaction.from).toBe(from);
				expect(status).toBe('submitted');
				resolve();
			});
			controller.approveTransaction(controller.state.transactions[0].id);
		});
	});

	it('should query transaction statuses', () => {
		return new Promise((resolve) => {
			const controller = new TransactionController();
			controller.context = {
				BlockHistoryController: MOCK_BLOCK_HISTORY,
				NetworkController: MOCK_NETWORK,
				PreferencesController: MOCK_PRFERENCES
			} as any;
			controller.state.transactions.push({
				id: 'foo',
				networkID: '3',
				status: 'submitted',
				transactionHash: '1337'
			} as any);
			controller.state.transactions.push({} as any);
			controller.hub.once(`${controller.state.transactions[0].id}:confirmed`, () => {
				expect(controller.state.transactions[0].status).toBe('confirmed');
				resolve();
			});
			controller.queryTransactionStatuses();
		});
	});
});
