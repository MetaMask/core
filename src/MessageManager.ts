import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';
const ethUtil = require('ethereumjs-util');
const random = require('uuid/v1');

/**
 * @type Message
 *
 * Represents, and contains data about, an 'eth_sign' type signature request. These are created when a signature for
 * an eth_sign call is requested.
 *
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the eth_sign method once the signature request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' with always have a 'eth_sign' type
 * @property rawSig - Raw data of the signature request
 */
export interface Message {
	id: number;
	messageParams: MessageParams;
	time: number;
	status: string;
	type: string;
	rawSig?: string;
}

/**
 * @type MessageParams
 *
 * Represents, the parameters to pass to the eth_sign method once the signature request is approved.
 *
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property origin? - Added for request origin identification
 */
export interface MessageParams {
	metamaskId: number;
	data: string;
	origin?: string;
}

/**
 * @type OriginalRequest
 *
 * Represents, the original request object for adding a message.
 *
 * @property origin? - Is it is specified, represents the origin
 */
export interface OriginalRequest {
	origin?: string;
}

/**
 * @type MessageManagerConfig
 *
 * Message Manager configuration
 *
 */
export interface MessageManagerConfig extends BaseConfig {}

/**
 * @type MessageManagerState
 *
 * Message Manager state
 *
 * @property unapprovedMessages - A collection of all Messages in the 'unapproved' state
 * @property unapprovedMessagesCount - The count of all Messages in this.memStore.unapprobedMessages
 */
export interface MessageManagerState extends BaseState {
	unapprovedMessages: { [key: string]: Message };
	unapprovedMessagesCount: number;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export class MessageManager extends BaseController<MessageManagerConfig, MessageManagerState> {
	private messages: Message[];

	/**
	 * Saves the unapproved messages, and their count to state
	 *
	 */
	private saveMessageList() {
		const unapprovedMessages = this.getUnapprovedMessages();
		const unapprovedMessagesCount = this.getUnapprovedMessagesCount();
		this.update({ unapprovedMessages, unapprovedMessagesCount });
		this.hub.emit('updateBadge');
	}

	/**
	 * Updates the status of a Message in this.messages
	 *
	 * @param messageId - The id of the Messsage to update
	 * @param status - The new status of the Message
	 */
	private setMessageStatus(messageId: number, status: string) {
		const message = this.getMessage(messageId);
		if (!message) {
			throw new Error(`MessageManager - Message not found for id: ${messageId}.`);
		}
		message.status = status;
		this.updateMessage(message);
		this.hub.emit(`${messageId}:${status}`, message);
		if (status === 'rejected' || status === 'signed') {
			this.hub.emit(`${messageId}:finished`, message);
		}
	}

	/**
	 * Sets a Message in this.messages to the passed Message if the ids are equal.
	 * Then saves the unapprovedMessage list to storage
	 *
	 * @param message - A Message that will replace an existing Message (with the id) in this.messages
	 */
	private updateMessage(message: Message) {
		const index = this.messages.findIndex((msg) => message.id === msg.id);
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
	name = 'MessageManager';

	/**
	 * Creates a MessageManager instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<MessageManagerConfig>, state?: Partial<MessageManagerState>) {
		super(config, state);
		this.defaultState = {
			unapprovedMessages: {},
			unapprovedMessagesCount: 0
		};
		this.messages = [];
		this.initialize();
	}

	/**
	 * A getter for the number of 'unapproved' Messages in state messages
	 *
	 * @returns - The number of 'unapproved' Messages in state messages
	 *
	 */
	getUnapprovedMessagesCount() {
		return Object.keys(this.getUnapprovedMessages()).length;
	}

	/**
	 * A getter for the 'unapproved' Messages in state messages
	 *
	 * @returns - An index of Message ids to Messages, for all 'unapproved' Messages in this.messages
	 *
	 */
	getUnapprovedMessages() {
		return this.messages
			.filter((message) => message.status === 'unapproved')
			.reduce((result: { [key: string]: Message }, message: Message) => {
				result[message.id] = message;
				return result;
			}, {});
	}

	/**
	 * Creates a new Message with an 'unapproved' status using the passed messageParams.
	 * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
	 *
	 * @param messageParams - The params for the eth_sign call to be made after the message is approved
	 * @param req? - The original request object possibly containing the origin
	 * @returns - Promise resolving to the raw data of the signature request
	 */
	addUnapprovedMessageAsync(messageParams: MessageParams, req?: OriginalRequest) {
		return new Promise((resolve, reject) => {
			const messageId = this.addUnapprovedMessage(messageParams, req);
			this.hub.once(`${messageId}:finished`, (data: Message) => {
				switch (data.status) {
					case 'signed':
						return resolve(data.rawSig);
					case 'rejected':
						return reject(new Error('MetaMask Message Signature: User denied message signature.'));
					default:
						return reject(
							new Error(`MetaMask Message Signature: Unknown problem: ${JSON.stringify(messageParams)}`)
						);
				}
			});
		});
	}

	/**
	 * Creates a new Message with an 'unapproved' status using the passed messageParams.
	 * this.addMessage is called to add the new Message to this.messages, and to save the
	 * unapproved Messages.
	 *
	 * @param messageParams - The params for the eth_sign call to be made after the message
	 * is approved
	 * @param req? - The original request object possibly containing the origin
	 * @returns - The id of the newly created message
	 */
	addUnapprovedMessage(messageParams: MessageParams, req?: OriginalRequest) {
		// add origin from request
		if (req) {
			messageParams.origin = req.origin;
		}
		messageParams.data = this.normalizeMessageData(messageParams.data);
		// create txData obj with parameters and meta data
		const messageId = random();
		const messageData: Message = {
			id: messageId,
			messageParams,
			status: 'unapproved',
			time: Date.now(),
			type: 'eth_sign'
		};
		this.addMessage(messageData);
		// signal update
		this.hub.emit('update');
		return messageId;
	}

	/**
	 * Adds a passed Message to this.messages, and calls this._saveMessageList() to save
	 * the unapproved Messages from that list to this.memStore.
	 *
	 * @param {Message} message The Message to add to this.messages
	 *
	 */
	addMessage(message: Message) {
		this.messages.push(message);
		this.saveMessageList();
	}

	/**
	 * Returns a specified Message.
	 *
	 * @param messageId - The id of the Message to get
	 * @returns - The Message with the id that matches the passed messageId, or undefined
	 * if no Message has that id.
	 *
	 */
	getMessage(messageId: number) {
		return this.messages.find((message) => message.id === messageId);
	}

	/**
	 * Approves a Message. Sets the message status via a call to this.setMessageStatusApproved,
	 * and returns a promise with any the message params modified for proper signing.
	 *
	 * @param messageParams - The messageParams to be used when eth_sign is called,
	 * plus data added by MetaMask.
	 */
	approveMessage(messageParams: MessageParams) {
		this.setMessageStatusApproved(messageParams.metamaskId);
		return this.prepsMessageForSigning(messageParams);
	}

	/**
	 * Sets a Message status to 'approved' via a call to this.setMessageStatus
	 *
	 * @param messageId - The id of the Message to approve
	 */
	setMessageStatusApproved(messageId: number) {
		this.setMessageStatus(messageId, 'approved');
	}

	/**
	 * Sets a Message status to 'signed' via a call to this.setMessageStatus and updates
	 * that Message in this.messages by adding the raw signature data of the signature
	 * request to the Message
	 *
	 * @param messageId - The id of the Message to sign
	 * @param rawSig - The raw data of the signature request
	 */
	setMessageStatusSigned(messageId: number, rawSig: string) {
		const message = this.getMessage(messageId);
		if (!message) {
			return;
		}
		message.rawSig = rawSig;
		this.updateMessage(message);
		this.setMessageStatus(messageId, 'signed');
	}

	/**
	 * Removes the metamaskId property from passed messageParams and returns a promise which
	 * resolves the updated messageParams
	 *
	 * @param messageParams - The messageParams to modify
	 * @returns - Promise resolving to the messageParams with the metamaskId property removed
	 */
	prepsMessageForSigning(messageParams: MessageParams): Promise<MessageParams> {
		delete messageParams.metamaskId;
		return Promise.resolve(messageParams);
	}

	/**
	 * Sets a Message status to 'rejected' via a call to this.setMessageStatus.
	 *
	 * @param messageId - The id of the Message to reject.
	 */
	rejectMessage(messageId: number) {
		this.setMessageStatus(messageId, 'rejected');
	}

	/**
	 * A helper function that converts raw buffer data to a hex, or just returns the data if
	 * it is already formatted as a hex.
	 *
	 * @param data - The buffer data to convert to a hex
	 * @returns - A hex string conversion of the buffer data
	 *
	 */
	normalizeMessageData(data: string) {
		if (data.slice(0, 2) === '0x') {
			// data is already hex
			return data;
		} else {
			// data is unicode, convert to hex
			return ethUtil.bufferToHex(Buffer.from(data, 'utf8'));
		}
	}
}

export default MessageManager;
