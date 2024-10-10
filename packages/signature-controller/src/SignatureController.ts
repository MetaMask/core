/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AddApprovalRequest,
  AcceptResultCallbacks,
  AddResult,
} from '@metamask/approval-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  ApprovalType,
  detectSIWE,
  ORIGIN_METAMASK,
} from '@metamask/controller-utils';
import type {
  KeyringControllerSignMessageAction,
  KeyringControllerSignPersonalMessageAction,
  KeyringControllerSignTypedMessageAction,
} from '@metamask/keyring-controller';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type { AddLog } from '@metamask/logging-controller';
import { providerErrors } from '@metamask/rpc-errors';
import type { Hex, Json } from '@metamask/utils';
import EventEmitter from 'events';
import { v1 as random } from 'uuid';

import { projectLogger as log } from './logger';
import { SignatureRequestStatus, SignatureRequestType } from './types';
import type {
  MessageParamsPersonal,
  MessageParamsTyped,
  JsonRequest,
  SignatureRequest,
  MessageParams,
  TypedSigningOptions,
} from './types';
import {
  validatePersonalSignatureRequest,
  validateTypedSignatureRequest,
} from './validation';

const controllerName = 'SignatureController';

const stateMetadata = {
  signatureRequests: { persist: false, anonymous: false },
  // Legacy + Generated
  unapprovedPersonalMsgs: { persist: false, anonymous: false },
  unapprovedTypedMessages: { persist: false, anonymous: false },
  unapprovedPersonalMsgCount: { persist: false, anonymous: false },
  unapprovedTypedMessagesCount: { persist: false, anonymous: false },
};

const getDefaultState = () => ({
  signatureRequests: {},
  // Legacy + Generated
  unapprovedPersonalMsgs: {},
  unapprovedTypedMessages: {},
  unapprovedPersonalMsgCount: 0,
  unapprovedTypedMessagesCount: 0,
});

export type SignatureControllerState = {
  signatureRequests: Record<string, SignatureRequest>;
  // Legacy + Generated
  unapprovedPersonalMsgs: Record<string, any>;
  unapprovedTypedMessages: Record<string, any>;
  unapprovedPersonalMsgCount: number;
  unapprovedTypedMessagesCount: number;
};

type AllowedActions =
  | AddApprovalRequest
  | KeyringControllerSignMessageAction
  | KeyringControllerSignPersonalMessageAction
  | KeyringControllerSignTypedMessageAction
  | AddLog;

export type GetSignatureState = ControllerGetStateAction<
  typeof controllerName,
  SignatureControllerState
>;

export type SignatureStateChange = ControllerStateChangeEvent<
  typeof controllerName,
  SignatureControllerState
>;

export type SignatureControllerActions = GetSignatureState;

export type SignatureControllerEvents = SignatureStateChange;

export type SignatureControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  SignatureControllerActions | AllowedActions,
  SignatureControllerEvents,
  AllowedActions['type'],
  never
>;

export type SignatureControllerOptions = {
  getAllState?: () => unknown;
  getCurrentChainId: () => Hex;
  messenger: SignatureControllerMessenger;
  securityProviderRequest?: (
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestData: any,
    methodName: string,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;
  state?: SignatureControllerState;
};

/**
 * Controller for creating signing requests requiring user approval.
 */
export class SignatureController extends BaseController<
  typeof controllerName,
  SignatureControllerState,
  SignatureControllerMessenger
> {
  hub: EventEmitter;

  #getCurrentChainId: () => Hex;

  /**
   * Construct a Sign controller.
   *
   * @param options - The controller options.
   * @param options.getCurrentChainId - A function that returns the current chain ID.
   * @param options.messenger - The restricted controller messenger for the sign controller.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    getCurrentChainId,
    messenger,
    state,
  }: SignatureControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: {
        ...getDefaultState(),
        ...state,
      },
    });

    this.hub = new EventEmitter();
    this.#getCurrentChainId = getCurrentChainId;
  }

  /**
   * A getter for the number of 'unapproved' PersonalMessages in this.messages.
   * @deprecated Use `signatureRequests` state instead.
   * @returns The number of 'unapproved' PersonalMessages in this.messages
   */
  get unapprovedPersonalMessagesCount(): number {
    return this.state.unapprovedPersonalMsgCount;
  }

  /**
   * A getter for the number of 'unapproved' TypedMessages in this.messages.
   * @deprecated Use `signatureRequests` state instead.
   * @returns The number of 'unapproved' TypedMessages in this.messages
   */
  get unapprovedTypedMessagesCount(): number {
    return this.state.unapprovedTypedMessagesCount;
  }

  /**
   * A getter for returning all messages.
   * @deprecated Use `signatureRequests` state instead.
   * @returns The object containing all messages.
   */
  get messages(): { [id: string]: SignatureRequest } {
    return this.state.signatureRequests;
  }

  /**
   * Reset the controller state to the initial state.
   */
  resetState() {
    this.#updateState(() => getDefaultState());
  }

  /**
   * Reject all unapproved messages of any type.
   *
   * @param reason - A message to indicate why.
   */
  rejectUnapproved(reason?: string) {
    const unapprovedSignatureRequests = Object.values(
      this.state.signatureRequests,
    ).filter(
      (metadata) => metadata.status === SignatureRequestStatus.Unapproved,
    );

    for (const metadata of unapprovedSignatureRequests) {
      this.#rejectSignatureRequest(metadata.id, reason);
    }
  }

  /**
   * Clears all unapproved messages from memory.
   */
  clearUnapproved() {
    this.#updateState((state) => {
      Object.values(state.signatureRequests)
        .filter(
          (metadata) => metadata.status === SignatureRequestStatus.Unapproved,
        )
        .forEach((metadata) => delete state.signatureRequests[metadata.id]);
    });
  }

  async newUnsignedPersonalMessage(
    messageParams: MessageParamsPersonal,
    request: JsonRequest,
  ): Promise<string> {
    validatePersonalSignatureRequest(messageParams);

    messageParams.siwe = detectSIWE(messageParams);

    return this.#processSignatureRequest({
      messageParams,
      request,
      type: SignatureRequestType.PersonalSign,
      approvalType: ApprovalType.PersonalSign,
    });
  }

  async newUnsignedTypedMessage(
    messageParams: MessageParamsTyped,
    request: JsonRequest,
    version: SignTypedDataVersion,
    signingOptions: TypedSigningOptions,
  ): Promise<string> {
    validateTypedSignatureRequest(
      messageParams,
      version,
      this.#getCurrentChainId(),
    );

    return this.#processSignatureRequest({
      messageParams,
      request,
      type: SignatureRequestType.TypedSign,
      approvalType: ApprovalType.EthSignTypedData,
      version,
      signingOptions,
    });
  }

  setDeferredSignSuccess(_messageId: string, _signature: any) {
    throw new Error('Method not implemented.');
  }

  setMessageMetadata(_messageId: string, _metadata: Json) {
    throw new Error('Method not implemented.');
  }

  setDeferredSignError(_messageId: string) {
    throw new Error('Method not implemented.');
  }

  setTypedMessageInProgress(_messageId: string) {
    throw new Error('Method not implemented.');
  }

  setPersonalMessageInProgress(_messageId: string) {
    throw new Error('Method not implemented.');
  }

  #parseTypedData(
    messageParams: MessageParamsTyped,
    version?: SignTypedDataVersion,
  ): MessageParamsTyped {
    if (
      ![SignTypedDataVersion.V3, SignTypedDataVersion.V4].includes(
        version as SignTypedDataVersion,
      ) ||
      typeof messageParams.data !== 'string'
    ) {
      return messageParams;
    }

    return {
      ...messageParams,
      data: JSON.parse(messageParams.data),
    };
  }

  async #processSignatureRequest({
    messageParams,
    request,
    type,
    approvalType,
    version,
    signingOptions,
  }: {
    messageParams: MessageParams;
    request: JsonRequest;
    type: SignatureRequestType;
    approvalType: ApprovalType;
    version?: SignTypedDataVersion;
    signingOptions?: TypedSigningOptions;
  }): Promise<string> {
    log('Processing signature request', {
      messageParams,
      request,
      type,
      version,
    });

    const { securityAlertResponse } = request;

    const finalMessageParams = {
      ...messageParams,
      origin: request.origin,
      requestId: request.id,
    };

    let resultCallbacks: AcceptResultCallbacks | undefined;

    try {
      const metadata = {
        id: random(),
        request: finalMessageParams,
        securityAlertResponse,
        signingOptions,
        status: SignatureRequestStatus.Unapproved,
        time: Date.now(),
        type,
        version,
      } as SignatureRequest;

      this.#updateState((state) => {
        state.signatureRequests[metadata.id] = metadata;
      });

      this.hub.emit('unapprovedMessage', {
        messageParams,
        metamaskId: metadata.id,
      });

      const finishedPromise = this.#waitForSignatureRequestFinished(
        metadata.id,
      );

      try {
        const acceptResult = await this.#requestApproval(
          metadata,
          approvalType,
        );

        resultCallbacks = acceptResult.resultCallbacks;
      } catch {
        log('User rejected request', metadata.id);

        this.#rejectSignatureRequest(metadata.id);

        throw providerErrors.userRejectedRequest('User rejected the request.');
      }

      await this.#approveAndSignRequest(metadata);

      const signature = await finishedPromise;

      log('Signature request finished', metadata.id, signature);

      resultCallbacks?.success(signature);

      return signature;
    } catch (error) {
      log('Signature request failed', error);
      resultCallbacks?.error(error as Error);
      throw error;
    }
  }

  async #approveAndSignRequest(metadata: SignatureRequest) {
    const { id } = metadata;

    try {
      this.#updateMetadata(id, (draftMetadata) => {
        draftMetadata.status = SignatureRequestStatus.Approved;
      });

      await this.#signRequest(metadata);
    } catch (error) {
      this.#rejectSignatureRequest(id);
      throw error;
    }
  }

  async #signRequest(metadata: SignatureRequest) {
    const { id, request, signingOptions, type } = metadata;

    try {
      let signature: string;

      switch (type) {
        case SignatureRequestType.PersonalSign:
          signature = await this.messagingSystem.call(
            'KeyringController:signPersonalMessage',
            request,
          );
          break;

        case SignatureRequestType.TypedSign:
          const finalRequest = signingOptions?.parseJsonData
            ? this.#parseTypedData(request, metadata.version)
            : request;

          signature = await this.messagingSystem.call(
            'KeyringController:signTypedMessage',
            finalRequest,
            metadata.version as SignTypedDataVersion,
          );
          break;

        default:
          throw new Error(`Unknown signature request type: ${type as string}`);
      }

      this.hub.emit(`${type}:signed`, { signature, messageId: id });

      if (request.deferSetAsSigned) {
        return;
      }

      const finalMetadata = this.#updateMetadata(id, (draftMetadata) => {
        draftMetadata.signature = signature;
        draftMetadata.status = SignatureRequestStatus.Signed;
      });

      this.hub.emit(`${id}:finished`, finalMetadata);
    } catch (error) {
      this.hub.emit(`${id}:signError`, { error });
      throw error;
    }
  }

  #rejectSignatureRequest(signatureRequestId: string, reason?: string) {
    if (reason) {
      const metadata = this.state.signatureRequests[signatureRequestId];
      this.hub.emit('cancelWithReason', { metadata, reason });
    }

    this.#updateMetadata(signatureRequestId, (draftMetadata) => {
      draftMetadata.status = SignatureRequestStatus.Rejected;
    });
  }

  async #waitForSignatureRequestFinished(id: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.hub.once(`${id}:finished`, (metadata: SignatureRequest) => {
        const { error, request, signature, status, type } = metadata;

        switch (status) {
          case SignatureRequestStatus.Signed:
            return resolve(signature as string);

          case SignatureRequestStatus.Rejected:
            return reject(
              new Error(
                `MetaMask ${type} Signature: User denied message signature.`,
              ),
            );

          case SignatureRequestStatus.Errored:
            return reject(
              new Error(`MetaMask ${type} Signature: ${error as string}`),
            );

          default:
            return reject(
              new Error(
                `MetaMask ${type} Signature: Unknown problem: ${JSON.stringify(
                  request,
                )}`,
              ),
            );
        }
      });
    });
  }

  async #requestApproval(
    metadata: SignatureRequest,
    type: ApprovalType,
  ): Promise<AddResult> {
    const { id, request } = metadata;
    const origin = request.origin || ORIGIN_METAMASK;

    return (await this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id,
        origin,
        type,
        requestData: { ...request } as any,
        expectsResult: true,
      },
      true,
    )) as Promise<AddResult>;
  }

  #updateMetadata(
    id: string,
    callback: (metadata: SignatureRequest) => void,
  ): SignatureRequest {
    const { nextState } = this.#updateState((state) => {
      const metadata = state.signatureRequests[id];

      if (!metadata) {
        throw new Error(`Signature request with id ${id} not found`);
      }

      callback(metadata);
    });

    return nextState.signatureRequests[id];
  }

  #updateState(callback: (state: SignatureControllerState) => void) {
    return this.update((state) => {
      // eslint-disable-next-line n/callback-return, n/no-callback-literal
      callback(state as any);

      const unapprovedRequests = Object.values(state.signatureRequests).filter(
        (request) => request.status === SignatureRequestStatus.Unapproved,
      );

      state.unapprovedPersonalMsgs = unapprovedRequests
        .filter((request) => request.type === 'personal_sign')
        .reduce(
          (acc, request) => ({
            ...acc,
            [request.id]: { ...request, msgParams: request.request },
          }),
          {},
        );

      state.unapprovedPersonalMsgCount = Object.values(
        state.unapprovedPersonalMsgs,
      ).length;

      state.unapprovedTypedMessages = unapprovedRequests
        .filter((request) => request.type === 'eth_signTypedData')
        .reduce(
          (acc, request) => ({
            ...acc,
            [request.id]: { ...request, msgParams: request.request },
          }),
          {},
        );

      state.unapprovedTypedMessagesCount = Object.values(
        state.unapprovedTypedMessages,
      ).length;
    });
  }
}
