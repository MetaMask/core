import EventEmitter from 'events';
import {
  MessageManager,
  MessageParams,
  MessageParamsMetamask,
  PersonalMessageManager,
  PersonalMessageParams,
  PersonalMessageParamsMetamask,
  TypedMessageManager,
  TypedMessageParams,
  TypedMessageParamsMetamask,
  AbstractMessageManager,
  AbstractMessage,
  MessageManagerState,
  AbstractMessageParams,
  AbstractMessageParamsMetamask,
  OriginalRequest,
} from '@metamask/message-manager';
import { ethErrors } from 'eth-rpc-errors';
import { bufferToHex } from 'ethereumjs-util';

import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { Patch } from 'immer';
import {
  AcceptRequest,
  AddApprovalRequest,
  RejectRequest,
} from '@metamask/approval-controller';
import { ORIGIN_METAMASK } from '@metamask/controller-utils';

const controllerName = 'SignatureController';
const methodNameSign = 'eth_sign';
const methodNamePersonalSign = 'personal_sign';
const methodNameTypedSign = 'eth_signTypedData';

const stateMetadata = {
  unapprovedMsgs: { persist: false, anonymous: false },
  unapprovedPersonalMsgs: { persist: false, anonymous: false },
  unapprovedTypedMessages: { persist: false, anonymous: false },
  unapprovedMsgCount: { persist: false, anonymous: false },
  unapprovedPersonalMsgCount: { persist: false, anonymous: false },
  unapprovedTypedMessagesCount: { persist: false, anonymous: false },
};

const getDefaultState = () => ({
  unapprovedMsgs: {},
  unapprovedPersonalMsgs: {},
  unapprovedTypedMessages: {},
  unapprovedMsgCount: 0,
  unapprovedPersonalMsgCount: 0,
  unapprovedTypedMessagesCount: 0,
});

type CoreMessage = AbstractMessage & {
  messageParams: AbstractMessageParams;
};

type StateMessage = Required<AbstractMessage> & {
  msgParams: Required<AbstractMessageParams>;
  securityProviderResponse: any;
};

type SignatureControllerState = {
  unapprovedMsgs: Record<string, StateMessage>;
  unapprovedPersonalMsgs: Record<string, StateMessage>;
  unapprovedTypedMessages: Record<string, StateMessage>;
  unapprovedMsgCount: number;
  unapprovedPersonalMsgCount: number;
  unapprovedTypedMessagesCount: number;
};

type AllowedActions = AddApprovalRequest | AcceptRequest | RejectRequest;

export type GetSignatureState = {
  type: `${typeof controllerName}:getState`;
  handler: () => SignatureControllerState;
};

export type SignatureStateChange = {
  type: `${typeof controllerName}:stateChange`;
  payload: [SignatureControllerState, Patch[]];
};

export type SignatureControllerActions = GetSignatureState;

export type SignatureControllerEvents = SignatureStateChange;

export type SignatureControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  SignatureControllerActions | AllowedActions,
  SignatureControllerEvents,
  AllowedActions['type'],
  never
>;

export interface KeyringController {
  signMessage: (messsageParams: MessageParams) => Promise<string>;
  signPersonalMessage: (
    messsageParams: PersonalMessageParams,
  ) => Promise<string>;
  signTypedMessage: (
    messsageParams: TypedMessageParams,
    options: { version: string | undefined },
  ) => Promise<string>;
}

export type SignatureControllerOptions = {
  messenger: SignatureControllerMessenger;
  keyringController: KeyringController;
  isEthSignEnabled: () => boolean;
  getState: () => any;
  securityProviderRequest: (
    requestData: any,
    methodName: string,
  ) => Promise<any>;
};

/**
 * Controller for creating signing requests requiring user approval.
 */
export class SignatureController extends BaseControllerV2<
  typeof controllerName,
  SignatureControllerState,
  SignatureControllerMessenger
> {
  hub: EventEmitter;

  private _keyringController: KeyringController;

  private _isEthSignEnabled: () => boolean;

  private _getState: () => any;

  private _messageManager: MessageManager;

  private _personalMessageManager: PersonalMessageManager;

  private _typedMessageManager: TypedMessageManager;

  private _securityProviderRequest: (
    requestData: any,
    methodName: string,
  ) => Promise<any>;

  /**
   * Construct a Sign controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the sign controller.
   * @param options.keyringController - An instance of a keyring controller used to perform the signing operations.
   * @param options.isEthSignEnabled - Callback to return true if eth_sign is enabled.
   * @param options.getState - Callback to retrieve all user state.
   * @param options.securityProviderRequest - A function for verifying a message, whether it is malicious or not.
   */
  constructor({
    messenger,
    keyringController,
    isEthSignEnabled,
    getState,
    securityProviderRequest,
  }: SignatureControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState(),
    });

    this._keyringController = keyringController;
    this._isEthSignEnabled = isEthSignEnabled;
    this._getState = getState;
    this._securityProviderRequest = securityProviderRequest;

    this.hub = new EventEmitter();
    this._messageManager = new MessageManager();
    this._personalMessageManager = new PersonalMessageManager();
    this._typedMessageManager = new TypedMessageManager();

    this._handleMessageManagerEvents(
      this._messageManager,
      methodNameSign,
      'unapprovedMessage',
    );
    this._handleMessageManagerEvents(
      this._personalMessageManager,
      methodNamePersonalSign,
      'unapprovedPersonalMessage',
    );
    this._handleMessageManagerEvents(
      this._typedMessageManager,
      methodNameTypedSign,
      'unapprovedTypedMessage',
    );

    this._subscribeToMessageState(
      this._messageManager,
      (state, newMessages, messageCount) => {
        state.unapprovedMsgs = newMessages;
        state.unapprovedMsgCount = messageCount;
      },
    );

    this._subscribeToMessageState(
      this._personalMessageManager,
      (state, newMessages, messageCount) => {
        state.unapprovedPersonalMsgs = newMessages;
        state.unapprovedPersonalMsgCount = messageCount;
      },
    );

    this._subscribeToMessageState(
      this._typedMessageManager,
      (state, newMessages, messageCount) => {
        state.unapprovedTypedMessages = newMessages;
        state.unapprovedTypedMessagesCount = messageCount;
      },
    );
  }

  /**
   * A getter for the number of 'unapproved' Messages in this.messages.
   *
   * @returns The number of 'unapproved' Messages in this.messages
   */
  get unapprovedMsgCount(): number {
    return this._messageManager.getUnapprovedMessagesCount();
  }

  /**
   * A getter for the number of 'unapproved' PersonalMessages in this.messages.
   *
   * @returns The number of 'unapproved' PersonalMessages in this.messages
   */
  get unapprovedPersonalMessagesCount(): number {
    return this._personalMessageManager.getUnapprovedMessagesCount();
  }

  /**
   * A getter for the number of 'unapproved' TypedMessages in this.messages.
   *
   * @returns The number of 'unapproved' TypedMessages in this.messages
   */
  get unapprovedTypedMessagesCount(): number {
    return this._typedMessageManager.getUnapprovedMessagesCount();
  }

  /**
   * Reset the controller state to the initial state.
   */
  resetState() {
    this.update(() => getDefaultState());
  }

  /**
   * Called when a Dapp uses the eth_sign method, to request user approval.
   * eth_sign is a pure signature of arbitrary data. It is on a deprecation
   * path, since this data can be a transaction, or can leak private key
   * information.
   *
   * @param msgParams - The params passed to eth_sign.
   * @param [req] - The original request, containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedMessage(
    msgParams: MessageParams,
    req: OriginalRequest,
  ): Promise<string> {
    // eslint-disable-next-line camelcase
    if (!this._isEthSignEnabled()) {
      throw ethErrors.rpc.methodNotFound(
        'eth_sign has been disabled. You must enable it in the advanced settings',
      );
    }

    const data = this._normalizeMsgData(msgParams.data);

    // 64 hex + "0x" at the beginning
    // This is needed because Ethereum's EcSign works only on 32 byte numbers
    // For 67 length see: https://github.com/MetaMask/metamask-extension/pull/12679/files#r749479607
    if (data.length !== 66 && data.length !== 67) {
      throw ethErrors.rpc.invalidParams(
        'eth_sign requires 32 byte message hash',
      );
    }

    return this._messageManager.addUnapprovedMessageAsync(msgParams, req);
  }

  /**
   * Called when a dapp uses the personal_sign method.
   * This is identical to the Geth eth_sign method, and may eventually replace
   * eth_sign.
   *
   * We currently define our eth_sign and personal_sign mostly for legacy Dapps.
   *
   * @param msgParams - The params of the message to sign & return to the Dapp.
   * @param req - The original request, containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedPersonalMessage(
    msgParams: PersonalMessageParams,
    req: OriginalRequest,
  ): Promise<string> {
    return this._personalMessageManager.addUnapprovedMessageAsync(
      msgParams,
      req,
    );
  }

  /**
   * Called when a dapp uses the eth_signTypedData method, per EIP 712.
   *
   * @param msgParams - The params passed to eth_signTypedData.
   * @param req - The original request, containing the origin.
   * @param version - The version indicating the format of the typed data.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedTypedMessage(
    msgParams: TypedMessageParams,
    req: OriginalRequest,
    version: string,
  ): Promise<string> {
    return this._typedMessageManager.addUnapprovedMessageAsync(
      msgParams,
      version,
      req,
    );
  }

  /**
   * Signifies user intent to complete an eth_sign method.
   *
   * @param msgParams - The params passed to eth_call.
   * @returns Full state update.
   */
  async signMessage(msgParams: MessageParamsMetamask) {
    return await this._signAbstractMessage(
      this._messageManager,
      methodNameSign,
      msgParams,
      async (cleanMsgParams) =>
        await this._keyringController.signMessage(cleanMsgParams),
    );
  }

  /**
   * Signifies a user's approval to sign a personal_sign message in queue.
   * Triggers signing, and the callback function from newUnsignedPersonalMessage.
   *
   * @param msgParams - The params of the message to sign & return to the Dapp.
   * @returns A full state update.
   */
  async signPersonalMessage(msgParams: PersonalMessageParamsMetamask) {
    return await this._signAbstractMessage(
      this._personalMessageManager,
      methodNamePersonalSign,
      msgParams,
      async (cleanMsgParams) =>
        await this._keyringController.signPersonalMessage(cleanMsgParams),
    );
  }

  /**
   * The method for a user approving a call to eth_signTypedData, per EIP 712.
   * Triggers the callback in newUnsignedTypedMessage.
   *
   * @param msgParams - The params passed to eth_signTypedData.
   * @param opts - Options bag.
   * @param opts.parseJsonData - Whether to parse JSON data before calling the KeyringController.
   * @returns Full state update.
   */
  async signTypedMessage(
    msgParams: TypedMessageParamsMetamask,
    opts: { parseJsonData: boolean } = { parseJsonData: true },
  ): Promise<any> {
    const { version } = msgParams;

    return await this._signAbstractMessage(
      this._typedMessageManager,
      methodNameTypedSign,
      msgParams,
      async (cleanMsgParams) => {
        const finalMessageParams = opts.parseJsonData
          ? this._removeJsonData(cleanMsgParams, version as string)
          : cleanMsgParams;

        return await this._keyringController.signTypedMessage(
          finalMessageParams,
          {
            version,
          },
        );
      },
    );
  }

  /**
   * Used to cancel a message submitted via eth_sign.
   *
   * @param msgId - The id of the message to cancel.
   * @returns A full state update.
   */
  cancelMessage(msgId: string): any {
    return this._cancelAbstractMessage(this._messageManager, msgId);
  }

  /**
   * Used to cancel a personal_sign type message.
   *
   * @param msgId - The ID of the message to cancel.
   * @returns A full state update.
   */
  cancelPersonalMessage(msgId: string): any {
    return this._cancelAbstractMessage(this._personalMessageManager, msgId);
  }

  /**
   * Used to cancel a eth_signTypedData type message.
   *
   * @param msgId - The ID of the message to cancel.
   * @returns A full state update.
   */
  cancelTypedMessage(msgId: string): any {
    return this._cancelAbstractMessage(this._typedMessageManager, msgId);
  }

  /**
   * Reject all unapproved messages of any type.
   *
   * @param reason - A message to indicate why.
   */
  rejectUnapproved(reason?: string) {
    this._rejectUnapproved(this._messageManager, reason);
    this._rejectUnapproved(this._personalMessageManager, reason);
    this._rejectUnapproved(this._typedMessageManager, reason);
  }

  /**
   * Clears all unapproved messages from memory.
   */
  clearUnapproved() {
    this._clearUnapproved(this._messageManager);
    this._clearUnapproved(this._personalMessageManager);
    this._clearUnapproved(this._typedMessageManager);
  }

  private _rejectUnapproved<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(messageManager: AbstractMessageManager<M, P, PM>, reason?: string) {
    Object.keys(messageManager.getUnapprovedMessages()).forEach((messageId) => {
      this._cancelAbstractMessage(messageManager, messageId, reason);
    });
  }

  private _clearUnapproved<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(messageManager: AbstractMessageManager<M, P, PM>) {
    messageManager.update({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  }

  private async _signAbstractMessage<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(
    messageManager: AbstractMessageManager<M, P, PM>,
    methodName: string,
    msgParams: PM,
    getSignature: (cleanMessageParams: P) => Promise<any>,
  ) {
    console.info(`MetaMaskController - ${methodName}`);

    const messageId = msgParams.metamaskId as string;

    try {
      const cleanMessageParams = await messageManager.approveMessage(msgParams);
      const signature = await getSignature(cleanMessageParams);

      messageManager.setMessageStatusSigned(messageId, signature);

      this._acceptApproval(messageId);

      return this._getState();
    } catch (error: any) {
      console.info(`MetaMaskController - ${methodName} failed.`, error);
      this._errorMessage(messageManager, messageId, error.message);
      throw error;
    }
  }

  private _errorMessage<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(
    messageManager: AbstractMessageManager<M, P, PM>,
    messageId: string,
    error: string,
  ) {
    if (messageManager instanceof TypedMessageManager) {
      messageManager.setMessageStatusErrored(messageId, error);
      this._rejectApproval(messageId);
    } else {
      this._cancelAbstractMessage(messageManager, messageId);
    }
  }

  private _cancelAbstractMessage<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(
    messageManager: AbstractMessageManager<M, P, PM>,
    messageId: string,
    reason?: string,
  ) {
    if (reason) {
      const message = this._getMessage(messageId);
      this.hub.emit('cancelWithReason', { message, reason });
    }

    messageManager.rejectMessage(messageId);
    this._rejectApproval(messageId);

    return this._getState();
  }

  private _handleMessageManagerEvents<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(
    messageManager: AbstractMessageManager<M, P, PM>,
    methodName: string,
    eventName: string,
  ) {
    messageManager.hub.on('updateBadge', () => {
      this.hub.emit('updateBadge');
    });

    messageManager.hub.on(
      'unapprovedMessage',
      (msgParams: AbstractMessageParamsMetamask) => {
        this.hub.emit(eventName, msgParams);
        this._requestApproval(msgParams, methodName);
      },
    );
  }

  private _subscribeToMessageState<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(
    messageManager: AbstractMessageManager<M, P, PM>,
    updateState: (
      state: SignatureControllerState,
      newMessages: Record<string, StateMessage>,
      messageCount: number,
    ) => void,
  ) {
    messageManager.subscribe((state: MessageManagerState<AbstractMessage>) => {
      const newMessages = this._migrateMessages(
        state.unapprovedMessages as any,
      );

      this.update((draftState) => {
        updateState(draftState, newMessages, state.unapprovedMessagesCount);
      });
    });
  }

  private _migrateMessages(
    coreMessages: Record<string, CoreMessage>,
  ): Record<string, StateMessage> {
    const stateMessages: Record<string, StateMessage> = {};

    for (const messageId of Object.keys(coreMessages)) {
      const coreMessage = coreMessages[messageId];
      const stateMessage = this._migrateMessage(coreMessage);

      stateMessages[messageId] = stateMessage;
    }

    return stateMessages;
  }

  private _migrateMessage(coreMessage: CoreMessage): StateMessage {
    const { messageParams, ...coreMessageData } = coreMessage;

    // Core message managers use messageParams but frontend uses msgParams with lots of references
    const stateMessage = {
      ...coreMessageData,
      msgParams: messageParams,
    };

    return stateMessage as StateMessage;
  }

  private _normalizeMsgData(data: string) {
    if (data.slice(0, 2) === '0x') {
      // data is already hex
      return data;
    }
    // data is unicode, convert to hex
    return bufferToHex(Buffer.from(data, 'utf8'));
  }

  private _getMessage(messageId: string): StateMessage {
    return {
      ...this.state.unapprovedMsgs,
      ...this.state.unapprovedPersonalMsgs,
      ...this.state.unapprovedTypedMessages,
    }[messageId];
  }

  private _requestApproval(
    msgParams: AbstractMessageParamsMetamask,
    type: string,
  ) {
    const id = msgParams.metamaskId as string;
    const origin = msgParams.origin ?? ORIGIN_METAMASK;

    this.messagingSystem
      .call(
        'ApprovalController:addRequest',
        {
          id,
          origin,
          type,
        },
        true,
      )
      .catch(() => {
        // Intentionally ignored as promise not currently used
      });
  }

  private _acceptApproval(messageId: string) {
    this.messagingSystem.call('ApprovalController:acceptRequest', messageId);
  }

  private _rejectApproval(messageId: string) {
    this.messagingSystem.call(
      'ApprovalController:rejectRequest',
      messageId,
      'Cancel',
    );
  }

  private _removeJsonData(
    messageParams: TypedMessageParams,
    version: string,
  ): TypedMessageParams {
    if (version === 'V1' || typeof messageParams.data !== 'string') {
      return messageParams;
    }

    return {
      ...messageParams,
      data: JSON.parse(messageParams.data),
    };
  }
}
