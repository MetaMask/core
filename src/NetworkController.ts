import BaseController, { BaseConfig, BaseState } from './BaseController';

const EthQuery = require('eth-query');
const Subprovider = require('web3-provider-engine/subproviders/provider.js');
const createInfuraProvider = require('eth-json-rpc-infura/src/createProvider');
const createMetamaskProvider = require('web3-provider-engine//zero.js');

/**
 * Human-readable network name
 */
export type NetworkType = 'kovan' | 'localhost' | 'mainnet' | 'rinkeby' | 'ropsten' | 'rpc';

/**
 * @type ProviderConfig
 *
 * Configuration passed to web3-provider-engine
 */
export interface ProviderConfig {
	// TODO
}

/**
 * @type NetworkConfig
 *
 * Network controller configuration
 *
 * @property providerConfig - web3-provider-engine configuration
 */
export interface NetworkConfig extends BaseConfig {
	providerConfig: ProviderConfig;
}

/**
 * @type NetworkState
 *
 * Network controller state
 *
 * @property network - Network ID as per net_version
 * @property provider - RPC URL and network name provider settings
 */
export interface NetworkState extends BaseState {
	network: string;
	provider: {
		rpcTarget?: string;
		type: NetworkType;
	};
}

const LOCALHOST_RPC_URL = 'http://localhost:8545';

/**
 * Controller that creates and manages an Ethereum network provider
 */
export class NetworkController extends BaseController<NetworkConfig, NetworkState> {
	private ethQuery: any;
	private internalProviderConfig: ProviderConfig = {} as ProviderConfig;

	private initializeProvider(type: NetworkType, rpcTarget?: string) {
		switch (type) {
			case 'kovan':
			case 'mainnet':
				this.setupInfuraProvider(type);
				break;
			case 'rinkeby':
			case 'ropsten':
				this.setupInfuraProvider(type);
				break;
			case 'localhost':
				this.setupStandardProvider(LOCALHOST_RPC_URL);
				break;
			case 'rpc':
				rpcTarget && this.setupStandardProvider(rpcTarget);
				break;
		}
	}

	private refreshNetwork() {
		this.update({ network: 'loading' });
		const { rpcTarget, type } = this.state.provider;
		this.initializeProvider(type, rpcTarget);
		this.lookupNetwork();
	}

	private registerProvider() {
		this.provider.on('block', this.verifyNetwork.bind(this));
		this.provider.on('error', this.verifyNetwork.bind(this));
		this.ethQuery = new EthQuery(this.provider);
	}

	private setupInfuraProvider(type: NetworkType) {
		const infuraProvider = createInfuraProvider({ network: type });
		const infuraSubprovider = new Subprovider(infuraProvider);
		const config = {
			...this.internalProviderConfig,
			...{
				dataSubprovider: infuraSubprovider,
				engineParams: {
					blockTrackerProvider: infuraProvider,
					pollingInterval: 8000
				}
			}
		};
		this.updateProvider(createMetamaskProvider(config));
	}

	private setupStandardProvider(rpcTarget: string) {
		const config = {
			...this.internalProviderConfig,
			...{
				engineParams: { pollingInterval: 8000 },
				rpcUrl: rpcTarget
			}
		};
		this.updateProvider(createMetamaskProvider(config));
	}

	private updateProvider(provider: any) {
		this.provider && this.provider.stop();
		this.provider = provider;
		this.registerProvider();
	}

	private verifyNetwork() {
		this.state.network === 'loading' && this.lookupNetwork();
	}

	/**
	 * Name of this controller used during composition
	 */
	name = 'NetworkController';

	/**
	 * Ethereum provider object for the current network
	 */
	provider: any;

	/**
	 * Creates a NetworkController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<NetworkConfig>, state?: Partial<NetworkState>) {
		super(config, state);
		this.defaultState = {
			network: 'loading',
			provider: { type: 'rinkeby' }
		};
		this.initialize();
	}

	/**
	 * Sets a new configuration for web3-provider-engine
	 *
	 * @param providerConfig - web3-provider-engine configuration
	 */
	set providerConfig(providerConfig: ProviderConfig) {
		this.internalProviderConfig = providerConfig;
		const { type, rpcTarget } = this.state.provider;
		this.initializeProvider(type, rpcTarget);
		this.registerProvider();
		this.lookupNetwork();
	}

	/**
	 * Refreshes the current network code
	 */
	lookupNetwork() {
		/* istanbul ignore if */
		if (!this.ethQuery || !this.ethQuery.sendAsync) {
			return;
		}
		this.ethQuery.sendAsync({ method: 'net_version' }, (error: Error, network: string) => {
			this.update({ network: error ? /* istanbul ignore next*/ 'loading' : network });
		});
	}

	/**
	 * Convenience method to update provider network type settings
	 *
	 * @param type - Human readable network name
	 */
	setProviderType(type: NetworkType) {
		this.update({
			provider: {
				...this.state.provider,
				...{ type }
			}
		});
		this.refreshNetwork();
	}

	/**
	 * Convenience method to update provider RPC settings
	 *
	 * @param rpcTarget - RPC endpoint URL
	 */
	setRpcTarget(rpcTarget: string) {
		this.update({
			provider: {
				...this.state.provider,
				...{ type: 'rpc', rpcTarget }
			}
		});
		this.refreshNetwork();
	}
}

export default NetworkController;
