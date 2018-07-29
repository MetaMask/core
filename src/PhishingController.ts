import 'isomorphic-fetch';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import { safelyExecute } from './util';

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
 * @property version - Versin number of this configuration
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
 */
export interface PhishingState extends BaseState {
	phishing: EthPhishingResponse;
}

/**
 * Controller that passively polls on a set interval for approved and unapproved website origins
 */
export class PhishingController extends BaseController<PhishingState, PhishingConfig> {
	private detector: any;
	private handle?: NodeJS.Timer;

	/**
	 * Creates a PhishingController instance
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Initial options used to configure this controller
	 */
	constructor(state?: Partial<PhishingState>, config?: Partial<PhishingConfig>) {
		super(state, config);
		this.defaultConfig = { interval: 180000 };
		this.defaultState = { phishing: DEFAULT_PHISHING_RESPONSE };
		this.detector = new PhishingDetector(this.defaultState.phishing);
		this.initialize();
	}

	/**
	 * Sets a new polling interval
	 *
	 * @param interval - Polling interval used to fetch new approval lists
	 */
	set interval(interval: number) {
		this.handle && clearInterval(this.handle);
		this.updatePhishingLists();
		this.handle = setInterval(() => {
			this.updatePhishingLists();
		}, interval);
	}

	/**
	 * Determines if a given origin is unapproved
	 *
	 * @param origin - Domain origin of a website
	 * @returns - True if the origin is an unapproved origin
	 */
	test(origin: string): boolean {
		return this.detector.check(origin).result;
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
		return safelyExecute(async () => {
			const response = await fetch('https://api.infura.io/v2/blacklist');
			const phishing = await response.json();
			this.detector = new PhishingDetector(phishing);
			phishing && this.update({ phishing });
		});
	}
}

export default PhishingController;
