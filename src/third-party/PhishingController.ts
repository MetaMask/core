import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { safelyExecute } from '../util';

const DEFAULT_PHISHING_RESPONSE = require('eth-phishing-detect/src/config.json');
const PhishingDetector = require('eth-phishing-detect/src/detector');

/**
 * @type EthPhishingResponse
 *
 * Configuration response from the eth-phishing-detect package
 * consisting of approved and unapproved website origins
 *
 * @property blacklist - List of unapproved origins
 * @property fuzzylist - List of fuzzy-matched unapproved origins
 * @property tolerance - Fuzzy match tolerance level
 * @property version - Version number of this configuration
 * @property whitelist - List of approved origins
 */
export interface EthPhishingResponse {
	blacklist: string[];
	fuzzylist: string[];
	tolerance: number;
	version: number;
	whitelist: string[];
}

/**
 * @type PhishingConfig
 *
 * Phishing controller configuration
 *
 * @property interval - Polling interval used to fetch new block / approve lists
 */
export interface PhishingConfig extends BaseConfig {
	interval: number;
}

/**
 * @type PhishingState
 *
 * Phishing controller state
 *
 * @property phishing - eth-phishing-detect configuration
 * @property whitelist - array of temporarily-approved origins
 */
export interface PhishingState extends BaseState {
	phishing: EthPhishingResponse;
	whitelist: string[];
}

/**
 * Controller that passively polls on a set interval for approved and unapproved website origins
 */
export class PhishingController extends BaseController<PhishingConfig, PhishingState> {
	private detector: any;
	private handle?: NodeJS.Timer;

	/**
	 * Name of this controller used during composition
	 */
	name = 'PhishingController';

	/**
	 * Creates a PhishingController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<PhishingConfig>, state?: Partial<PhishingState>) {
		super(config, state);
		this.defaultConfig = { interval: 180000 };
		this.defaultState = {
			phishing: DEFAULT_PHISHING_RESPONSE,
			whitelist: []
		};
		this.detector = new PhishingDetector(this.defaultState.phishing);
		this.initialize();
		this.poll();
	}

	/**
	 * Starts a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new approval lists
	 */
	async poll(interval?: number): Promise<void> {
		interval && this.configure({ interval }, false, false);
		this.handle && clearTimeout(this.handle);
		await safelyExecute(() => this.updatePhishingLists());
		this.handle = setTimeout(() => {
			this.poll(this.config.interval);
		}, this.config.interval);
	}

	/**
	 * Determines if a given origin is unapproved
	 *
	 * @param origin - Domain origin of a website
	 * @returns - True if the origin is an unapproved origin
	 */
	test(origin: string): boolean {
		if (this.state.whitelist.indexOf(origin) !== -1) {
			return false;
		}
		return this.detector.check(origin).result;
	}

	/**
	 * Temporarily marks a given origin as approved
	 */
	bypass(origin: string) {
		const { whitelist } = this.state;
		if (whitelist.indexOf(origin) !== -1) {
			return;
		}
		this.update({ whitelist: [...whitelist, origin] });
	}

	/**
	 * Updates lists of approved and unapproved website origins
	 *
	 * @returns Promise resolving when this operation completes
	 */
	async updatePhishingLists() {
		if (this.disabled) {
			return;
		}

		const response = await fetch('https://api.infura.io/v2/blacklist');
		const phishing = await response.json();
		this.detector = new PhishingDetector(phishing);
		phishing && this.update({ phishing });
	}
}

export default PhishingController;
