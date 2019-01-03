const BlockTracker = require('eth-block-tracker');
const Subprovider = require('web3-provider-engine/subproviders/provider.js');
const createInfuraProvider = require('eth-json-rpc-infura/src/createProvider');
const createMetamaskProvider = require('web3-provider-engine//zero.js');

const infuraProvider = createInfuraProvider({ network: 'kovan' });
const infuraSubprovider = new Subprovider(infuraProvider);
const config = {
	rpcUrl: 'https://kovan.infura.io',
	dataSubprovider: infuraSubprovider,
	engineParams: {
		blockTrackerProvider: infuraProvider,
		pollingInterval: 8000
	}
};

const provider = createMetamaskProvider(config);
provider.sendAsync = provider.sendAsync.bind(provider);
const blockTracker = new BlockTracker({ provider });
blockTracker.on('block', block => {
	console.log(block.difficulty);
});
blockTracker.start();
