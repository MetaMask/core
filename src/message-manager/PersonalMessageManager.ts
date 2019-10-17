import { validateSignMessageData, normalizeMessageData } from '../util';
import AbstractMessageManager, {
	AbstractMessage,
	AbstractMessageParams,
	AbstractMessageParamsMetamask,
	OriginalRequest
} from './AbstractMessageManager';
const random = require('uuid/v1');

/**
 * @type Message
 *
 * Represents and contains data about a 'personal_sign' type signature request.
 * These are created when a signature for a personal_sign call is requested.
 *
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the personal_sign method once the signature request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' which always has a 'personal_sign' type
 * @property rawSig - Raw data of the signature request
 */
export interface PersonalMessage extends AbstractMessage {
	messageParams: PersonalMessageParams;
}

/**
 * @type PersonalMessageParams
 *
 * Represents the parameters to pass to the personal_sign method once the signature request is approved.
 *
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface PersonalMessageParams extends AbstractMessageParams {
	data: string;
}

/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the personal_sign method once the signature request is approved
 * plus data added by MetaMask.
 *
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer data of the signature request
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
export interface PersonalMessageParamsMetamask extends AbstractMessageParamsMetamask {
	data: string;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export class PersonalMessageManager extends AbstractMessageManager<
	PersonalMessage,
	PersonalMessageParams,
	PersonalMessageParamsMetamask
> {
	/**
	 * Name of this controller used during composition
	 */
	name = 'PersonalMessageManager';

	/**
	 * Creates a new Message with an 'unapproved' status using the passed messageParams.
	 * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
	 *
	 * @param messageParams - The params for the personal_sign call to be made after the message is approved
	 * @param req? - The original request object possibly containing the origin
	 * @returns - Promise resolving to the raw data of the signature request
	 */
	addUnapprovedMessageAsync(messageParams: PersonalMessageParams, req?: OriginalRequest): Promise<string> {
		return new Promise((resolve, reject) => {
			validateSignMessageData(messageParams);
			const messageId = this.addUnapprovedMessage(messageParams, req);
			this.hub.once(`${messageId}:finished`, (data: PersonalMessage) => {
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
	addUnapprovedMessage(messageParams: PersonalMessageParams, req?: OriginalRequest) {
		if (req) {
			messageParams.origin = req.origin;
		}
		messageParams.data = normalizeMessageData(messageParams.data);
		const messageId = random();
		const messageData: PersonalMessage = {
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
	 * Removes the metamaskId property from passed messageParams and returns a promise which
	 * resolves the updated messageParams
	 *
	 * @param messageParams - The messageParams to modify
	 * @returns - Promise resolving to the messageParams with the metamaskId property removed
	 */
	prepMessageForSigning(messageParams: PersonalMessageParamsMetamask): Promise<PersonalMessageParams> {
		delete messageParams.metamaskId;
		return Promise.resolve(messageParams);
	}
}

export default PersonalMessageManager;
