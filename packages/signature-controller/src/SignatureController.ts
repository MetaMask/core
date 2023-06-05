import EventEmitter from 'events';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';
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
  AddApprovalRequest,
  RejectRequest,
} from '@metamask/approval-controller';
import { ApprovalType, ORIGIN_METAMASK } from '@metamask/controller-utils';

const controllerName = 'SignatureController';

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
};

type SignatureControllerState = {
  unapprovedMsgs: Record<string, StateMessage>;
  unapprovedPersonalMsgs: Record<string, StateMessage>;
  unapprovedTypedMessages: Record<string, StateMessage>;
  unapprovedMsgCount: number;
  unapprovedPersonalMsgCount: number;
  unapprovedTypedMessagesCount: number;
};

type AllowedActions = AddApprovalRequest | RejectRequest;

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
  getAllState: () => unknown;
  securityProviderRequest?: (
    requestData: any,
    methodName: string,
  ) => Promise<any>;
  getCurrentChainId: () => Hex;
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

  #keyringController: KeyringController;

  #isEthSignEnabled: () => boolean;

  #getAllState: () => any;

  #messageManager: MessageManager;

  #personalMessageManager: PersonalMessageManager;

  #typedMessageManager: TypedMessageManager;

  /**
   * Construct a Sign controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the sign controller.
   * @param options.keyringController - An instance of a keyring controller used to perform the signing operations.
   * @param options.isEthSignEnabled - Callback to return true if eth_sign is enabled.
   * @param options.getAllState - Callback to retrieve all user state.
   * @param options.securityProviderRequest - A function for verifying a message, whether it is malicious or not.
   * @param options.getCurrentChainId - A function for retrieving the current chainId.
   */
  constructor({
    messenger,
    keyringController,
    isEthSignEnabled,
    getAllState,
    securityProviderRequest,
    getCurrentChainId,
  }: SignatureControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState(),
    });

    this.#keyringController = keyringController;
    this.#isEthSignEnabled = isEthSignEnabled;
    this.#getAllState = getAllState;

    this.hub = new EventEmitter();
    this.#messageManager = new MessageManager(
      undefined,
      undefined,
      securityProviderRequest,
    );
    this.#personalMessageManager = new PersonalMessageManager(
      undefined,
      undefined,
      securityProviderRequest,
    );
    this.#typedMessageManager = new TypedMessageManager(
      undefined,
      undefined,
      securityProviderRequest,
      undefined,
      getCurrentChainId,
    );

    this.#handleMessageManagerEvents(this.#messageManager, 'unapprovedMessage');
    this.#handleMessageManagerEvents(
      this.#personalMessageManager,
      'unapprovedPersonalMessage',
    );
    this.#handleMessageManagerEvents(
      this.#typedMessageManager,
      'unapprovedTypedMessage',
    );

    this.#subscribeToMessageState(
      this.#messageManager,
      (state, newMessages, messageCount) => {
        state.unapprovedMsgs = newMessages;
        state.unapprovedMsgCount = messageCount;
      },
    );

    this.#subscribeToMessageState(
      this.#personalMessageManager,
      (state, newMessages, messageCount) => {
        state.unapprovedPersonalMsgs = newMessages;
        state.unapprovedPersonalMsgCount = messageCount;
      },
    );

    this.#subscribeToMessageState(
      this.#typedMessageManager,
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
    return this.#messageManager.getUnapprovedMessagesCount();
  }

  /**
   * A getter for the number of 'unapproved' PersonalMessages in this.messages.
   *
   * @returns The number of 'unapproved' PersonalMessages in this.messages
   */
  get unapprovedPersonalMessagesCount(): number {
    return this.#personalMessageManager.getUnapprovedMessagesCount();
  }

  /**
   * A getter for the number of 'unapproved' TypedMessages in this.messages.
   *
   * @returns The number of 'unapproved' TypedMessages in this.messages
   */
  get unapprovedTypedMessagesCount(): number {
    return this.#typedMessageManager.getUnapprovedMessagesCount();
  }

  /**
   * Reset the controller state to the initial state.
   */
  resetState() {
    this.update(() => getDefaultState());
  }

  /**
   * Reject all unapproved messages of any type.
   *
   * @param reason - A message to indicate why.
   */
  rejectUnapproved(reason?: string) {
    this.#rejectUnapproved(this.#messageManager, reason);
    this.#rejectUnapproved(this.#personalMessageManager, reason);
    this.#rejectUnapproved(this.#typedMessageManager, reason);
  }

  /**
   * Clears all unapproved messages from memory.
   */
  clearUnapproved() {
    this.#clearUnapproved(this.#messageManager);
    this.#clearUnapproved(this.#personalMessageManager);
    this.#clearUnapproved(this.#typedMessageManager);
  }

  /**
   * Called when a Dapp uses the eth_sign method, to request user approval.
   * eth_sign is a pure signature of arbitrary data. It is on a deprecation
   * path, since this data can be a transaction, or can leak private key
   * information.
   *
   * @param messageParams - The params passed to eth_sign.
   * @param [req] - The original request, containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedMessage(
    messageParams: MessageParams,
    req: OriginalRequest,
  ): Promise<string> {
    if (!this.#isEthSignEnabled()) {
      throw ethErrors.rpc.methodNotFound(
        'eth_sign has been disabled. You must enable it in the advanced settings',
      );
    }

    const data = this.#normalizeMsgData(messageParams.data);

    // 64 hex + "0x" at the beginning
    // This is needed because Ethereum's EcSign works only on 32 byte numbers
    // For 67 length see: https://github.com/MetaMask/metamask-extension/pull/12679/files#r749479607
    if (data.length !== 66 && data.length !== 67) {
      throw ethErrors.rpc.invalidParams(
        'eth_sign requires 32 byte message hash',
      );
    }
    const messageId = await this.#messageManager.addUnapprovedMessage(
      messageParams,
      req,
    );

    const messageParamsWithId = {
      ...messageParams,
      metamaskId: messageId,
    };

    const signaturePromise =
      this.#messageManager.waitForFinishStatus(messageParamsWithId);

    try {
      await this.#requestApproval(messageParamsWithId, ApprovalType.EthSign);
    } catch (error) {
      this.#cancelAbstractMessage(this.#messageManager, messageId);
      throw ethErrors.provider.userRejectedRequest(
        'User rejected the request.',
      );
    }

    await this.#signMessage(cloneDeep(messageParamsWithId));

    return signaturePromise;
  }

  /**
   * Called when a dapp uses the personal_sign method.
   * This is identical to the Geth eth_sign method, and may eventually replace
   * eth_sign.
   *
   * We currently define our eth_sign and personal_sign mostly for legacy Dapps.
   *
   * @param messageParams - The params of the message to sign & return to the Dapp.
   * @param req - The original request, containing the origin.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedPersonalMessage(
    messageParams: PersonalMessageParams,
    req: OriginalRequest,
  ): Promise<string> {
    const messageId = await this.#personalMessageManager.addUnapprovedMessage(
      messageParams,
      req,
    );

    const messageParamsWithId = {
      ...messageParams,
      metamaskId: messageId,
    };

    const signaturePromise =
      this.#personalMessageManager.waitForFinishStatus(messageParamsWithId);

    try {
      await this.#requestApproval(
        messageParamsWithId,
        ApprovalType.PersonalSign,
      );
    } catch (error) {
      this.#cancelAbstractMessage(this.#personalMessageManager, messageId);
      throw ethErrors.provider.userRejectedRequest(
        'User rejected the request.',
      );
    }
    await this.#signPersonalMessage(cloneDeep(messageParamsWithId));
    return signaturePromise;
  }

  /**
   * Called when a dapp uses the eth_signTypedData method, per EIP 712.
   *
   * @param messageParams - The params passed to eth_signTypedData.
   * @param req - The original request, containing the origin.
   * @param version - The version indicating the format of the typed data.
   * @param opts - An options bag.
   * @param opts.parseJsonData - Whether to parse the JSON before signing.
   * @returns Promise resolving to the raw data of the signature request.
   */
  async newUnsignedTypedMessage(
    messageParams: TypedMessageParams,
    req: OriginalRequest,
    version: string,
    opts: { parseJsonData: boolean } = { parseJsonData: true },
  ): Promise<string> {
    const messageId = await this.#typedMessageManager.addUnapprovedMessage(
      messageParams,
      version,
      req,
    );

    const messageParamsWithId = {
      ...messageParams,
      metamaskId: messageId,
    };

    const signaturePromise =
      this.#typedMessageManager.waitForFinishStatus(messageParamsWithId);

    try {
      await this.#requestApproval(
        messageParamsWithId,
        ApprovalType.EthSignTypedData,
      );
    } catch (error) {
      this.#cancelAbstractMessage(this.#typedMessageManager, messageId);
      throw ethErrors.provider.userRejectedRequest(
        'User rejected the request.',
      );
    }
    await this.#signTypedMessage(cloneDeep(messageParamsWithId), version, opts);

    return signaturePromise;
  }

  setTypedMessageInProgress(messageId: string) {
    this.#typedMessageManager.setMessageStatusInProgress(messageId);
  }

  setPersonalMessageInProgress(messageId: string) {
    this.#personalMessageManager.setMessageStatusInProgress(messageId);
  }

  /**
   * Signifies user intent to complete an eth_sign method.
   *
   * @param msgParams - The params passed to eth_call.
   * @returns Signature result from signing.
   */
  async #signMessage(msgParams: MessageParamsMetamask) {
    return await this.#signAbstractMessage(
      this.#messageManager,
      ApprovalType.EthSign,
      msgParams,
      async (cleanMsgParams) =>
        await this.#keyringController.signMessage(cleanMsgParams),
    );
  }

  /**
   * Signifies a user's approval to sign a personal_sign message in queue.
   * Triggers signing, and the callback function from newUnsignedPersonalMessage.
   *
   * @param msgParams - The params of the message to sign & return to the Dapp.
   * @returns Signature result from signing.
   */
  async #signPersonalMessage(msgParams: PersonalMessageParamsMetamask) {
    return await this.#signAbstractMessage(
      this.#personalMessageManager,
      ApprovalType.PersonalSign,
      msgParams,
      async (cleanMsgParams) =>
        await this.#keyringController.signPersonalMessage(cleanMsgParams),
    );
  }

  /**
   * The method for a user approving a call to eth_signTypedData, per EIP 712.
   * Triggers the callback in newUnsignedTypedMessage.
   *
   * @param msgParams - The params passed to eth_signTypedData.
   * @param version - The version indicating the format of the typed data.
   * @param opts - The options for the method.
   * @param opts.parseJsonData - Whether to parse JSON data before calling the KeyringController.
   * @returns Signature result from signing.
   */
  async #signTypedMessage(
    msgParams: TypedMessageParamsMetamask,
    version: string,
    opts: { parseJsonData: boolean },
  ): Promise<any> {
    return await this.#signAbstractMessage(
      this.#typedMessageManager,
      ApprovalType.EthSignTypedData,
      msgParams,
      async (cleanMsgParams) => {
        const finalMessageParams = opts.parseJsonData
          ? this.#removeJsonData(cleanMsgParams, version as string)
          : cleanMsgParams;

        return await this.#keyringController.signTypedMessage(
          finalMessageParams,
          {
            version,
          },
        );
      },
    );
  }

  #rejectUnapproved<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(messageManager: AbstractMessageManager<M, P, PM>, reason?: string) {
    Object.keys(messageManager.getUnapprovedMessages()).forEach((messageId) => {
      this.#cancelAbstractMessage(messageManager, messageId, reason);
    });
  }

  #clearUnapproved<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(messageManager: AbstractMessageManager<M, P, PM>) {
    messageManager.update({
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    });
  }

  async #signAbstractMessage<
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

      this.hub.emit(`${methodName}:signed`, { signature, messageId });

      if (!cleanMessageParams.deferSetAsSigned) {
        messageManager.setMessageStatusSigned(messageId, signature);
      }

      return signature;
    } catch (error: any) {
      console.info(`MetaMaskController - ${methodName} failed.`, error);
      throw error;
    }
  }

  #cancelAbstractMessage<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(
    messageManager: AbstractMessageManager<M, P, PM>,
    messageId: string,
    reason?: string,
  ) {
    if (reason) {
      const message = this.#getMessage(messageId);
      this.hub.emit('cancelWithReason', { message, reason });
    }
    messageManager.rejectMessage(messageId);
  }

  #handleMessageManagerEvents<
    M extends AbstractMessage,
    P extends AbstractMessageParams,
    PM extends AbstractMessageParamsMetamask,
  >(messageManager: AbstractMessageManager<M, P, PM>, eventName: string) {
    messageManager.hub.on('updateBadge', () => {
      this.hub.emit('updateBadge');
    });

    messageManager.hub.on(
      'unapprovedMessage',
      (msgParams: AbstractMessageParamsMetamask) => {
        this.hub.emit(eventName, msgParams);
      },
    );
  }

  #subscribeToMessageState<
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
      const newMessages = this.#migrateMessages(
        state.unapprovedMessages as any,
      );

      this.update(() => {
        const newState = { ...this.state };
        updateState(newState, newMessages, state.unapprovedMessagesCount);
        return newState;
      });
    });
  }

  #migrateMessages(
    coreMessages: Record<string, CoreMessage>,
  ): Record<string, StateMessage> {
    const stateMessages: Record<string, StateMessage> = {};

    for (const messageId of Object.keys(coreMessages)) {
      const coreMessage = coreMessages[messageId];
      const stateMessage = this.#migrateMessage(coreMessage);

      stateMessages[messageId] = stateMessage;
    }

    return stateMessages;
  }

  #migrateMessage(coreMessage: CoreMessage): StateMessage {
    const { messageParams, ...coreMessageData } = coreMessage;

    // Core message managers use messageParams but frontend uses msgParams with lots of references
    const stateMessage = {
      ...coreMessageData,
      msgParams: messageParams,
    };

    return stateMessage as StateMessage;
  }

  #normalizeMsgData(data: string) {
    if (data.slice(0, 2) === '0x') {
      // data is already hex
      return data;
    }
    // data is unicode, convert to hex
    return bufferToHex(Buffer.from(data, 'utf8'));
  }

  #getMessage(messageId: string): StateMessage {
    return {
      ...this.state.unapprovedMsgs,
      ...this.state.unapprovedPersonalMsgs,
      ...this.state.unapprovedTypedMessages,
    }[messageId];
  }

  async #requestApproval(
    msgParams: AbstractMessageParamsMetamask,
    type: ApprovalType,
  ) {
    const id = msgParams.metamaskId as string;
    const origin = msgParams.origin || ORIGIN_METAMASK;

    return this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id,
        origin,
        type,
        requestData: msgParams as Required<AbstractMessageParamsMetamask>,
      },
      true,
    );
  }

  #removeJsonData(
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
