import { stub } from 'sinon';
import AddressBookController from '../src/user/AddressBookController';
import ComposableController from '../src/ComposableController';
import PreferencesController from '../src/user/PreferencesController';
import TokenRatesController from '../src/assets/TokenRatesController';
import { AssetsController } from '../src/assets/AssetsController';
import { NetworkController } from '../src/network/NetworkController';
import { AssetsContractController } from '../src/assets/AssetsContractController';
import CurrencyRateController from '../src/assets/CurrencyRateController';

describe('ComposableController', () => {
	it('should compose controller state', () => {
		const controller = new ComposableController([
			new AddressBookController(),
			new AssetsController(),
			new AssetsContractController(),
			new CurrencyRateController(),
			new NetworkController(),
			new PreferencesController(),
			new TokenRatesController()
		]);
		expect(controller.state).toEqual({
			AddressBookController: { addressBook: {} },
			AssetsContractController: {},
			AssetsController: {
				allCollectibleContracts: {},
				allCollectibles: {},
				allTokens: {},
				collectibleContracts: [],
				collectibles: [],
				ignoredCollectibles: [],
				ignoredTokens: [],
				suggestedAssets: [],
				tokens: []
			},
			CurrencyRateController: {
				conversionDate: 0,
				conversionRate: 0,
				currentCurrency: 'usd',
				nativeCurrency: 'eth'
			},
			NetworkController: {
				network: 'loading',
				provider: { type: 'mainnet' }
			},
			PreferencesController: {
				featureFlags: {},
				frequentRpcList: [],
				identities: {},
				ipfsGateway: 'https://ipfs.io/ipfs/',
				lostIdentities: {},
				selectedAddress: ''
			},
			TokenRatesController: { contractExchangeRates: {} }
		});
	});

	it('should compose flat controller state', () => {
		const controller = new ComposableController([
			new AddressBookController(),
			new AssetsController(),
			new AssetsContractController(),
			new CurrencyRateController(),
			new NetworkController(),
			new PreferencesController(),
			new TokenRatesController()
		]);
		expect(controller.flatState).toEqual({
			addressBook: {},
			allCollectibleContracts: {},
			allCollectibles: {},
			allTokens: {},
			collectibleContracts: [],
			collectibles: [],
			contractExchangeRates: {},
			conversionDate: 0,
			conversionRate: 0,
			currentCurrency: 'usd',
			featureFlags: {},
			frequentRpcList: [],
			identities: {},
			ignoredCollectibles: [],
			ignoredTokens: [],
			ipfsGateway: 'https://ipfs.io/ipfs/',
			lostIdentities: {},
			nativeCurrency: 'eth',
			network: 'loading',
			provider: { type: 'mainnet' },
			selectedAddress: '',
			suggestedAssets: [],
			tokens: []
		});
	});

	it('should expose sibling context', () => {
		const controller = new ComposableController([
			new AddressBookController(),
			new AssetsController(),
			new AssetsContractController(),
			new CurrencyRateController(),
			new NetworkController(),
			new PreferencesController(),
			new TokenRatesController()
		]);
		const addressContext = controller.context.TokenRatesController.context
			.AddressBookController as AddressBookController;
		expect(addressContext).toBeDefined();
		addressContext.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		expect(controller.flatState).toEqual({
			addressBook: {
				'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
					address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
					name: 'foo'
				}
			},
			allCollectibleContracts: {},
			allCollectibles: {},
			allTokens: {},
			collectibleContracts: [],
			collectibles: [],
			contractExchangeRates: {},
			conversionDate: 0,
			conversionRate: 0,
			currentCurrency: 'usd',
			featureFlags: {},
			frequentRpcList: [],
			identities: {},
			ignoredCollectibles: [],
			ignoredTokens: [],
			ipfsGateway: 'https://ipfs.io/ipfs/',
			lostIdentities: {},
			nativeCurrency: 'eth',
			network: 'loading',
			provider: { type: 'mainnet' },
			selectedAddress: '',
			suggestedAssets: [],
			tokens: []
		});
	});

	it('should get and set new stores', () => {
		const controller = new ComposableController();
		const addressBook = new AddressBookController();
		controller.controllers = [addressBook];
		expect(controller.controllers).toEqual([addressBook]);
	});

	it('should set initial state', () => {
		const state = {
			AddressBookController: {
				addressBook: [
					{
						address: 'bar',
						name: 'foo'
					}
				]
			}
		};
		const controller = new ComposableController([new AddressBookController()], state);
		expect(controller.state).toEqual(state);
	});

	it('should notify listeners of nested state change', () => {
		const addressBookController = new AddressBookController();
		const controller = new ComposableController([addressBookController]);
		const listener = stub();
		controller.subscribe(listener);
		addressBookController.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		expect(listener.calledOnce).toBe(true);
		expect(listener.getCall(0).args[0]).toEqual({
			AddressBookController: {
				addressBook: {
					'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
						address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
						name: 'foo'
					}
				}
			}
		});
	});
});
