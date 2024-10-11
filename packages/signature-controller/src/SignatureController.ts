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
import type { TraceCallback, TraceContext } from '@metamask/controller-utils';
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
import {
  SigningMethod,
  LogType,
  SigningStage,
  type AddLog,
} from '@metamask/logging-controller';
import type { Hex, Json } from '@metamask/utils';
import EventEmitter from 'events';
import { v1 as random } from 'uuid';

import { projectLogger as log } from './logger';
import { SignatureRequestStatus, SignatureRequestType } from './types';
import type {
  MessageParamsPersonal,
  MessageParamsTyped,
  OriginalRequest,
  SignatureRequest,
  MessageParams,
  TypedSigningOptions,
} from './types';
import {
  validatePersonalSignatureRequest,
  validateTypedSignatureRequest,
} from './utils/validation';

const controllerName = 'SignatureController';

const stateMetadata = {
  signatureRequests: { persist: false, anonymous: false },
  unapprovedPersonalMsgs: { persist: false, anonymous: false },
  unapprovedTypedMessages: { persist: false, anonymous: false },
  unapprovedPersonalMsgCount: { persist: false, anonymous: false },
  unapprovedTypedMessagesCount: { persist: false, anonymous: false },
};

const getDefaultState = () => ({
  signatureRequests: {},
  unapprovedPersonalMsgs: {},
  unapprovedTypedMessages: {},
  unapprovedPersonalMsgCount: 0,
  unapprovedTypedMessagesCount: 0,
});

export type SignatureControllerState = {
  /**
   * Map of all signature requests including all types and statuses, keyed by ID.
   */
  signatureRequests: Record<string, SignatureRequest>;

  /**
   * Map of personal messages with the unapproved status, keyed by ID.
   * @deprecated - Use `signatureRequests` instead.
   */
  unapprovedPersonalMsgs: Record<string, any>;

  /**
   * Map of typed messages with the unapproved status, keyed by ID.
   * @deprecated - Use `signatureRequests` instead.
   */
  unapprovedTypedMessages: Record<string, any>;

  /**
   * Number of unapproved personal messages.
   * @deprecated - Use `signatureRequests` instead.
   */
  unapprovedPersonalMsgCount: number;

  /**
   * Number of unapproved typed messages.
   * @deprecated - Use `signatureRequests` instead.
   */
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
  /**
   * @deprecated No longer in use.
   */
  getAllState?: () => unknown;

  /**
   * Callback that returns the current chain ID.
   */
  getCurrentChainId: () => Hex;

  /**
   * Restricted controller messenger required by the signature controller.
   */
  messenger: SignatureControllerMessenger;

  /**
   * @deprecated No longer in use.
   */
  securityProviderRequest?: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestData: any,
    methodName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  /**
   * Initial state of the controller.
   */
  state?: SignatureControllerState;

  /**
   * Callback to record the duration of code.
   */
  trace?: TraceCallback;
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

  #trace: TraceCallback;

  /**
   * Construct a Sign controller.
   *
   * @param options - The controller options.
   * @param options.getCurrentChainId - A function that returns the current chain ID.
   * @param options.messenger - The restricted controller messenger for the sign controller.
   * @param options.state - Initial state to set on this controller.
   * @param options.trace - Callback to generate trace information.
   */
  constructor({
    getCurrentChainId,
    messenger,
    state,
    trace,
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
    this.#trace = trace ?? (((_request, fn) => fn?.()) as TraceCallback);
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
    this.#updateState((state) => {
      Object.assign(state, getDefaultState());
    });
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

  /**
   * Called when a dApp uses the personal_sign method.
   * We currently provide personal_sign mostly for legacy dApps.
   *
   * @param messageParams - The params of the message to sign and return to the dApp.
   * @param request - The original request, containing the origin.
   * @param options - An options bag for the method.
   * @param options.traceContext - The parent context for any new traces.
   * @returns Promise resolving to the raw signature hash generated from the signature request.
   */
  async newUnsignedPersonalMessage(
    messageParams: MessageParamsPersonal,
    request: OriginalRequest,
    options: { traceContext?: TraceContext } = {},
  ): Promise<string> {
    validatePersonalSignatureRequest(messageParams);

    messageParams.siwe = detectSIWE(messageParams);

    return this.#processSignatureRequest({
      messageParams,
      request,
      type: SignatureRequestType.PersonalSign,
      approvalType: ApprovalType.PersonalSign,
      traceContext: options.traceContext,
    });
  }

  /**
   * Called when a dapp uses the eth_signTypedData method, per EIP-712.
   *
   * @param messageParams - The params of the message to sign and return to the dApp.
   * @param request - The original request, containing the origin.
   * @param version - The version of the signTypedData request.
   * @param signingOptions - Options for signing the typed message.
   * @param options - An options bag for the method.
   * @param options.traceContext - The parent context for any new traces.
   * @returns Promise resolving to the raw signature hash generated from the signature request.
   */
  async newUnsignedTypedMessage(
    messageParams: MessageParamsTyped,
    request: OriginalRequest,
    version: string,
    signingOptions: TypedSigningOptions,
    options: { traceContext?: TraceContext } = {},
  ): Promise<string> {
    validateTypedSignatureRequest(
      messageParams,
      version as SignTypedDataVersion,
      this.#getCurrentChainId(),
    );

    return this.#processSignatureRequest({
      messageParams,
      request,
      type: SignatureRequestType.TypedSign,
      approvalType: ApprovalType.EthSignTypedData,
      version: version as SignTypedDataVersion,
      signingOptions,
      traceContext: options.traceContext,
    });
  }

  /**
   * Provide a signature for a pending signature request that used `deferSetAsSigned`.
   * Changes the status of the signature request to `signed`.
   *
   * @param signatureRequestId - The ID of the signature request.
   * @param signature - The signature to provide.
   */
  setDeferredSignSuccess(signatureRequestId: string, signature: any) {
    const updatedSignatureRequest = this.#updateMetadata(
      signatureRequestId,
      (draftMetadata) => {
        draftMetadata.signature = signature;
        draftMetadata.status = SignatureRequestStatus.Signed;
      },
    );

    this.hub.emit(`${signatureRequestId}:finished`, updatedSignatureRequest);
  }

  /**
   * Set custom metadata on a signature request.
   * @param signatureRequestId - The ID of the signature request.
   * @param metadata - The custom metadata to set.
   */
  setMessageMetadata(signatureRequestId: string, metadata: Json) {
    this.#updateMetadata(signatureRequestId, (draftMetadata) => {
      draftMetadata.metadata = metadata;
    });
  }

  /**
   * Reject a pending signature request that used `deferSetAsSigned`.
   * Changes the status of the signature request to `rejected`.
   *
   * @param signatureRequestId - The ID of the signature request.
   */
  setDeferredSignError(signatureRequestId: string) {
    const updatedSignatureRequest = this.#updateMetadata(
      signatureRequestId,
      (draftMetadata) => {
        draftMetadata.status = SignatureRequestStatus.Rejected;
      },
    );

    this.hub.emit(`${signatureRequestId}:finished`, updatedSignatureRequest);
  }

  /**
   * Set the status of a signature request to 'inProgress'.
   *
   * @param signatureRequestId - The ID of the signature request.
   */
  setTypedMessageInProgress(signatureRequestId: string) {
    this.#updateMetadata(signatureRequestId, (draftMetadata) => {
      draftMetadata.status = SignatureRequestStatus.InProgress;
    });
  }

  /**
   * Set the status of a signature request to 'inProgress'.
   *
   * @param signatureRequestId - The ID of the signature request.
   */
  setPersonalMessageInProgress(signatureRequestId: string) {
    this.setTypedMessageInProgress(signatureRequestId);
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
    traceContext,
  }: {
    messageParams: MessageParams;
    request: OriginalRequest;
    type: SignatureRequestType;
    approvalType: ApprovalType;
    version?: SignTypedDataVersion;
    signingOptions?: TypedSigningOptions;
    traceContext?: TraceContext;
  }): Promise<string> {
    log('Processing signature request', {
      messageParams,
      request,
      type,
      version,
    });

    this.#addLog(type, version, SigningStage.Proposed, messageParams);

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
        const acceptResult = await this.#trace(
          { name: 'Await Approval', parentContext: traceContext },
          (context) =>
            this.#requestApproval(metadata, approvalType, {
              traceContext: context,
              actionId: request?.id?.toString(),
            }),
        );

        resultCallbacks = acceptResult.resultCallbacks;
      } catch (error) {
        log('User rejected request', metadata.id);

        this.#addLog(type, version, SigningStage.Rejected, messageParams);
        this.#rejectSignatureRequest(metadata.id);

        throw error;
      }

      await this.#approveAndSignRequest(metadata, traceContext);

      const signature = await finishedPromise;

      log('Signature request finished', { id: metadata.id, signature });

      this.#addLog(type, version, SigningStage.Signed, messageParams);

      resultCallbacks?.success(signature);

      return signature;
    } catch (error) {
      log('Signature request failed', error);
      resultCallbacks?.error(error as Error);
      throw error;
    }
  }

  async #approveAndSignRequest(
    metadata: SignatureRequest,
    traceContext?: TraceContext,
  ) {
    const { id } = metadata;

    this.#updateMetadata(id, (draftMetadata) => {
      draftMetadata.status = SignatureRequestStatus.Approved;
    });

    await this.#trace({ name: 'Sign', parentContext: traceContext }, () =>
      this.#signRequest(metadata),
    );
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

        /* istanbul ignore next */
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
    } catch (error: any) {
      if (type === SignatureRequestType.TypedSign) {
        this.#updateMetadata(id, (draftMetadata) => {
          draftMetadata.status = SignatureRequestStatus.Errored;
          draftMetadata.error = error.message;
        });
      } else {
        this.#rejectSignatureRequest(id);
      }

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
        const { request, signature, status, type } = metadata;

        switch (status) {
          case SignatureRequestStatus.Signed:
            return resolve(signature as string);

          case SignatureRequestStatus.Rejected:
            return reject(
              new Error(
                `MetaMask ${type} Signature: User denied message signature.`,
              ),
            );

          /* istanbul ignore next */
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
    {
      traceContext,
      actionId,
    }: { traceContext?: TraceContext; actionId?: string },
  ): Promise<AddResult> {
    const { id, request } = metadata;
    const origin = request.origin || ORIGIN_METAMASK;

    await this.#trace({
      name: 'Notification Display',
      id: actionId,
      parentContext: traceContext,
    });

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

      const unapprovedRequests = Object.values(
        state.signatureRequests as unknown as Record<string, SignatureRequest>,
      ).filter(
        (request) => request.status === SignatureRequestStatus.Unapproved,
      );

      state.unapprovedPersonalMsgs = this.#generateLegacyState(
        unapprovedRequests,
        SignatureRequestType.PersonalSign,
      );

      state.unapprovedTypedMessages = this.#generateLegacyState(
        unapprovedRequests,
        SignatureRequestType.TypedSign,
      );

      state.unapprovedPersonalMsgCount = Object.values(
        state.unapprovedPersonalMsgs,
      ).length;

      state.unapprovedTypedMessagesCount = Object.values(
        state.unapprovedTypedMessages,
      ).length;
    });
  }

  #generateLegacyState(
    unapprovedSignatureRequests: SignatureRequest[],
    type: SignatureRequestType,
  ) {
    return unapprovedSignatureRequests
      .filter((request) => request.type === type)
      .reduce(
        (acc, request) => ({
          ...acc,
          [request.id]: { ...request, msgParams: request.request },
        }),
        {},
      );
  }

  #addLog(
    signatureRequestType: SignatureRequestType,
    version: SignTypedDataVersion | undefined,
    stage: SigningStage,
    signingData: MessageParams,
  ): void {
    const signingMethod = this.#getSignTypeForLogger(
      signatureRequestType,
      version,
    );

    this.messagingSystem.call('LoggingController:add', {
      type: LogType.EthSignLog,
      data: {
        signingMethod,
        stage,
        signingData,
      },
    });
  }

  #getSignTypeForLogger(
    requestType: SignatureRequestType,
    version?: SignTypedDataVersion,
  ): SigningMethod {
    if (requestType === SignatureRequestType.PersonalSign) {
      return SigningMethod.PersonalSign;
    }

    if (
      requestType === SignatureRequestType.TypedSign &&
      version === SignTypedDataVersion.V3
    ) {
      return SigningMethod.EthSignTypedDataV3;
    }

    if (
      requestType === SignatureRequestType.TypedSign &&
      version === SignTypedDataVersion.V4
    ) {
      return SigningMethod.EthSignTypedDataV4;
    }

    return SigningMethod.EthSignTypedData;
  }
}
