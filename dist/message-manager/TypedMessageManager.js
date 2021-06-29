"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedMessageManager = void 0;
const uuid_1 = require("uuid");
const util_1 = require("../util");
const AbstractMessageManager_1 = __importDefault(require("./AbstractMessageManager"));
/**
 * Controller in charge of managing - storing, adding, removing, updating - TypedMessages.
 */
class TypedMessageManager extends AbstractMessageManager_1.default {
    constructor() {
        super(...arguments);
        /**
         * Name of this controller used during composition
         */
        this.name = 'TypedMessageManager';
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
    addUnapprovedMessageAsync(messageParams, version, req) {
        return new Promise((resolve, reject) => {
            if (version === 'V1') {
                util_1.validateTypedSignMessageDataV1(messageParams);
            }
            if (version === 'V3') {
                util_1.validateTypedSignMessageDataV3(messageParams);
            }
            const messageId = this.addUnapprovedMessage(messageParams, version, req);
            this.hub.once(`${messageId}:finished`, (data) => {
                switch (data.status) {
                    case 'signed':
                        return resolve(data.rawSig);
                    case 'rejected':
                        return reject(new Error('MetaMask Typed Message Signature: User denied message signature.'));
                    case 'errored':
                        return reject(new Error(`MetaMask Typed Message Signature: ${data.error}`));
                    default:
                        return reject(new Error(`MetaMask Typed Message Signature: Unknown problem: ${JSON.stringify(messageParams)}`));
                }
            });
        });
    }
    /**
     * Creates a new TypedMessage with an 'unapproved' status using the passed messageParams.
     * this.addMessage is called to add the new TypedMessage to this.messages, and to save the
     * unapproved TypedMessages.
     *
     * @param messageParams - The params for the 'eth_signTypedData' call to be made after the message
     * is approved
     * @param version - Compatibility version EIP712
     * @param req? - The original request object possibly containing the origin
     * @returns - The id of the newly created TypedMessage
     */
    addUnapprovedMessage(messageParams, version, req) {
        const messageId = uuid_1.v1();
        const messageParamsMetamask = Object.assign(Object.assign({}, messageParams), { metamaskId: messageId, version });
        if (req) {
            messageParams.origin = req.origin;
        }
        const messageData = {
            id: messageId,
            messageParams,
            status: 'unapproved',
            time: Date.now(),
            type: 'eth_signTypedData',
        };
        this.addMessage(messageData);
        this.hub.emit(`unapprovedMessage`, messageParamsMetamask);
        return messageId;
    }
    /**
     * Sets a TypedMessage status to 'errored' via a call to this.setMessageStatus.
     *
     * @param messageId - The id of the TypedMessage to error
     * @param error - The error to be included in TypedMessage
     */
    setMessageStatusErrored(messageId, error) {
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
     * Removes the metamaskId and version properties from passed messageParams and returns a promise which
     * resolves the updated messageParams
     *
     * @param messageParams - The messageParams to modify
     * @returns - Promise resolving to the messageParams with the metamaskId and version properties removed
     */
    prepMessageForSigning(messageParams) {
        delete messageParams.metamaskId;
        delete messageParams.version;
        return Promise.resolve(messageParams);
    }
}
exports.TypedMessageManager = TypedMessageManager;
exports.default = TypedMessageManager;
//# sourceMappingURL=TypedMessageManager.js.map