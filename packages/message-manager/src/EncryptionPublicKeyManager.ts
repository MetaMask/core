import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { ApprovalType } from '@metamask/controller-utils';

import type {
  AbstractMessage,
  AbstractMessageParams,
  AbstractMessageParamsMetamask,
  MessageManagerState,
  OriginalRequest,
  SecurityProviderRequest,
} from './AbstractMessageManager';
import { AbstractMessageManager } from './AbstractMessageManager';
import { validateEncryptionPublicKeyMessageData } from './utils';

const controllerName = 'EncryptionPublicKeyManager';

export type EncryptionPublicKeyManagerState =
  MessageManagerState<EncryptionPublicKey>;

export type GetEncryptionPublicKeyState = ControllerGetStateAction<
  typeof controllerName,
  EncryptionPublicKeyManagerState
>;

export type EncryptionPublicKeyManagerStateChange = ControllerStateChangeEvent<
  typeof controllerName,
  EncryptionPublicKeyManagerState
>;

export type EncryptionPublicKeyManagerActions = GetEncryptionPublicKeyState;

export type EncryptionPublicKeyManagerEvents =
  EncryptionPublicKeyManagerStateChange;

type AllowedActions = never;

export type EncryptionPublicKeyManagerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  EncryptionPublicKeyManagerActions | AllowedActions,
  EncryptionPublicKeyManagerEvents,
  AllowedActions['type'],
  never
>;

type EncryptionPublicKeyManagerOptions = {
  messenger: EncryptionPublicKeyManagerMessenger;
  state?: MessageManagerState<EncryptionPublicKey>;
  securityProviderRequest?: SecurityProviderRequest;
  additionalFinishStatuses?: string[];
};

/**
 * @type EncryptionPublicKey
 *
 * Represents and contains data about a 'eth_getEncryptionPublicKey' type request.
 * These are created when an encryption public key is requested.
 * @property id - An id to track and identify the message object
 * @property messageParams - The parameters to pass to the eth_getEncryptionPublicKey method once the request is approved
 * @property type - The json-prc method for which an encryption public key request has been made.
 * A 'Message' which always has a 'eth_getEncryptionPublicKey' type
 * @property rawSig - Encryption public key
 */
export type EncryptionPublicKey = AbstractMessage & {
  messageParams: EncryptionPublicKeyParams;
};

/**
 * @type EncryptionPublicKeyParams
 *
 * Represents the parameters to pass to the method once the request is approved.
 * @property from - Address from which to extract the encryption public key
 * @property origin? - Added for request origin identification
 */
export type EncryptionPublicKeyParams = AbstractMessageParams;

/**
 * @type MessageParamsMetamask
 *
 * Represents the parameters to pass to the eth_getEncryptionPublicKey method once the request is approved
 * plus data added by MetaMask.
 * @property metamaskId - Added for tracking and identification within MetaMask
 * @property data - Encryption public key
 * @property from - Address from which to extract the encryption public key
 * @property origin? - Added for request origin identification
 */
export type EncryptionPublicKeyParamsMetamask =
  AbstractMessageParamsMetamask & {
    data: string;
  };

/**
 * Controller in charge of managing - storing, adding, removing, updating - Messages.
 */
export class EncryptionPublicKeyManager extends AbstractMessageManager<
  EncryptionPublicKey,
  EncryptionPublicKeyParams,
  EncryptionPublicKeyParamsMetamask,
  EncryptionPublicKeyManagerActions,
  EncryptionPublicKeyManagerEvents
> {
  constructor({
    messenger,
    state,
    securityProviderRequest,
    additionalFinishStatuses,
  }: EncryptionPublicKeyManagerOptions) {
    super({
      messenger,
      name: controllerName,
      state,
      securityProviderRequest,
      additionalFinishStatuses,
    });
  }

  /**
   * Creates a new Message with an 'unapproved' status using the passed messageParams.
   * this.addMessage is called to add the new Message to this.messages, and to save the unapproved Messages.
   *
   * @param messageParams - The params for the eth_getEncryptionPublicKey call to be made after the message is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns Promise resolving to the raw data of the request.
   */
  async addUnapprovedMessageAsync(
    messageParams: EncryptionPublicKeyParams,
    req?: OriginalRequest,
  ): Promise<string> {
    validateEncryptionPublicKeyMessageData(messageParams);
    const messageId = await this.addUnapprovedMessage(messageParams, req);

    return new Promise((resolve, reject) => {
      this.hub.once(`${messageId}:finished`, (data: EncryptionPublicKey) => {
        switch (data.status) {
          case 'received':
            return resolve(data.rawSig as string);
          case 'rejected':
            return reject(
              new Error(
                'MetaMask EncryptionPublicKey: User denied message EncryptionPublicKey.',
              ),
            );
          default:
            return reject(
              new Error(
                `MetaMask EncryptionPublicKey: Unknown problem: ${JSON.stringify(
                  messageParams,
                )}`,
              ),
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
   * @param messageParams - The params for the eth_getEncryptionPublicKey call to be made after the message
   * is approved.
   * @param req - The original request object possibly containing the origin.
   * @returns The id of the newly created message.
   */
  async addUnapprovedMessage(
    messageParams: EncryptionPublicKeyParams,
    req?: OriginalRequest,
  ): Promise<string> {
    const updatedMessageParams = this.addRequestToMessageParams(
      messageParams,
      req,
    ) satisfies EncryptionPublicKeyParams;

    const messageData = this.createUnapprovedMessage(
      updatedMessageParams,
      ApprovalType.EthGetEncryptionPublicKey,
      req,
    ) satisfies EncryptionPublicKey;

    const messageId = messageData.id;

    await this.addMessage(messageData);
    this.hub.emit(`unapprovedMessage`, {
      ...updatedMessageParams,
      metamaskId: messageId,
    });
    return messageId;
  }

  /**
   * Removes the metamaskId property from passed messageParams and returns a promise which
   * resolves the updated messageParams.
   *
   * @param messageParams - The messageParams to modify.
   * @returns Promise resolving to the messageParams with the metamaskId property removed.
   */
  prepMessageForSigning(
    messageParams: EncryptionPublicKeyParamsMetamask,
  ): Promise<EncryptionPublicKeyParams> {
    delete messageParams.metamaskId;
    return Promise.resolve({ from: messageParams.data });
  }
}

export default EncryptionPublicKeyManager;
