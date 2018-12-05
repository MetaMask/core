import { EventEmitter } from 'events';
import BaseController, { BaseConfig, BaseState } from './BaseController';

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
 * @type Message
 *
 * Represents and contains data about a 'personal_sign' type signature request.
 * These are created when a signature for an personal_sign call is requested.
 *
 * @property id - An id to track and identify the message object
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' which always has a 'personal_sign' type
 * @property rawSig - Raw data of the signature request
 */
export interface Message {
	id: string;
	time: number;
	status: string;
	type: string;
	rawSig?: string;
}

/**
 * @type MessageParams
 *
 * Represents the parameters to pass to the signing method once the signature request is approved.
 *
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface MessageParams {
	from: string;
	origin?: string;
}

/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the personal_sign method once the signature request is approved
 * plus data added by MetaMask.
 *
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface MessageParamsMetamask extends MessageParams {
	metamaskId: string;
}

/**
 * @type MessageManagerState
 *
 * Message Manager state
 *
 * @property unapprovedMessages - A collection of all Messages in the 'unapproved' state
 * @property unapprovedMessagesCount - The count of all Messages in this.unapprovedMessages
 */
export interface MessageManagerState<M extends Message> extends BaseState {
	unapprovedMessages: { [key: string]: M };
	unapprovedMessagesCount: number;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export abstract class MessageManager<
	M extends Message,
	P extends MessageParams,
	PM extends MessageParamsMetamask
> extends BaseController<BaseConfig, MessageManagerState<M>> {
	protected messages: M[];

	/**
	 * Saves the unapproved messages, and their count to state
	 *
	 */
	protected saveMessageList() {
		const unapprovedMessages = this.getUnapprovedMessages();
		const unapprovedMessagesCount = this.getUnapprovedMessagesCount();
		this.update({ unapprovedMessages, unapprovedMessagesCount });
		this.hub.emit('updateBadge');
	}

	/**
	 * Updates the status of a Message in this.messages
	 *
	 * @param messageId - The id of the Message to update
	 * @param status - The new status of the Message
	 */
	protected setMessageStatus(messageId: string, status: string) {
		const message = this.getMessage(messageId);
		/* istanbul ignore if */
		if (!message) {
			throw new Error(`${this.context[name]}- Message not found for id: ${messageId}.`);
		}
		message.status = status;
		this.updateMessage(message);
		this.hub.emit(`${messageId}:${status}`, message);
		if (status === 'rejected' || status === 'signed' || status === 'errored') {
			this.hub.emit(`${messageId}:finished`, message);
		}
	}

	/**
	 * Sets a Message in this.messages to the passed Message if the ids are equal.
	 * Then saves the unapprovedMessage list to storage
	 *
	 * @param message - A Message that will replace an existing Message (with the id) in this.messages
	 */
	protected updateMessage(message: M) {
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
	name = 'MessageManager';

	/**
	 * Creates a MessageManager instance
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: Partial<BaseConfig>, state?: Partial<MessageManagerState<M>>) {
		super(config, state);
		this.defaultState = {
			unapprovedMessages: {},
			unapprovedMessagesCount: 0
		};
		this.messages = [];
		this.initialize();
	}

	/**
	 * A getter for the number of 'unapproved' Messages in this.messages
	 *
	 * @returns - The number of 'unapproved' Messages in this.messages
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
			.reduce((result: { [key: string]: M }, message: M) => {
				result[message.id] = message;
				return result;
			}, {}) as { [key: string]: M };
	}

	/**
	 * Adds a passed Message to this.messages, and calls this.saveMessageList() to save
	 * the unapproved Messages from that list to this.messages.
	 *
	 * @param {Message} message The Message to add to this.messages
	 *
	 */
	addMessage(message: M) {
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
	approveMessage(messageParams: PM): Promise<P> {
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
	abstract prepMessageForSigning(messageParams: PM): Promise<P>;

	/**
	 * Sets a Message status to 'rejected' via a call to this.setMessageStatus.
	 *
	 * @param messageId - The id of the Message to reject.
	 */
	rejectMessage(messageId: string) {
		this.setMessageStatus(messageId, 'rejected');
	}
}

export default MessageManager;
