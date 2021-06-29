"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonalMessageManager = void 0;
const uuid_1 = require("uuid");
const util_1 = require("../util");
const AbstractMessageManager_1 = __importDefault(require("./AbstractMessageManager"));
/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
class PersonalMessageManager extends AbstractMessageManager_1.default {
    constructor() {
        super(...arguments);
        /**
         * Name of this controller used during composition
         */
        this.name = 'PersonalMessageManager';
    }
    /**
     * Creates a new Message with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
     *
     * @param messageParams - The params for the personal_sign call to be made after the message is approved
     * @param req? - The original request object possibly containing the origin
     * @returns - Promise resolving to the raw data of the signature request
     */
    addUnapprovedMessageAsync(messageParams, req) {
        return new Promise((resolve, reject) => {
            util_1.validateSignMessageData(messageParams);
            const messageId = this.addUnapprovedMessage(messageParams, req);
            this.hub.once(`${messageId}:finished`, (data) => {
                switch (data.status) {
                    case 'signed':
                        return resolve(data.rawSig);
                    case 'rejected':
                        return reject(new Error('MetaMask Personal Message Signature: User denied message signature.'));
                    default:
                        return reject(new Error(`MetaMask Personal Message Signature: Unknown problem: ${JSON.stringify(messageParams)}`));
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
    addUnapprovedMessage(messageParams, req) {
        if (req) {
            messageParams.origin = req.origin;
        }
        messageParams.data = util_1.normalizeMessageData(messageParams.data);
        const messageId = uuid_1.v1();
        const messageData = {
            id: messageId,
            messageParams,
            status: 'unapproved',
            time: Date.now(),
            type: 'personal_sign',
        };
        this.addMessage(messageData);
        this.hub.emit(`unapprovedMessage`, Object.assign(Object.assign({}, messageParams), { metamaskId: messageId }));
        return messageId;
    }
    /**
     * Removes the metamaskId property from passed messageParams and returns a promise which
     * resolves the updated messageParams
     *
     * @param messageParams - The messageParams to modify
     * @returns - Promise resolving to the messageParams with the metamaskId property removed
     */
    prepMessageForSigning(messageParams) {
        delete messageParams.metamaskId;
        return Promise.resolve(messageParams);
    }
}
exports.PersonalMessageManager = PersonalMessageManager;
exports.default = PersonalMessageManager;
//# sourceMappingURL=PersonalMessageManager.js.map