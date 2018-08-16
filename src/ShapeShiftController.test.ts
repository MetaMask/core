import { getOnce } from 'fetch-mock';
import { stub } from 'sinon';
import ShapeShiftController from './ShapeShiftController';

const PENDING_TX = {
	depositAddress: 'foo',
	depositType: 'bar',
	key: 'shapeshift',
	response: undefined,
	time: Date.now()
};

describe('ShapeShiftController', () => {
	it('should set default state', () => {
		const controller = new ShapeShiftController();
		expect(controller.state).toEqual({ shapeShiftTxList: [] });
	});

	it('should set default config', () => {
		const controller = new ShapeShiftController();
		expect(controller.config).toEqual({ interval: 3000 });
	});

	it('should poll on correct interval', () => {
		const mock = stub(global, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new ShapeShiftController({ interval: 1337 });
		expect(mock.getCall(0).args[1]).toBe(1337);
		mock.restore();
	});

	it('should update transaction list on interval', () => {
		return new Promise((resolve) => {
			const controller = new ShapeShiftController({ interval: 10 });
			const mock = stub(controller, 'updateTransactionList');
			setTimeout(() => {
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 20);
		});
	});

	it('should not update infura rate if disabled', async () => {
		const controller = new ShapeShiftController({ disabled: true }, { shapeShiftTxList: [PENDING_TX] });
		controller.update = stub();
		await controller.updateTransactionList();
		expect((controller.update as any).called).toBe(false);
	});

	it('should clear previous interval', () => {
		const clearInterval = stub(global, 'clearInterval');
		const controller = new ShapeShiftController({ interval: 1337 });
		controller.interval = 1338;
		expect(clearInterval.called).toBe(true);
		clearInterval.restore();
	});

	it('should update lists', async () => {
		const controller = new ShapeShiftController(undefined, { shapeShiftTxList: [PENDING_TX] });
		getOnce('begin:https://shapeshift.io', () => ({
			body: JSON.stringify({ status: 'pending' })
		}));
		await controller.updateTransactionList();
		getOnce(
			'begin:https://shapeshift.io',
			() => ({
				body: JSON.stringify({ status: 'complete' })
			}),
			{ overwriteRoutes: true, method: 'GET' }
		);
		await controller.updateTransactionList();
		expect(controller.state.shapeShiftTxList[0].response!.status).toBe('complete');
	});

	it('should create transaction', () => {
		const controller = new ShapeShiftController();
		controller.createTransaction('foo', 'bar');
		const tx = controller.state.shapeShiftTxList[0];
		expect(tx.depositAddress).toBe('foo');
		expect(tx.depositType).toBe('bar');
		expect(tx.response).toBeUndefined();
	});
});
