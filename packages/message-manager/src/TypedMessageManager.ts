import { v1 as random } from 'uuid';

import type {
  AbstractMessage,
  AbstractMessageParams,
  AbstractMessageParamsMetamask,
  OriginalRequest,
} from './AbstractMessageManager';
import { AbstractMessageManager } from './AbstractMessageManager';
import {
  validateTypedSignMessageDataV1,
  validateTypedSignMessageDataV3V4,
} from './utils';

/**
 * @type TypedMessage
 *
 * Represents and contains data about an 'eth_signTypedData' type signature request.
 * These are created when a signature for an eth_signTypedData call is requested.
 * @property id - An id to track and identify the message object
 * @property error - Error corresponding to eth_signTypedData error in failure case
 * @property messageParams - The parameters to pass to the eth_signTypedData method once
 * the signature request is approved
 * @property type - The json-prc signing method for which a signature request has been made.
 * A 'TypedMessage' which always has a 'eth_signTypedData' type
 * @property rawSig - Raw data of the signature request
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TypedMessage extends AbstractMessage {
  error?: string;
  messageParams: TypedMessageParams;
  time: number;
  status: string;
  type: string;
  rawSig?: string;
}

export type SignTypedDataMessageV3V4 = {
  types: Record<string, unknown>;
  domain: Record<string, unknown>;
  primaryType: string;
  message: unknown;
};

/**
 * @type TypedMessageParams
 *
 * Represents the parameters to pass to the eth_signTypedData method once the signature request is approved.
 * @property data - A hex string conversion of the raw buffer or an object containing data of the signature
 * request depending on version
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TypedMessageParams extends AbstractMessageParams {
  data: Record<string, unknown>[] | string | SignTypedDataMessageV3V4;
}

/**
 * @type TypedMessageParamsMetamask
 *
 * Represents the parameters to pass to the eth_signTypedData method once the signature request is approved
 * plus data added by MetaMask.
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - A hex string conversion of the raw buffer or an object containing data of the signature
 * request depending on version
 * @property error? - Added for message errored
 * @property from - Address to sign this message from
 * @property origin? - Added for request origin identification
 * @property version - Compatibility version EIP712
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TypedMessageParamsMetamask
  extends AbstractMessageParamsMetamask {
  data: TypedMessageParams['data'];
  metamaskId?: string;
  error?: string;
  version?: string;
}

/**
 * Controller in charge of managing - storing, adding, removing, updating - TypedMessages.
 */
export class TypedMessageManager extends AbstractMessageManager<
  TypedMessage,
  TypedMessageParams,
  TypedMessageParamsMetamask
> {
  /**
   * Name of this controller used during composition
   */
  override name = 'TypedMessageManager' as const;

  /**
   * Creates a new TypedMessage with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new TypedMessage to this.messages, and to save the
   * unapproved TypedMessages.
   *
   * @param messageParams - The params for the 'eth_signTypedData' call to be made after the message
   * is approved.
   * @param req - The original request object possibly containing the origin.
   * @param version - Compatibility version EIP712.
   * @returns The id of the newly created TypedMessage.
   */
  async addUnapprovedMessage(
    messageParams: TypedMessageParams,
    req?: OriginalRequest,
    version?: string,
  ): Promise<string> {
    if (version === 'V1') {
      validateTypedSignMessageDataV1(messageParams);
    }

    if (version === 'V3' || version === 'V4') {
      const currentChainId = this.getCurrentChainId?.();
      validateTypedSignMessageDataV3V4(messageParams, currentChainId);
    }

    if (
      typeof messageParams.data !== 'string' &&
      (version === 'V3' || version === 'V4')
    ) {
      messageParams.data = JSON.stringify(messageParams.data);
    }

    const messageId = random();
    const messageParamsMetamask = {
      ...messageParams,
      metamaskId: messageId,
      version,
    };
    if (req) {
      messageParams.origin = req.origin;
    }
    const messageData: TypedMessage = {
      id: messageId,
      messageParams,
      securityAlertResponse: req?.securityAlertResponse,
      status: 'unapproved',
      time: Date.now(),
      type: 'eth_signTypedData',
    };
    await this.addMessage(messageData);
    this.hub.emit(`unapprovedMessage`, messageParamsMetamask);
    return messageId;
  }

  /**
   * Sets a TypedMessage status to 'errored' via a call to this.setMessageStatus.
   *
   * @param messageId - The id of the TypedMessage to error.
   * @param error - The error to be included in TypedMessage.
   */
  setMessageStatusErrored(messageId: string, error: string) {
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
   * resolves the updated messageParams.
   *
   * @param messageParams - The messageParams to modify.
   * @returns Promise resolving to the messageParams with the metamaskId and version properties removed.
   */
  prepMessageForSigning(
    messageParams: TypedMessageParamsMetamask,
  ): Promise<TypedMessageParams> {
    // Using delete operation will throw an error on frozen messageParams
    const {
      metamaskId: _metamaskId,
      version: _version,
      ...messageParamsWithoutId
    } = messageParams;
    return Promise.resolve(messageParamsWithoutId);
  }
}

export default TypedMessageManager;
