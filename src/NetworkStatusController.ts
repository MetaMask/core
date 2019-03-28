import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import { safelyExecute } from './util';

/**
 * Network status code string
 */
export type Status = 'ok' | 'down' | 'degraded';

/**
 * Netowrk status object
 */
export interface NetworkStatus {
	kovan: Status;
	mainnet: Status;
	rinkeby: Status;
	ropsten: Status;
}

/**
 * @type NetworkStatusConfig
 *
 * Network status controller configuration
 *
 * @property interval - Polling interval used to fetch network status
 */
export interface NetworkStatusConfig extends BaseConfig {
	interval: number;
}

/**
 * @type NetworkStatusState
 *
 * Network status controller state
 *
 * @property networkStatus - Providers mapped to network status objects
 */
export interface NetworkStatusState extends BaseState {
	networkStatus: {
		infura: NetworkStatus;
	};
}

const DOWN_NETWORK_STATUS: NetworkStatus = {
	kovan: 'down',
	mainnet: 'down',
	rinkeby: 'down',
	ropsten: 'down'
};

/**
 * Controller that passively polls on a set interval for network status of providers
 */
export class NetworkStatusController extends BaseController<NetworkStatusConfig, NetworkStatusState> {
	private handle?: NodeJS.Timer;

	/**
	 * Name of this controller used during composition
	 */
	name = 'NetworkStatusController';

	/**
	 * Creates a NetworkStatusController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<NetworkStatusConfig>, state?: Partial<NetworkStatusState>) {
		super(config, state);
		this.defaultConfig = { interval: 180000 };
		this.defaultState = {
			networkStatus: {
				infura: DOWN_NETWORK_STATUS
			}
		};
		this.initialize();
		this.poll();
	}

	/**
	 * starts a new polling interval
	 *
	 * @param interval - Polling interval used to fetch network status
	 */
	async poll(interval?: number) {
		this.config.interval = interval || this.config.interval;
		this.handle && clearTimeout(this.handle);
		await safelyExecute(() => this.updateNetworkStatuses());
		this.handle = setTimeout(() => {
			this.poll(this.config.interval);
		}, this.config.interval);
	}

	/**
	 * Fetches infura network status
	 *
	 * @returns - Promise resolving to an infura network status object
	 */
	async updateInfuraStatus(): Promise<NetworkStatus> {
		try {
			const response = await fetch('https://api.infura.io/v1/status/metamask');
			const json = await response.json();
			return json && json.mainnet ? json : /* istanbul ignore next */ DOWN_NETWORK_STATUS;
		} catch (error) {
			/* istanbul ignore next */
			return DOWN_NETWORK_STATUS;
		}
	}

	/**
	 * Updates network status for all providers
	 *
	 * @returns - Promise resolving when this operation completes
	 */
	async updateNetworkStatuses() {
		if (this.disabled) {
			return;
		}
		const infura = await this.updateInfuraStatus();
		this.update({ networkStatus: { infura } });
	}
}

export default NetworkStatusController;
