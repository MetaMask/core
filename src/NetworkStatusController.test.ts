import 'isomorphic-fetch';
import { stub } from 'sinon';
import NetworkStatusController from './NetworkStatusController';

const DOWN_NETWORK_STATUS = {
	kovan: 'down',
	mainnet: 'down',
	rinkeby: 'down',
	ropsten: 'down'
};

describe('NetworkStatusController', () => {
	it('should set default state', () => {
		const controller = new NetworkStatusController();
		expect(controller.state).toEqual({
			networkStatus: {
				infura: DOWN_NETWORK_STATUS
			}
		});
	});

	it('should set default config', () => {
		const controller = new NetworkStatusController();
		expect(controller.config).toEqual({ interval: 1000 });
	});

	it('should poll on correct interval', () => {
		const mock = stub(window, 'setInterval');
		/* tslint:disable-next-line:no-unused-expression */
		new NetworkStatusController(undefined, { interval: 1337 });
		expect(mock.getCall(0).args[1]).toBe(1337);
		mock.restore();
	});

	it('should check network statuses on interval', () => {
		return new Promise((resolve) => {
			const controller = new NetworkStatusController(undefined, { interval: 10 });
			const mock = stub(controller, 'updateNetworkStatuses');
			setTimeout(() => {
				expect(mock.called).toBe(true);
				mock.restore();
				resolve();
			}, 20);
		});
	});

	it('should update all rates', async () => {
		const controller = new NetworkStatusController();
		expect(controller.state.networkStatus).toEqual({ infura: DOWN_NETWORK_STATUS });
		await controller.updateNetworkStatuses();
		expect(controller.state.networkStatus.infura.mainnet).toBeDefined();
		const status = controller.state.networkStatus.infura.mainnet;
		expect(status === 'ok' || status === 'degraded').toBe(true);
	});

	it('should not update infura rate if disabled', async () => {
		const controller = new NetworkStatusController(undefined, { disabled: true });
		controller.updateInfuraStatus = stub();
		await controller.updateNetworkStatuses();
		expect((controller.updateInfuraStatus as any).called).toBe(false);
	});

	it('should clear previous interval', () => {
		const mock = stub(window, 'clearInterval');
		const controller = new NetworkStatusController(undefined, { interval: 1337 });
		controller.interval = 1338;
		expect(mock.called).toBe(true);
		mock.restore();
	});
});
