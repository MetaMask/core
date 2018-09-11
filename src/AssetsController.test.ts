import AssetsController from './AssetsController';

describe('PreferencesController', () => {
	let assetsController: AssetsController;
	beforeEach(() => {
		assetsController = new AssetsController();
	});

	it('should set default state', () => {
		expect(assetsController.state).toEqual({
			collectibles: [],
			tokens: []
		});
	});

	it('should add token', () => {
		assetsController.addToken('foo', 'bar', 2);
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'bar'
		});
		assetsController.addToken('foo', 'baz', 2);
		expect(assetsController.state.tokens[0]).toEqual({
			address: '0xfoO',
			decimals: 2,
			symbol: 'baz'
		});
	});

	it('should remove token', () => {
		assetsController.addToken('foo', 'bar', 2);
		assetsController.removeToken('foo');
		expect(assetsController.state.tokens.length).toBe(0);
	});
});
