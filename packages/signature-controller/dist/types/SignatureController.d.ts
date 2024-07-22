/// <reference types="node" />
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { KeyringControllerSignMessageAction, KeyringControllerSignPersonalMessageAction, KeyringControllerSignTypedMessageAction } from '@metamask/keyring-controller';
import type { AddLog } from '@metamask/logging-controller';
import type { PersonalMessageParams, TypedMessageParams, AbstractMessage, AbstractMessageParams, OriginalRequest, TypedMessage, PersonalMessage } from '@metamask/message-manager';
import type { Hex, Json } from '@metamask/utils';
import EventEmitter from 'events';
declare const controllerName = "SignatureController";
type StateMessage = Required<AbstractMessage> & {
    msgParams: Required<AbstractMessageParams>;
};
type SignatureControllerState = {
    unapprovedPersonalMsgs: Record<string, StateMessage>;
    unapprovedTypedMessages: Record<string, StateMessage>;
    unapprovedPersonalMsgCount: number;
    unapprovedTypedMessagesCount: number;
};
type AllowedActions = AddApprovalRequest | KeyringControllerSignMessageAction | KeyringControllerSignPersonalMessageAction | KeyringControllerSignTypedMessageAction | AddLog;
type TypedMessageSigningOptions = {
    parseJsonData: boolean;
};
export type GetSignatureState = ControllerGetStateAction<typeof controllerName, SignatureControllerState>;
export type SignatureStateChange = ControllerStateChangeEvent<typeof controllerName, SignatureControllerState>;
export type SignatureControllerActions = GetSignatureState;
export type SignatureControllerEvents = SignatureStateChange;
export type SignatureControllerMessenger = RestrictedControllerMessenger<typeof controllerName, SignatureControllerActions | AllowedActions, SignatureControllerEvents, AllowedActions['type'], never>;
export type SignatureControllerOptions = {
    messenger: SignatureControllerMessenger;
    isEthSignEnabled: () => boolean;
    getAllState: () => unknown;
    securityProviderRequest?: (requestData: any, methodName: string) => Promise<any>;
    getCurrentChainId: () => Hex;
};
/**
 * Controller for creating signing requests requiring user approval.
 */
export declare class SignatureController extends BaseController<typeof controllerName, SignatureControllerState, SignatureControllerMessenger> {
    #private;
    hub: EventEmitter;
    /**
     * Construct a Sign controller.
     *
     * @param options - The controller options.
     * @param options.messenger - The restricted controller messenger for the sign controller.
     * @param options.getAllState - Callback to retrieve all user state.
     * @param options.securityProviderRequest - A function for verifying a message, whether it is malicious or not.
     * @param options.getCurrentChainId - A function for retrieving the current chainId.
     */
    constructor({ messenger, getAllState, securityProviderRequest, getCurrentChainId, }: SignatureControllerOptions);
    /**
     * A getter for the number of 'unapproved' PersonalMessages in this.messages.
     *
     * @returns The number of 'unapproved' PersonalMessages in this.messages
     */
    get unapprovedPersonalMessagesCount(): number;
    /**
     * A getter for the number of 'unapproved' TypedMessages in this.messages.
     *
     * @returns The number of 'unapproved' TypedMessages in this.messages
     */
    get unapprovedTypedMessagesCount(): number;
    /**
     * A getter for returning all messages.
     *
     * @returns The object containing all messages.
     */
    get messages(): {
        [id: string]: PersonalMessage | TypedMessage;
    };
    /**
     * Reset the controller state to the initial state.
     */
    resetState(): void;
    /**
     * Reject all unapproved messages of any type.
     *
     * @param reason - A message to indicate why.
     */
    rejectUnapproved(reason?: string): void;
    /**
     * Clears all unapproved messages from memory.
     */
    clearUnapproved(): void;
    /**
     * Called when a dapp uses the personal_sign method.
     *
     * We currently define personal_sign mostly for legacy Dapps.
     *
     * @param messageParams - The params of the message to sign & return to the Dapp.
     * @param req - The original request, containing the origin.
     * @returns Promise resolving to the raw data of the signature request.
     */
    newUnsignedPersonalMessage(messageParams: PersonalMessageParams, req: OriginalRequest): Promise<string>;
    /**
     * Called when a dapp uses the eth_signTypedData method, per EIP 712.
     *
     * @param messageParams - The params passed to eth_signTypedData.
     * @param req - The original request, containing the origin.
     * @param version - The version indicating the format of the typed data.
     * @param signingOpts - An options bag for signing.
     * @param signingOpts.parseJsonData - Whether to parse the JSON before signing.
     * @returns Promise resolving to the raw data of the signature request.
     */
    newUnsignedTypedMessage(messageParams: TypedMessageParams, req: OriginalRequest, version: string, signingOpts: TypedMessageSigningOptions): Promise<string>;
    /**
     * Called to update the message status as signed.
     *
     * @param messageId - The id of the Message to update.
     * @param signature - The data to update the message with.
     */
    setDeferredSignSuccess(messageId: string, signature: any): void;
    /**
     * Called when the message metadata needs to be updated.
     *
     * @param messageId - The id of the message to update.
     * @param metadata - The data to update the metadata property in the message.
     */
    setMessageMetadata(messageId: string, metadata: Json): void;
    /**
     * Called to cancel a signing message.
     *
     * @param messageId - The id of the Message to update.
     */
    setDeferredSignError(messageId: string): void;
    setTypedMessageInProgress(messageId: string): void;
    setPersonalMessageInProgress(messageId: string): void;
}
export {};
//# sourceMappingURL=SignatureController.d.ts.map