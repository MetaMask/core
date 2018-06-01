import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';

// TODO Type these properly upstream
const createMetamaskProvider = require('web3-provider-engine/zero.js');
const createInfuraProvider = require('eth-json-rpc-infura/src/createProvider');
const Subprovider = require('web3-provider-engine/subproviders/provider.js');
const EthQuery = require('eth-query');

export type NetworkType = 'kovan' | 'localhost' | 'mainnet' | 'rinkeby' | 'ropsten' | 'rpc';

export interface ProviderConfig {
	// TODO: Tighten up Function types below after tx controller conversion
	/* tslint:disable:ban-types */
	static: {
		eth_sendTransaction: Function;
		eth_syncing: boolean;
		web3_clientVersion: string;
	};
	getAccounts: Function;
	processMessage: Function;
	processPersonalMessage: Function;
	processTypedMessage: Function;
}

export interface NetworkConfig extends BaseConfig {
	providerConfig: ProviderConfig;
}

export interface NetworkState extends BaseState {
	network: string;
	provider: {
		rpcTarget?: string;
		type: NetworkType;
	};
}

const LOCALHOST_RPC_URL = 'http://localhost:8545';

export class NetworkController extends BaseController<NetworkState, NetworkConfig> {
	private ethQuery: any;
	private internalProviderConfig: ProviderConfig = {} as ProviderConfig;

	provider: any;

	defaultState: NetworkState = {
		network: 'loading',
		provider: {
			type: 'rinkeby'
		}
	};

	constructor(state?: Partial<NetworkState>, config?: NetworkConfig) {
		super(state, config);
		this.initialize();
	}

	private initializeProvider(type: NetworkType, rpcTarget?: string) {
		switch (type) {
			case 'kovan':
			case 'mainnet':
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

	private refreshNetwork() {
		this.update({ network: 'loading' });
		const { rpcTarget, type } = this.state.provider;
		this.initializeProvider(type, rpcTarget);
		this.lookupNetwork();
	}

	private updateProvider(provider: any) {
		if (this.provider) {
			const oldBlockTracker = this.provider._blockTracker;
			const newBlockTracker = provider._blockTracker;
			Object.keys(oldBlockTracker._events).forEach((event) => {
				const listeners = oldBlockTracker.listeners(event);
				listeners.forEach((listener: Function) => {
					newBlockTracker.on(event, listener);
					oldBlockTracker.removeListener(event, listener);
				});
			});
			this.provider.stop();
		}
		this.provider = provider;
	}

	private verifyNetwork() {
		this.state.network === 'loading' && this.lookupNetwork();
	}

	set providerConfig(providerConfig: ProviderConfig) {
		this.internalProviderConfig = providerConfig;
		const { type, rpcTarget } = this.state.provider;
		this.initializeProvider(type, rpcTarget);
		this.provider.on('block', this.verifyNetwork.bind(this));
		this.provider.on('error', this.verifyNetwork.bind(this));
		this.ethQuery = new EthQuery(this.provider);
		this.lookupNetwork();
	}

	lookupNetwork() {
		if (!this.ethQuery || !this.ethQuery.sendAsync) {
			return;
		}
		this.ethQuery.sendAsync({ method: 'net_version' }, (error: Error, network: string) => {
			this.update({ network: error ? /* istanbul ignore next*/ 'loading' : network });
		});
	}

	setRpcTarget(rpcTarget: string) {
		this.update({
			provider: {
				...this.state.provider,
				...{ rpcTarget }
			}
		});
		this.refreshNetwork();
	}

	setProviderType(type: NetworkType) {
		this.update({
			provider: {
				...this.state.provider,
				...{ type }
			}
		});
		this.refreshNetwork();
	}
}

export default NetworkController;
