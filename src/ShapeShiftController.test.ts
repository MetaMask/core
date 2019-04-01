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

	it('should poll and update transactions in the right interval', () => {
		return new Promise((resolve) => {
			const mock = stub(ShapeShiftController.prototype, 'updateTransactionList');
			// tslint:disable-next-line: no-unused-expression
			new ShapeShiftController({ interval: 10 });
			expect(mock.called).toBe(true);
			expect(mock.calledTwice).toBe(false);
			setTimeout(() => {
				expect(mock.calledTwice).toBe(true);
				mock.restore();
				resolve();
			}, 15);
		});
	});

	it('should not update transactions if disabled', async () => {
		const controller = new ShapeShiftController({
			disabled: true,
			interval: 10
		});
		const mock = stub(controller, 'update');
		await controller.updateTransactionList();
		expect(mock.called).toBe(false);
	});

	it('should clear previous interval', () => {
		const mock = stub(global, 'clearTimeout');
		const controller = new ShapeShiftController({ interval: 1337 });
		return new Promise((resolve) => {
			setTimeout(() => {
				controller.poll(1338);
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 100);
		});
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
