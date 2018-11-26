import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';
import { validatePersonalSignMessageData, normalizeMessageData } from './util';
const random = require('uuid/v1');

/**
 * @type Message
 *
 * Represents, and contains data about, an 'personal_sign' type signature request.
 * These are created when a signature for an personal_sign call is requested.
 *
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the personal_sign method once the signature request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' with always have a 'personal_sign' type
 * @property rawSig - Raw data of the signature request
 */
export interface Message {
	id: string;
	messageParams: MessageParams;
	time: number;
	status: string;
	type: string;
	rawSig?: string;
}

/**
 * @type MessageParams
 *
 * Represents, the parameters to pass to the personal_sign method once the signature request is approved.
 *
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface MessageParams {
	data: string;
	from: string;
	origin?: string;
}

/**
 * @type MessageParamsMetamask
 *
 * Represents, the parameters to pass to the personal_sign method once the signature request is approved
 * plus data added by MetaMask.
 *
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface MessageParamsMetamask {
	metamaskId: string;
	data: string;
	from: string;
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
 * @type PersonalMessageManagerState
 *
 * Message Manager state
 *
 * @property unapprovedMessages - A collection of all Messages in the 'unapproved' state
 * @property unapprovedMessagesCount - The count of all Messages in this.memStore.unapprobedMessages
 */
export interface PersonalMessageManagerState extends BaseState {
	unapprovedMessages: { [key: string]: Message };
	unapprovedMessagesCount: number;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export class PersonalMessageManager extends BaseController<BaseConfig, PersonalMessageManagerState> {
	private messages: Message[];

	/**
	 * Saves the unapproved messages, and their count to state
	 *
	 */
	private saveMessageList() {
		const unapprovedMessages = this.getUnapprovedMessages();
		const unapprovedMessagesCount = this.getUnapprovedMessagesCount();
		this.update({ unapprovedMessages, unapprovedMessagesCount });
	}

	/**
	 * Updates the status of a Message in this.messages
	 *
	 * @param messageId - The id of the Messsage to update
	 * @param status - The new status of the Message
	 */
	private setMessageStatus(messageId: string, status: string) {
		const message = this.getMessage(messageId);
		/* istanbul ignore if */
		if (!message) {
			throw new Error(`PersonalMessageManager - Message not found for id: ${messageId}.`);
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
	name = 'PersonalMessageManager';

	/**
	 * Creates a PersonalMessageManager instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<PersonalMessageManagerState>) {
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
			}, {}) as { [key: string]: Message };
	}

	/**
	 * Creates a new Message with an 'unapproved' status using the passed messageParams.
	 * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
	 *
	 * @param messageParams - The params for the personal_sign call to be made after the message is approved
	 * @param req? - The original request object possibly containing the origin
	 * @returns - Promise resolving to the raw data of the signature request
	 */
	addUnapprovedMessageAsync(messageParams: MessageParams, req?: OriginalRequest): Promise<string> {
		return new Promise((resolve, reject) => {
			validatePersonalSignMessageData(messageParams);
			const messageId = this.addUnapprovedMessage(messageParams, req);
			this.hub.once(`${messageId}:finished`, (data: Message) => {
				switch (data.status) {
					case 'signed':
						return resolve(data.rawSig);
					case 'rejected':
						return reject(new Error('MetaMask Personal Message Signature: User denied message signature.'));
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
	 * Creates a new Message with an 'unapproved' status using the passed messageParams.
	 * this.addMessage is called to add the new Message to this.messages, and to save the
	 * unapproved Messages.
	 *
	 * @param messageParams - The params for the personal_sign call to be made after the message
	 * is approved
	 * @param req? - The original request object possibly containing the origin
	 * @returns - The id of the newly created message
	 */
	addUnapprovedMessage(messageParams: MessageParams, req?: OriginalRequest) {
		// add origin from request
		if (req) {
			messageParams.origin = req.origin;
		}
		messageParams.data = normalizeMessageData(messageParams.data);
		// create txData obj with parameters and meta data
		const messageId = random();
		const messageData: Message = {
			id: messageId,
			messageParams,
			status: 'unapproved',
			time: Date.now(),
			type: 'personal_sign'
		};
		this.addMessage(messageData);
		this.hub.emit(`unapprovedMessage`, { ...messageParams, ...{ metamaskId: messageId } });
		return messageId;
	}

	/**
	 * Adds a passed Message to this.messages, and calls this.saveMessageList() to save
	 * the unapproved Messages from that list to this.messages.
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
	getMessage(messageId: string) {
		return this.messages.find((message) => message.id === messageId);
	}

	/**
	 * Approves a Message. Sets the message status via a call to this.setMessageStatusApproved,
	 * and returns a promise with any the message params modified for proper signing.
	 *
	 * @param messageParams - The messageParams to be used when personal_sign is called,
	 * plus data added by MetaMask
	 * @returns - Promise resolving to the messageParams with the metamaskId property removed
	 */
	approveMessage(messageParams: MessageParamsMetamask): Promise<MessageParams> {
		this.setMessageStatusApproved(messageParams.metamaskId);
		return this.prepMessageForSigning(messageParams);
	}

	/**
	 * Sets a Message status to 'approved' via a call to this.setMessageStatus.
	 *
	 * @param messageId - The id of the Message to approve
	 */
	setMessageStatusApproved(messageId: string) {
		this.setMessageStatus(messageId, 'approved');
	}

	/**
	 * Sets a Message status to 'signed' via a call to this.setMessageStatus and updates
	 * that Message in this.messages by adding the raw signature data of the signature
	 * request to the Message.
	 *
	 * @param messageId - The id of the Message to sign
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
	 * Removes the metamaskId property from passed messageParams and returns a promise which
	 * resolves the updated messageParams
	 *
	 * @param messageParams - The messageParams to modify
	 * @returns - Promise resolving to the messageParams with the metamaskId property removed
	 */
	prepMessageForSigning(messageParams: MessageParamsMetamask): Promise<MessageParams> {
		delete messageParams.metamaskId;
		return Promise.resolve(messageParams);
	}

	/**
	 * Sets a Message status to 'rejected' via a call to this.setMessageStatus.
	 *
	 * @param messageId - The id of the Message to reject.
	 */
	rejectMessage(messageId: string) {
		this.setMessageStatus(messageId, 'rejected');
	}
}

export default PersonalMessageManager;
