import { EventEmitter } from 'events';
import {
  BaseController,
  BaseConfig,
  BaseState,
} from '@metamask/base-controller';
import { Json } from '@metamask/controller-utils';

/**
 * @type OriginalRequest
 *
 * Represents the original request object for adding a message.
 * @property origin? - Is it is specified, represents the origin
 */
export interface OriginalRequest {
  origin?: string;
}

/**
 * @type Message
 *
 * Represents and contains data about a signing type signature request.
 * @property id - An id to track and identify the message object
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'Message' which always has a signing type
 * @property securityProviderResponse - Response from a security provider, whether it is malicious or not
 */
export interface AbstractMessage {
  id: string;
  time: number;
  status: string;
  type: string;
  rawSig?: string;
  securityProviderResponse?: Map<string, Json>;
  error?: string;
}

/**
 * @type MessageParams
 *
 * Represents the parameters to pass to the signing method once the signature request is approved.
 * @property from - Address from which the message is processed
 * @property origin? - Added for request origin identification
 */
export interface AbstractMessageParams {
  from: string;
  origin?: string;
}

/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the signing method once the signature request is approved
 * plus data added by MetaMask.
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property from - Address from which the message is processed
 * @property origin? - Added for request origin identification
 */
export interface AbstractMessageParamsMetamask extends AbstractMessageParams {
  metamaskId?: string;
}

/**
 * @type MessageManagerState
 *
 * Message Manager state
 * @property unapprovedMessages - A collection of all Messages in the 'unapproved' state
 * @property unapprovedMessagesCount - The count of all Messages in this.unapprovedMessages
 */
export interface MessageManagerState<M extends AbstractMessage>
  extends BaseState {
  unapprovedMessages: { [key: string]: M };
  unapprovedMessagesCount: number;
}

/**
 * A function for verifying a message, whether it is malicious or not
 */
export type SecurityProviderRequest = (
  requestData: AbstractMessage,
  messageType: string,
) => Promise<Json>;

/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export abstract class AbstractMessageManager<
  M extends AbstractMessage,
  P extends AbstractMessageParams,
  PM extends AbstractMessageParamsMetamask,
> extends BaseController<BaseConfig, MessageManagerState<M>> {
  protected messages: M[];

  private securityProviderRequest: SecurityProviderRequest | undefined;

  private additionalFinishStatuses: string[];

  /**
   * Saves the unapproved messages, and their count to state.
   *
   */
  protected saveMessageList() {
    const unapprovedMessages = this.getUnapprovedMessages();
    const unapprovedMessagesCount = this.getUnapprovedMessagesCount();
    this.update({ unapprovedMessages, unapprovedMessagesCount });
    this.hub.emit('updateBadge');
  }

  /**
   * Updates the status of a Message in this.messages.
   *
   * @param messageId - The id of the Message to update.
   * @param status - The new status of the Message.
   */
  protected setMessageStatus(messageId: string, status: string) {
    const message = this.getMessage(messageId);
    if (!message) {
      throw new Error(`${this.name}: Message not found for id: ${messageId}.`);
    }
    message.status = status;
    this.updateMessage(message);
    this.hub.emit(`${messageId}:${status}`, message);
    if (
      status === 'rejected' ||
      status === 'signed' ||
      status === 'errored' ||
      this.additionalFinishStatuses.includes(status)
    ) {
      this.hub.emit(`${messageId}:finished`, message);
    }
  }

  /**
   * Sets a Message in this.messages to the passed Message if the ids are equal.
   * Then saves the unapprovedMessage list to storage.
   *
   * @param message - A Message that will replace an existing Message (with the id) in this.messages.
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
   * Verifies a message is malicious or not by checking it against a security provider.
   *
   * @param message - The message to verify.
   * @returns A promise that resolves to a secured message with additional security provider response data.
   */
  private async securityCheck(message: M): Promise<M> {
    if (this.securityProviderRequest) {
      const securityProviderResponse = await this.securityProviderRequest(
        message,
        message.type,
      );
      return {
        ...message,
        securityProviderResponse,
      };
    }
    return message;
  }

  /**
   * EventEmitter instance used to listen to specific message events
   */
  hub = new EventEmitter();

  /**
   * Name of this controller used during composition
   */
  override name = 'AbstractMessageManager';

  /**
   * Creates an AbstractMessageManager instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   * @param securityProviderRequest - A function for verifying a message, whether it is malicious or not.
   * @param additionalFinishStatuses - Optional list of statuses that are accepted to emit a finished event.
   */
  constructor(
    config?: Partial<BaseConfig>,
    state?: Partial<MessageManagerState<M>>,
    securityProviderRequest?: SecurityProviderRequest,
    additionalFinishStatuses?: string[],
  ) {
    super(config, state);
    this.defaultState = {
      unapprovedMessages: {},
      unapprovedMessagesCount: 0,
    };
    this.messages = [];
    this.securityProviderRequest = securityProviderRequest;
    this.additionalFinishStatuses = additionalFinishStatuses ?? [];
    this.initialize();
  }

  /**
   * A getter for the number of 'unapproved' Messages in this.messages.
   *
   * @returns The number of 'unapproved' Messages in this.messages.
   */
  getUnapprovedMessagesCount() {
    return Object.keys(this.getUnapprovedMessages()).length;
  }

  /**
   * A getter for the 'unapproved' Messages in state messages.
   *
   * @returns An index of Message ids to Messages, for all 'unapproved' Messages in this.messages.
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
   * @param message - The Message to add to this.messages.
   */
  async addMessage(message: M) {
    const securedMessage = await this.securityCheck(message);
    this.messages.push(securedMessage);
    this.saveMessageList();
  }

  /**
   * Returns a specified Message.
   *
   * @param messageId - The id of the Message to get.
   * @returns The Message with the id that matches the passed messageId, or undefined
   * if no Message has that id.
   */
  getMessage(messageId: string) {
    return this.messages.find((message) => message.id === messageId);
  }

  /**
   * Approves a Message. Sets the message status via a call to this.setMessageStatusApproved,
   * and returns a promise with any the message params modified for proper signing.
   *
   * @param messageParams - The messageParams to be used when signing method is called,
   * plus data added by MetaMask.
   * @returns Promise resolving to the messageParams with the metamaskId property removed.
   */
  approveMessage(messageParams: PM): Promise<P> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.setMessageStatusApproved(messageParams.metamaskId);
    return this.prepMessageForSigning(messageParams);
  }

  /**
   * Sets a Message status to 'approved' via a call to this.setMessageStatus.
   *
   * @param messageId - The id of the Message to approve.
   */
  setMessageStatusApproved(messageId: string) {
    this.setMessageStatus(messageId, 'approved');
  }

  /**
   * Sets a Message status to 'signed' via a call to this.setMessageStatus and updates
   * that Message in this.messages by adding the raw signature data of the signature
   * request to the Message.
   *
   * @param messageId - The id of the Message to sign.
   * @param rawSig - The raw data of the signature request.
   */
  setMessageStatusSigned(messageId: string, rawSig: string) {
    this.setMessageStatusAndResult(messageId, rawSig, 'signed');
  }

  /**
   * Sets the message via a call to this.setResult and updates status of the message.
   *
   * @param messageId - The id of the Message to sign.
   * @param rawSig - The data to update rawSig in the message.
   * @param status - The new message status.
   */
  setMessageStatusAndResult(messageId: string, rawSig: string, status: string) {
    this.setResult(messageId, rawSig);
    this.setMessageStatus(messageId, status);
  }

  /**
   * Sets the message result.
   *
   * @param messageId - The id of the Message to sign.
   * @param rawSig - The data to update rawSig in the message.
   */
  setResult(messageId: string, rawSig: string) {
    const message = this.getMessage(messageId);
    /* istanbul ignore if */
    if (!message) {
      return;
    }
    message.rawSig = rawSig;
    this.updateMessage(message);
  }

  /**
   * Removes the metamaskId property from passed messageParams and returns a promise which
   * resolves the updated messageParams
   *
   * @param messageParams - The messageParams to modify
   * @returns Promise resolving to the messageParams with the metamaskId property removed
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

export default AbstractMessageManager;
