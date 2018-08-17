// const {
// 	AccountTrackerController,
// 	AddressBookController,
// 	BlockHistoryController,
// 	ComposableController,
// 	CurrencyRateController,
// 	KeyringController,
// 	NetworkController,
// 	NetworkStatusController,
// 	PhishingController,
// 	PreferencesController,
// 	ShapeShiftController,
// 	TokenRatesController
// } = require('./dist/index.js');

// const BlockTracker = require('eth-block-tracker');

// /**
//  * Core controller responsible for composing other GABA controllers together
//  * and exposing convenience methods for common wallet operations.
//  */
// class Engine {
// 	/**
// 	 * Creates a CoreController instance
// 	 */
// 	constructor() {
// 		this.api = {
// 			accountTracker: new AccountTrackerController(),
// 			addressBook: new AddressBookController(),
// 			blockHistory: new BlockHistoryController(),
// 			currencyRate: new CurrencyRateController(),
// 			keyring: new KeyringController(),
// 			network: new NetworkController(undefined, {
// 				providerConfig: {}
// 			}),
// 			networkStatus: new NetworkStatusController(),
// 			phishing: new PhishingController(),
// 			preferences: new PreferencesController(),
// 			shapeShift: new ShapeShiftController(),
// 			tokenRates: new TokenRatesController()
// 		};

// 		this.datamodel = new ComposableController(this.api);
// 		this.api.network.subscribe(this.refreshNetwork.bind(this));
// 		this.refreshNetwork();
// 	}

// 	/**
// 	 * Refreshes all controllers that depend on the network
// 	 */
// 	refreshNetwork() {
// 		const {
// 			accountTracker,
// 			blockHistory,
// 			network: { provider }
// 		} = this.api;
// 		provider.sendAsync = provider.sendAsync.bind(provider);
// 		provider.start();
// 		const blockTracker = new BlockTracker({ provider });
// 		blockHistory.configure({ provider, blockTracker });
// 		accountTracker.configure({ provider, blockTracker });
// 		blockTracker.start();
// 	};
// }

// const engine = new Engine();

// engine.api.blockHistory.subscribe((state) => {
// 	console.log(state.recentBlocks[state.recentBlocks.length - 1].number);
// });










process.env.ETHERSCAN_API_KEY = '1YW9UKTPGGV9K9GR7E916UQ5W26A1P42T5';
const WebCrypto = require('node-webcrypto-ossl');
global.crypto = new WebCrypto();
global.btoa = require('btoa');
global.atob = require('atob');
// global.PBKDF2 = require('pbkdf2');

// // // const encryptor = require('eth-keyring-controller/test/lib/mock-encryptor');

const AccountTrackerController = require('./dist/AccountTrackerController.js').default;
const BlockHistoryController = require('./dist/BlockHistoryController.js').default;
const ComposableController = require('./dist/ComposableController.js').default;
const KeyringController = require('./dist/KeyringController.js').default;
const NetworkController = require('./dist/NetworkController.js').default;
const PreferencesController = require('./dist/PreferencesController.js').default;
const TransactionController = require('./dist/TransactionController.js').default;

const BlockTracker = require('eth-block-tracker');

const network = new NetworkController(undefined, { network: '3', provider: { type: 'ropsten' } });
network.configure({ providerConfig: {} });
network.provider.sendAsync = network.provider.sendAsync.bind(network.provider);

const HttpProvider = require('ethjs-provider-http');
const provider = new HttpProvider('https://ropsten.infura.io');

const blockTracker = new BlockTracker({ provider: network.provider });
blockTracker.start();

// blockTracker.awaitCurrentBlock().then(console.log).catch(console.log);
// blockTracker.on('block', ({ number: blockNumber }) => {
// 	console.log(parseInt(blockNumber, 16));
// });
// blockTracker.start
// setTimeout(() => {
// 	blockTracker.on('block', ({ number: blockNumber }) => {
// 		console.log(parseInt(blockNumber, 16));
// 	});
// }, 2000);

const accountTracker = new AccountTrackerController({ blockTracker, provider: network.provider });
// const keyring = new KeyringController(undefined, { encryptor });
const keyring = new KeyringController();
const preferences = new PreferencesController();
const blockHistory = new BlockHistoryController({ blockTracker, provider });

const transaction = new TransactionController({
	sign: keyring.keyring.signTransaction.bind(keyring.keyring),
    provider: network.provider
});

const datamodel = new ComposableController([
	accountTracker,
	blockHistory,
	keyring,
	network,
	preferences,
	transaction
]);

async function add() {
	await keyring.createNewVaultAndRestore('foo', 'april shy rubber dose laundry pistol love great aim badge clap labor');

	transaction.hub.on('unapprovedTransaction', async (meta) => {
		transaction.hub.on(`${transaction.state.transactions[0].id}:confirmed`, (meta) => {
			console.log('\n\n\nDONE', meta.transactionHash);
			console.log(transaction.state.transactions[0]);
			// console.log(transaction.state);
		});

		// promise.then(hash => console.log('\n\n\n\n\n\n\n', hash, '\n\n\n\n\n')).catch(console.log);

		await transaction.approveTransaction(transaction.state.transactions[0].id);
		// console.log(transaction.state);
		// transaction.cancelTransaction(transaction.state.transactions[0].id);
		// transaction.wipeTransactions();
		// console.log(transaction.state);
	});

	transaction.addTransaction({
		from: "0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D",
		to: "0xE6509775F3f3614576C0d83f8647752f87CD6659",
		value: "0x989680",
		gas: "0x0"
	});
}

add();

// const HttpProvider = require('ethjs-provider-http');
// var Web3 = require('web3');
// var web3 = new Web3(new Web3.providers.HttpProvider("https://ropsten.infura.io"));
// var Tx = require('ethereumjs-tx');
// var privateKey = new Buffer('4e102d5bb594e0dae997158a1bb2fd2839e5f3d4a95682537c640d96735573ee', 'hex');

// var rawTx = {
// 	chainId: '3',
// 	from: '0x3244e191f1b4903970224322180f1fbbc415696b',
// 	gas: '0x5208',
// 	gasPrice: '0xc845880',
// 	nonce: '0x2',
// 	to: '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d',
// 	value: '0x0',
// };

// var tx = new Tx(rawTx);
// tx.sign(privateKey);

// var serializedTx = tx.serialize();

// console.log(serializedTx.toString('hex'));
// // f889808609184e72a00082271094000000000000000000000000000000000000000080a47f74657374320000000000000000000000000000000000000000000000000000006000571ca08a8bbf888cfa37bbf0bb965423625641fc956967b81d12e23709cead01446075a01ce999b56a8a88504be365442ea61239198e23d1fce7d00fcfc5cd3b44b7215f

// web3.eth.sendRawTransaction('0x' + serializedTx.toString('hex'), function(err, hash) {
// 	console.log(err, hash);
// });
