import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import { validateTypedSignMessageV3Data, validateTypedSignMessageV1Data } from './util';
import NetworkController from './NetworkController';

const random = require('uuid/v1');

/**
 * @type TypedMessage
 *
 * Represents and contains data about an 'eth_signTypedData' type signature request.
 * These are created when a signature for an eth_signTypedData call is requested.
 *
 * @property id - An id to track and identify the message object
 * @property error - Error corresponding to eth_signTypedData error in failure case
 * @property messageParams - The parameters to pass to the eth_signTypedData method once
 * the signature request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'TypedMessage' which always has a 'eth_signTypedData' type
 * @property rawSig - Raw data of the signature request
 */
export interface TypedMessage {
	id: string;
	error?: string;
	messageParams: TypedMessageParams;
	time: number;
	status: string;
	type: string;
	rawSig?: string;
}

/**
 * @type TypedMessageParams
 *
 * Represents the parameters to pass to the eth_signTypedData method once the signature request is approved.
 *
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface TypedMessageParams {
	data: object[] | string;
	from: string;
	origin?: string;
}

/**
 * @type TypedMessageParamsMetamask
 *
 * Represents the parameters to pass to the personal_sign method once the signature request is approved
 * plus data added by MetaMask.
 *
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 * @property version - Compatibility version EIP712
 */
export interface TypedMessageParamsMetamask {
	metamaskId: string;
	data: object[] | string;
	error?: string;
	from: string;
	origin?: string;
	version: string;
}

/**
 * @type OriginalRequest
 *
 * Represents the original request object for adding a message.
 *
 * @property origin? - Is it is specified, represents the origin
 */
export interface OriginalRequest {
	origin?: string;
}

/**
 * @type PersonalMessageManagerState
 *
 * Message Manager state
 *
 * @property unapprovedMessages - A collection of all Messages in the 'unapproved' state
 * @property unapprovedMessagesCount - The count of all Messages in this.memStore.unapprobedMessages
 */
export interface TypedMessageManagerState extends BaseState {
	unapprovedMessages: { [key: string]: TypedMessage };
	unapprovedMessagesCount: number;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - TypedMessages.
 */
export class TypedMessageManager extends BaseController<BaseConfig, TypedMessageManagerState> {
	private messages: TypedMessage[];

	/**
	 * Saves the unapproved TypedMessages, and their count to state
	 *
	 */
	private saveMessageList() {
		const unapprovedMessages = this.getUnapprovedMessages();
		const unapprovedMessagesCount = this.getUnapprovedMessagesCount();
		this.update({ unapprovedMessages, unapprovedMessagesCount });
		this.hub.emit('updateBadge');
	}

	/**
	 * Updates the status of a TypedMessage in this.messages
	 *
	 * @param messageId - The id of the TypedMessage to update
	 * @param status - The new status of the TypedMessage
	 */
	private setMessageStatus(messageId: string, status: string) {
		const message = this.getMessage(messageId);
		/* istanbul ignore if */
		if (!message) {
			throw new Error(`TypedMessageManager - Message not found for id: ${messageId}.`);
		}
		message.status = status;
		this.updateMessage(message);
		this.hub.emit(`${messageId}:${status}`, message);
		if (status === 'rejected' || status === 'signed' || status === 'errored') {
			this.hub.emit(`${messageId}:finished`, message);
		}
	}

	/**
	 * Sets a TypedMessage in this.messages to the passed TypedMessage if the ids are equal.
	 * Then saves the unapprovedMessage list to storage
	 *
	 * @param message - A TypedMessage that will replace an existing TypedMessage (with the id) in this.messages
	 */
	private updateMessage(message: TypedMessage) {
		const index = this.messages.findIndex((msg) => message.id === msg.id);
		/* istanbul ignore next */
		if (index !== -1) {
			this.messages[index] = message;
		}
		this.saveMessageList();
	}

	/**
	 * EventEmitter instance used to listen to specific message events
	 */
	hub = new EventEmitter();

	/**
	 * Name of this controller used during composition
	 */
	name = 'TypedMessageManager';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers = ['NetworkController'];

	/**
	 * Creates a TypedMessageManager instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<TypedMessageManager>) {
		super(config, state);
		this.defaultState = {
			unapprovedMessages: {},
			unapprovedMessagesCount: 0
		};
		this.messages = [];
		this.initialize();
	}

	/**
	 * A getter for the number of 'unapproved' TypedMessages in this.messages
	 *
	 * @returns - The number of 'unapproved' TypedMessages in this.messages
	 *
	 */
	getUnapprovedMessagesCount() {
		return Object.keys(this.getUnapprovedMessages()).length;
	}

	/**
	 * A getter for the 'unapproved' TypedMessages in state messages
	 *
	 * @returns - An index of TypedMessage ids to TypedMessages, for all 'unapproved' TypedMessages in this.messages
	 *
	 */
	getUnapprovedMessages() {
		return this.messages
			.filter((message) => message.status === 'unapproved')
			.reduce((result: { [key: string]: TypedMessage }, message: TypedMessage) => {
				result[message.id] = message;
				return result;
			}, {}) as { [key: string]: TypedMessage };
	}

	/**
	 * Creates a new TypedMessage with an 'unapproved' status using the passed messageParams.
	 * this.addMessage is called to add the new TypedMessage to this.messages, and to save the unapproved TypedMessages.
	 *
	 * @param messageParams - The params for the eth_signTypedData call to be made after the message is approved
	 * @param version - Compatibility version EIP712
	 * @param req? - The original request object possibly containing the origin
	 * @returns - Promise resolving to the raw data of the signature request
	 */
	addUnapprovedMessageAsync(
		messageParams: TypedMessageParams,
		version: string,
		req?: OriginalRequest
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const network = this.context.NetworkController as NetworkController;
			/* istanbul ignore next */
			const currentNetworkID = network ? network.state.network : '1';
			const chainId = parseInt(currentNetworkID, undefined);
			if (version === 'V1') {
				validateTypedSignMessageV1Data(messageParams);
			}
			if (version === 'V3') {
				validateTypedSignMessageV3Data(messageParams, chainId);
			}
			const messageId = this.addUnapprovedMessage(messageParams, version, req);
			this.hub.once(`${messageId}:finished`, (data: TypedMessage) => {
				switch (data.status) {
					case 'signed':
						return resolve(data.rawSig);
					case 'rejected':
						return reject(new Error('MetaMask Personal Message Signature: User denied message signature.'));
					case 'errored':
						return reject(new Error(`MetaMask Message Signature: ${data.error}`));
					default:
						return reject(
							new Error(
								`MetaMask Personal Message Signature: Unknown problem: ${JSON.stringify(messageParams)}`
							)
						);
				}
			});
		});
	}

	/**
	 * Creates a new TypedMessage with an 'unapproved' status using the passed messageParams.
	 * this.addMessage is called to add the new TypedMessage to this.messages, and to save the
	 * unapproved TypedMessages.
	 *
	 * @param messageParams - The params for the eth_signTypedData call to be made after the message
	 * is approved
	 * @param version - Compatibility version EIP712
	 * @param req? - The original request object possibly containing the origin
	 * @returns - The id of the newly created TypedMessage
	 */
	addUnapprovedMessage(messageParams: TypedMessageParams, version: string, req?: OriginalRequest) {
		const messageId = random();
		const messageParamsMetamask = { ...messageParams, metamaskId: messageId, version };
		if (req) {
			messageParams.origin = req.origin;
		}
		const messageData: TypedMessage = {
			id: messageId,
			messageParams,
			status: 'unapproved',
			time: Date.now(),
			type: 'eth_signTypedData'
		};
		this.addMessage(messageData);
		this.hub.emit(`unapprovedMessage`, messageParamsMetamask);
		return messageId;
	}

	/**
	 * Adds a passed TypedMessage to this.messages, and calls this.saveMessageList() to save
	 * the unapproved TypedMessages from that list to this.messages.
	 *
	 * @param {Message} message The Message to add to this.messages
	 *
	 */
	addMessage(message: TypedMessage) {
		this.messages.push(message);
		this.saveMessageList();
	}

	/**
	 * Returns a specified TypedMessage.
	 *
	 * @param messageId - The id of the TypedMessage to get
	 * @returns - The TypedMessage with the id that matches the passed messageId, or undefined
	 * if no Message has that id.
	 *
	 */
	getMessage(messageId: string) {
		return this.messages.find((message) => message.id === messageId);
	}

	/**
	 * Approves a TypedMessage. Sets the message status via a call to this.setMessageStatusApproved,
	 * and returns a promise with any the message params modified for proper signing.
	 *
	 * @param messageParams - The messageParams to be used when personal_sign is called,
	 * plus data added by MetaMask
	 * @returns - Promise resolving to the messageParams with the metamaskId property removed
	 */
	approveMessage(messageParams: TypedMessageParamsMetamask): Promise<TypedMessageParams> {
		this.setMessageStatusApproved(messageParams.metamaskId);
		return this.prepMessageForSigning(messageParams);
	}

	/**
	 * Sets a TypedMessage status to 'approved' via a call to this.setMessageStatus.
	 *
	 * @param messageId - The id of the TypedMessage to approve
	 */
	setMessageStatusApproved(messageId: string) {
		this.setMessageStatus(messageId, 'approved');
	}

	/**
	 * Sets a TypedMessage status to 'errored' via a call to this.setMessageStatus.
	 *
	 * @param messageId - The id of the TypedMessage to error
	 * @param error - The error to be included in TypedMessage
	 */
	setMessageStatusErrored(messageId: string, error: string) {
		const message = this.getMessage(messageId);
		/* istanbul ignore if */
		if (!message) {
			return;
		}
		message.error = error;
		this.updateMessage(message);
		this.setMessageStatus(messageId, 'errored');
	}

	/**
	 * Sets a TypedMessage status to 'signed' via a call to this.setMessageStatus and updates
	 * that TypedMessage in this.messages by adding the raw signature data of the signature
	 * request to the TypedMessage.
	 *
	 * @param messageId - The id of the TypedMessage to sign
	 * @param rawSig - The raw data of the signature request
	 */
	setMessageStatusSigned(messageId: string, rawSig: string) {
		const message = this.getMessage(messageId);
		/* istanbul ignore if */
		if (!message) {
			return;
		}
		message.rawSig = rawSig;
		this.updateMessage(message);
		this.setMessageStatus(messageId, 'signed');
	}

	/**
	 * Removes the metamaskId and version property from passed messageParams and returns a promise which
	 * resolves the updated messageParams
	 *
	 * @param messageParams - The messageParams to modify
	 * @returns - Promise resolving to the messageParams with the metamaskId and version properties removed
	 */
	prepMessageForSigning(messageParams: TypedMessageParamsMetamask): Promise<TypedMessageParams> {
		delete messageParams.metamaskId;
		delete messageParams.version;
		return Promise.resolve(messageParams);
	}

	/**
	 * Sets a TypedMessage status to 'rejected' via a call to this.setMessageStatus.
	 *
	 * @param messageId - The id of the TypedMessage to reject.
	 */
	rejectMessage(messageId: string) {
		this.setMessageStatus(messageId, 'rejected');
	}
}

export default TypedMessageManager;
