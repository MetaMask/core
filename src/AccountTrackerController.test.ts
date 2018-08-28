import AccountTrackerController from './AccountTrackerController';
import { EventEmitter } from 'events';
import { stub } from 'sinon';
const HttpProvider = require('ethjs-provider-http');
const provider = new HttpProvider('https://ropsten.infura.io');

describe('AccountTrackerController', () => {
	it('should set default state', () => {
		const controller = new AccountTrackerController();
		expect(controller.state).toEqual({
			accounts: {}
		});
	});

	it('should get real balance', async () => {
		const address = '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d';
		const controller = new AccountTrackerController({ provider });
		controller.context = { PreferencesController: { state: { identities: { [address]: {} } } } } as any;
		await controller.refresh();
		expect(controller.state.accounts[address].balance).toBeDefined();
	});

	it('should sync addresses', () => {
		const controller = new AccountTrackerController(
			{ provider },
			{
				accounts: {
					bar: { balance: '' },
					foo: { balance: '' }
				}
			}
		);
		controller.context = { PreferencesController: { state: { identities: { baz: {} } } } } as any;
		controller.refresh();
		expect(controller.state.accounts).toEqual({ baz: { balance: '0x0' } });
	});
});
