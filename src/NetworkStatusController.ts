import BaseController, { BaseConfig, BaseState } from './BaseController';

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
export class NetworkStatusController extends BaseController<NetworkStatusState, NetworkStatusConfig> {
	private handle?: NodeJS.Timer;

	/**
	 * Creates a NetworkStatusController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<NetworkStatusState>, config?: Partial<NetworkStatusConfig>) {
		super(state, config);
		this.defaultConfig = { interval: 180000 };
		this.defaultState = {
			networkStatus: {
				infura: DOWN_NETWORK_STATUS
			}
		};
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch network status
	 */
	set interval(interval: number) {
		this.updateNetworkStatuses();
		this.handle && clearInterval(this.handle);
		this.handle = setInterval(() => {
			this.updateNetworkStatuses();
		}, interval);
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
	 * @returns Promise resolving when this operation completes
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
