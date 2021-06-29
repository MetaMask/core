"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractMessageManager = void 0;
const events_1 = require("events");
const BaseController_1 = __importDefault(require("../BaseController"));
/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
class AbstractMessageManager extends BaseController_1.default {
    /**
     * Creates an AbstractMessageManager instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config, state) {
        super(config, state);
        /**
         * EventEmitter instance used to listen to specific message events
         */
        this.hub = new events_1.EventEmitter();
        /**
         * Name of this controller used during composition
         */
        this.name = 'AbstractMessageManager';
        this.defaultState = {
            unapprovedMessages: {},
            unapprovedMessagesCount: 0,
        };
        this.messages = [];
        this.initialize();
    }
    /**
     * Saves the unapproved messages, and their count to state
     *
     */
    saveMessageList() {
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
    setMessageStatus(messageId, status) {
        const message = this.getMessage(messageId);
        if (!message) {
            throw new Error(`${this.name}: Message not found for id: ${messageId}.`);
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
    updateMessage(message) {
        const index = this.messages.findIndex((msg) => message.id === msg.id);
        /* istanbul ignore next */
        if (index !== -1) {
            this.messages[index] = message;
        }
        this.saveMessageList();
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
            .reduce((result, message) => {
            result[message.id] = message;
            return result;
        }, {});
    }
    /**
     * Adds a passed Message to this.messages, and calls this.saveMessageList() to save
     * the unapproved Messages from that list to this.messages.
     *
     * @param {Message} message The Message to add to this.messages
     *
     */
    addMessage(message) {
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
    getMessage(messageId) {
        return this.messages.find((message) => message.id === messageId);
    }
    /**
     * Approves a Message. Sets the message status via a call to this.setMessageStatusApproved,
     * and returns a promise with any the message params modified for proper signing.
     *
     * @param messageParams - The messageParams to be used when signing method is called,
     * plus data added by MetaMask
     * @returns - Promise resolving to the messageParams with the metamaskId property removed
     */
    approveMessage(messageParams) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        this.setMessageStatusApproved(messageParams.metamaskId);
        return this.prepMessageForSigning(messageParams);
    }
    /**
     * Sets a Message status to 'approved' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the Message to approve
     */
    setMessageStatusApproved(messageId) {
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
    setMessageStatusSigned(messageId, rawSig) {
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
     * Sets a Message status to 'rejected' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the Message to reject.
     */
    rejectMessage(messageId) {
        this.setMessageStatus(messageId, 'rejected');
    }
}
exports.AbstractMessageManager = AbstractMessageManager;
exports.default = AbstractMessageManager;
//# sourceMappingURL=AbstractMessageManager.js.map