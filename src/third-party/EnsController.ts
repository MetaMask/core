import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { isValidAddress, toChecksumAddress } from 'ethereumjs-util';

/**
 * @type EnsEntry
 *
 * ENS entry representation
 *
 * @property chainId - Id of the associated chain
 * @property ensName - The ENS name
 * @property address - Hex address with the ENS name
 */
export interface EnsEntry {
	chainId: string;
	ensName: string;
	address: string | null;
}

/**
 * @type EnsState
 *
 * ENS controller state
 *
 * @property ensEntries - Object of ENS entry objects
 */
export interface EnsState extends BaseState {
	ensEntries: { [chainId: string]: { [ensName: string]: EnsEntry } };
}

/**
 * Controller that manages a list ENS names and their resolved addresses
 * by chainId
 */
export class EnsController extends BaseController<BaseConfig, EnsState> {
	/**
	 * Name of this controller used during composition
	 */
	name = 'EnsController';

	/**
	 * Creates an EnsController instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<EnsState>) {
		super(config, state);

		this.defaultState = { ensEntries: {} };

		this.initialize();
	}

	/**
	 * Remove all chain Ids and ENS entries from state
	 */
	clear() {
		this.update({ ensEntries: {} });
	}

	/**
	 * Remove a contract entry by address
	 *
	 * @param chainId - Parent chain of the ENS entry to delete
	 * @param ensName - Name of the ENS entry to delete
	 */
	delete(chainId: string, ensName: string) {
		if (!this.state.ensEntries[chainId] || !this.state.ensEntries[chainId][ensName]) {
			return false;
		}

		const ensEntries = Object.assign({}, this.state.ensEntries);
		delete ensEntries[chainId][ensName];

		if (Object.keys(ensEntries[chainId]).length === 0) {
			delete ensEntries[chainId];
		}

		this.update({ ensEntries });
		return true;
	}

	/**
	 * Add or update an ENS entry by chainId and ensName
	 *
	 * @param chainId - Id of the associated chain
	 * @param ensName - The ENS name
	 * @param address - Associated address to add or update
	 * @returns - Boolean indicating whether the entry was set
	 */
	set(chainId: string, ensName: string, address: string | null): boolean {
		if (
			!Number.isInteger(Number.parseInt(chainId, 10)) ||
			!ensName ||
			typeof ensName !== 'string' ||
			(address && !isValidAddress(address))
		) {
			throw new Error(`Invalid ENS entry: { chainId:${chainId}, ensName:${ensName}, address:${address}}`);
		}

		const normalizedAddress = address ? toChecksumAddress(address) : null;
		const subState = this.state.ensEntries[chainId];

		if (subState && subState[ensName] && subState[ensName].address === normalizedAddress) {
			return false;
		}

		this.update({
			ensEntries: {
				...this.state.ensEntries,
				[chainId]: {
					...this.state.ensEntries[chainId],
					[ensName]: {
						address: normalizedAddress,
						chainId,
						ensName
					}
				}
			}
		});
		return true;
	}
}

export default EnsController;
