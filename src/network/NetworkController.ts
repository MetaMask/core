import EthQuery from 'eth-query';
import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { Mutex } from 'async-mutex';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { MAINNET, RPC } from '../constants';

/**
 * Human-readable network name
 */
export type NetworkType =
  | 'kovan'
  | 'localhost'
  | 'mainnet'
  | 'rinkeby'
  | 'goerli'
  | 'ropsten'
  | 'rpc'
  | 'optimism'
  | 'optimismTest';

export enum NetworksChainId {
  mainnet = '1',
  kovan = '42',
  rinkeby = '4',
  goerli = '5',
  ropsten = '3',
  localhost = '',
  rpc = '',
  optimism = 'a', 
  optimismTest = '45'
}

/**
 * @type ProviderConfig
 *
 * Configuration passed to web3-provider-engine
 *
 * @param rpcTarget? - RPC target URL
 * @param type - Human-readable network name
 * @param chainId? - Network ID as per EIP-155
 * @param ticker? - Currency ticker
 * @param nickname? - Personalized network name
 */
export interface ProviderConfig {
  rpcTarget?: string;
  type: NetworkType;
  chainId: string;
  ticker?: string;
  nickname?: string;
}

/**
 * @type NetworkConfig
 *
 * Network controller configuration
 *
 * @property infuraProjectId - an Infura project ID
 * @property providerConfig - web3-provider-engine configuration
 */
export interface NetworkConfig extends BaseConfig {
  infuraProjectId?: string;
  providerConfig: ProviderConfig;
}

/**
 * @type NetworkState
 *
 * Network controller state
 *
 * @property network - Network ID as per net_version
 * @property isCustomNetwork - Identifies if the network is a custom network
 * @property provider - RPC URL and network name provider settings
 */
export interface NetworkState extends BaseState {
  network: string;
  isCustomNetwork: boolean;
  provider: ProviderConfig;
}

const LOCALHOST_RPC_URL = 'http://localhost:8545';

/**
 * Controller that creates and manages an Ethereum network provider
 */
export class NetworkController extends BaseController<
  NetworkConfig,
  NetworkState
> {
  private ethQuery: any;

  private internalProviderConfig: ProviderConfig = {} as ProviderConfig;

  private mutex = new Mutex();

  private initializeProvider(
    type: NetworkType,
    rpcTarget?: string,
    chainId?: string,
    ticker?: string,
    nickname?: string,
  ) {
    this.state.isCustomNetwork = this.getisCustomNetwork(chainId);
    switch (type) {
      case 'kovan':
      case MAINNET:
      case 'rinkeby':
      case 'goerli':
      case 'ropsten':
      case 'optimism':
      case 'optimismTest':
        this.setupInfuraProvider(type);
        break;
      case 'localhost':
        this.setupStandardProvider(LOCALHOST_RPC_URL);
        break;
      case RPC:
        rpcTarget &&
          this.setupStandardProvider(rpcTarget, chainId, ticker, nickname);
        break;
      default:
        throw new Error(`Unrecognized network type: '${type}'`);
    }
  }

  private refreshNetwork() {
    this.update({ network: 'loading' });
    const { rpcTarget, type, chainId, ticker } = this.state.provider;
    this.initializeProvider(type, rpcTarget, chainId, ticker);
    this.lookupNetwork();
  }

  private registerProvider() {
    this.provider.on('error', this.verifyNetwork.bind(this));
    this.ethQuery = new EthQuery(this.provider);
  }

  private setupInfuraProvider(type: NetworkType) {
    const infuraProvider = createInfuraProvider({
      network: type,
      projectId: this.config.infuraProjectId,
    });
    const infuraSubprovider = new Subprovider(infuraProvider);
    const config = {
      ...this.internalProviderConfig,
      ...{
        dataSubprovider: infuraSubprovider,
        engineParams: {
          blockTrackerProvider: infuraProvider,
          pollingInterval: 12000,
        },
      },
    };
    this.updateProvider(createMetamaskProvider(config));
  }

  private getisCustomNetwork(chainId? :String){
    return ( chainId !== NetworksChainId.mainnet &&
            chainId !== NetworksChainId.kovan &&
            chainId !== NetworksChainId.rinkeby &&
            chainId !== NetworksChainId.goerli &&
            chainId !== NetworksChainId.ropsten &&
            chainId !== NetworksChainId.localhost )
  }

  private setupStandardProvider(
    rpcTarget: string,
    chainId?: string,
    ticker?: string,
    nickname?: string,
  ) {
    const config = {
      ...this.internalProviderConfig,
      ...{
        chainId,
        engineParams: { pollingInterval: 12000 },
        nickname,
        rpcUrl: rpcTarget,
        ticker,
      },
    };
    this.updateProvider(createMetamaskProvider(config));
  }

  private updateProvider(provider: any) {
    this.safelyStopProvider(this.provider);
    this.provider = provider;
    this.registerProvider();
  }

  private safelyStopProvider(provider: any) {
    setTimeout(() => {
      provider?.stop();
    }, 500);
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
      isCustomNetwork: false,
      provider: { type: MAINNET, chainId: NetworksChainId.mainnet },
    };
    this.initialize();
  }

  /**
   * Sets a new configuration for web3-provider-engine
   *
   * TODO: Replace this wth a method
   *
   * @param providerConfig - web3-provider-engine configuration
   */
  set providerConfig(providerConfig: ProviderConfig) {
    this.internalProviderConfig = providerConfig;
    const { type, rpcTarget, chainId, ticker, nickname } = this.state.provider;
    this.initializeProvider(type, rpcTarget, chainId, ticker, nickname);
    this.registerProvider();
    this.lookupNetwork();
  }

  get providerConfig() {
    throw new Error('Property only used for setting');
  }

  /**
   * Refreshes the current network code
   */
  async lookupNetwork() {
    /* istanbul ignore if */
    if (!this.ethQuery || !this.ethQuery.sendAsync) {
      return;
    }
    const releaseLock = await this.mutex.acquire();
    this.ethQuery.sendAsync(
      { method: 'net_version' },
      (error: Error, network: string) => {
        this.update({
          network: error ? /* istanbul ignore next*/ 'loading' : network,
        });
        releaseLock();
      },
    );
  }

  /**
   * Convenience method to update provider network type settings
   *
   * @param type - Human readable network name
   */
  setProviderType(type: NetworkType) {
    const {
      rpcTarget,
      chainId,
      nickname,
      ...providerState
    } = this.state.provider;
    this.update({
      provider: {
        ...providerState,
        ...{ type, ticker: 'ETH', chainId: NetworksChainId[type] },
      },
    });
    this.refreshNetwork();
  }

  /**
   * Convenience method to update provider RPC settings
   *
   * @param rpcTarget - RPC endpoint URL
   * @param chainId - Network ID as per EIP-155
   * @param ticker? - Currency ticker
   * @param nickname? - Personalized network name
   */
  setRpcTarget(
    rpcTarget: string,
    chainId: string,
    ticker?: string,
    nickname?: string,
  ) {
    this.update({
      provider: {
        ...this.state.provider,
        ...{ type: RPC, ticker, rpcTarget, chainId, nickname },
      },
    });
    this.refreshNetwork();
  }
}

export default NetworkController;
