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
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
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
  LegacyStateMessage,
  StateSIWEMessage,
} from './types';
import { DECODING_API_ERRORS, decodeSignature } from './utils/decoding-api';
import {
  normalizePersonalMessageParams,
  normalizeTypedMessageParams,
} from './utils/normalize';
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

/** List of statuses that will not be updated and trigger the finished event. */
const FINAL_STATUSES: SignatureRequestStatus[] = [
  SignatureRequestStatus.Signed,
  SignatureRequestStatus.Rejected,
  SignatureRequestStatus.Errored,
];

export type SignatureControllerState = {
  /**
   * Map of all signature requests including all types and statuses, keyed by ID.
   */
  signatureRequests: Record<string, SignatureRequest>;

  /**
   * Map of personal messages with the unapproved status, keyed by ID.
   * @deprecated - Use `signatureRequests` instead.
   */
  unapprovedPersonalMsgs: Record<string, LegacyStateMessage>;

  /**
   * Map of typed messages with the unapproved status, keyed by ID.
   * @deprecated - Use `signatureRequests` instead.
   */
  unapprovedTypedMessages: Record<string, LegacyStateMessage>;

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
  | AddLog
  | NetworkControllerGetNetworkClientByIdAction;

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
   * Api used to get decoding data for permits.
   */
  decodingApiUrl?: string;

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

  #decodingApiUrl?: string;

  #trace: TraceCallback;

  /**
   * Construct a Sign controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the sign controller.
   * @param options.state - Initial state to set on this controller.
   * @param options.trace - Callback to generate trace information.
   * @param options.decodingApiUrl - Api used to get decoded data for permits.
   */
  constructor({
    decodingApiUrl,
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
    this.#trace = trace ?? (((_request, fn) => fn?.()) as TraceCallback);
    this.#decodingApiUrl = decodingApiUrl;
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

    const normalizedMessageParams =
      normalizePersonalMessageParams(messageParams);

    normalizedMessageParams.siwe = detectSIWE(
      messageParams,
    ) as StateSIWEMessage;

    return this.#processSignatureRequest({
      messageParams: normalizedMessageParams,
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
    signingOptions?: TypedSigningOptions,
    options: { traceContext?: TraceContext } = {},
  ): Promise<string> {
    const chainId = this.#getChainId(request);

    validateTypedSignatureRequest(
      messageParams,
      version as SignTypedDataVersion,
      chainId,
    );

    const normalizedMessageParams = normalizeTypedMessageParams(
      messageParams,
      version as SignTypedDataVersion,
    );

    return this.#processSignatureRequest({
      approvalType: ApprovalType.EthSignTypedData,
      messageParams: normalizedMessageParams,
      request,
      signingOptions,
      traceContext: options.traceContext,
      type: SignatureRequestType.TypedSign,
      version: version as SignTypedDataVersion,
    });
  }

  /**
   * Provide a signature for a pending signature request that used `deferSetAsSigned`.
   * Changes the status of the signature request to `signed`.
   *
   * @param signatureRequestId - The ID of the signature request.
   * @param signature - The signature to provide.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDeferredSignSuccess(signatureRequestId: string, signature: any) {
    this.#updateMetadata(signatureRequestId, (draftMetadata) => {
      draftMetadata.rawSig = signature;
      draftMetadata.status = SignatureRequestStatus.Signed;
    });
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
    this.#updateMetadata(signatureRequestId, (draftMetadata) => {
      draftMetadata.status = SignatureRequestStatus.Rejected;
    });
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
    chainId: optionChainId,
    messageParams,
    request,
    type,
    approvalType,
    version,
    signingOptions,
    traceContext,
  }: {
    chainId?: Hex;
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

    const chainId = optionChainId ?? this.#getChainId(request);

    this.#addLog(type, version, SigningStage.Proposed, messageParams);

    const metadata = this.#addMetadata({
      chainId,
      messageParams,
      request,
      signingOptions,
      type,
      version,
    });

    let resultCallbacks: AcceptResultCallbacks | undefined;
    let approveOrSignError: unknown;

    const finalMetadataPromise = this.#waitForFinished(metadata.id);
    this.#decodePermitSignatureRequest(metadata.id, request, chainId);

    try {
      resultCallbacks = await this.#processApproval({
        approvalType,
        metadata,
        request,
        traceContext,
      });

      await this.#approveAndSignRequest(metadata, traceContext);
    } catch (error) {
      log('Signature request failed', error);
      approveOrSignError = error;
    }

    const finalMetadata = await finalMetadataPromise;

    const {
      error,
      id,
      messageParams: finalMessageParams,
      rawSig: signature,
    } = finalMetadata;

    switch (finalMetadata.status) {
      case SignatureRequestStatus.Signed:
        log('Signature request finished', { id, signature });
        this.#addLog(type, version, SigningStage.Signed, finalMessageParams);
        resultCallbacks?.success(signature);
        return finalMetadata.rawSig as string;

      case SignatureRequestStatus.Rejected:
        /* istanbul ignore next */
        const rejectedError = (approveOrSignError ??
          new Error(
            `MetaMask ${type} Signature: User denied message signature.`,
          )) as Error;

        resultCallbacks?.error(rejectedError);
        throw rejectedError;

      case SignatureRequestStatus.Errored:
        /* istanbul ignore next */
        const erroredError = (approveOrSignError ??
          new Error(`MetaMask ${type} Signature: ${error as string}`)) as Error;

        resultCallbacks?.error(erroredError);
        throw erroredError;

      /* istanbul ignore next */
      default:
        throw new Error(
          `MetaMask ${type} Signature: Unknown problem: ${JSON.stringify(
            finalMessageParams,
          )}`,
        );
    }
  }

  #addMetadata({
    chainId,
    messageParams,
    request,
    signingOptions,
    type,
    version,
  }: {
    chainId: Hex;
    messageParams: MessageParams;
    request?: OriginalRequest;
    signingOptions?: TypedSigningOptions;
    type: SignatureRequestType;
    version?: SignTypedDataVersion;
  }): SignatureRequest {
    const id = random();
    const origin = request?.origin ?? messageParams.origin;
    const requestId = request?.id;
    const securityAlertResponse = request?.securityAlertResponse;
    const networkClientId = request?.networkClientId;

    const finalMessageParams = {
      ...messageParams,
      metamaskId: id,
      origin,
      requestId,
      version,
    };

    const metadata = {
      chainId,
      id: random(),
      messageParams: finalMessageParams,
      networkClientId,
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

    log('Added signature request', metadata);

    this.hub.emit('unapprovedMessage', {
      messageParams,
      metamaskId: metadata.id,
    });

    return metadata;
  }

  async #processApproval({
    approvalType,
    metadata,
    request,
    traceContext,
  }: {
    approvalType: ApprovalType;
    metadata: SignatureRequest;
    request?: OriginalRequest;
    traceContext?: TraceContext;
  }): Promise<AcceptResultCallbacks | undefined> {
    const { id, messageParams, type, version } = metadata;

    try {
      const acceptResult = await this.#trace(
        { name: 'Await Approval', parentContext: traceContext },
        (context) =>
          this.#requestApproval(metadata, approvalType, {
            traceContext: context,
            actionId: request?.id?.toString(),
          }),
      );

      return acceptResult.resultCallbacks;
    } catch (error) {
      log('User rejected request', { id, error });

      this.#addLog(type, version, SigningStage.Rejected, messageParams);
      this.#rejectSignatureRequest(id);

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
    const { id, messageParams, signingOptions, type } = metadata;

    try {
      let signature: string;

      switch (type) {
        case SignatureRequestType.PersonalSign:
          signature = await this.messagingSystem.call(
            'KeyringController:signPersonalMessage',
            // Keyring controller temporarily using message manager types.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messageParams as any,
          );
          break;

        case SignatureRequestType.TypedSign:
          const finalRequest = signingOptions?.parseJsonData
            ? this.#parseTypedData(messageParams, metadata.version)
            : messageParams;

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

      if (messageParams.deferSetAsSigned) {
        return;
      }

      this.#updateMetadata(id, (draftMetadata) => {
        draftMetadata.rawSig = signature;
        draftMetadata.status = SignatureRequestStatus.Signed;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (type === SignatureRequestType.TypedSign) {
        this.#errorSignatureRequest(id, error.message);
      } else {
        this.#rejectSignatureRequest(id);
      }

      this.hub.emit(`${id}:signError`, { error });

      throw error;
    }
  }

  #errorSignatureRequest(id: string, error: string) {
    this.#updateMetadata(id, (draftMetadata) => {
      draftMetadata.status = SignatureRequestStatus.Errored;
      draftMetadata.error = error;
    });
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

  async #waitForFinished(id: string): Promise<SignatureRequest> {
    return new Promise((resolve) => {
      this.hub.once(`${id}:finished`, (metadata: SignatureRequest) => {
        resolve(metadata);
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
    const { id, messageParams } = metadata;
    const origin = messageParams.origin || ORIGIN_METAMASK;

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
        requestData: { ...messageParams },
        expectsResult: true,
      },
      true,
    )) as Promise<AddResult>;
  }

  #updateMetadata(
    id: string,
    callback: (metadata: SignatureRequest) => void,
  ): SignatureRequest {
    let statusChanged = false;

    const { nextState } = this.#updateState((state) => {
      const metadata = state.signatureRequests[id];

      if (!metadata) {
        throw new Error(`Signature request with id ${id} not found`);
      }

      const originalStatus = metadata.status;

      // eslint-disable-next-line n/callback-return
      callback(metadata);

      statusChanged = metadata.status !== originalStatus;
    });

    const updatedMetadata = nextState.signatureRequests[id];

    if (
      statusChanged &&
      FINAL_STATUSES.includes(updatedMetadata.status as SignatureRequestStatus)
    ) {
      this.hub.emit(`${id}:finished`, updatedMetadata);
    }

    return updatedMetadata;
  }

  #updateState(callback: (state: SignatureControllerState) => void) {
    return this.update((state) => {
      // eslint-disable-next-line n/callback-return, n/no-callback-literal
      callback(state as unknown as SignatureControllerState);

      const unapprovedRequests = Object.values(state.signatureRequests).filter(
        (request) => request.status === SignatureRequestStatus.Unapproved,
      ) as unknown as SignatureRequest[];

      const personalSignMessages = this.#generateLegacyState(
        unapprovedRequests,
        SignatureRequestType.PersonalSign,
      );

      const typedSignMessages = this.#generateLegacyState(
        unapprovedRequests,
        SignatureRequestType.TypedSign,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state.unapprovedPersonalMsgs = personalSignMessages as any;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state.unapprovedTypedMessages = typedSignMessages as any;

      state.unapprovedPersonalMsgCount =
        Object.values(personalSignMessages).length;

      state.unapprovedTypedMessagesCount =
        Object.values(typedSignMessages).length;
    });
  }

  #generateLegacyState(
    signatureRequests: SignatureRequest[],
    type: SignatureRequestType,
  ): Record<string, LegacyStateMessage> {
    return signatureRequests
      .filter((request) => request.type === type)
      .reduce<Record<string, LegacyStateMessage>>(
        (acc, request) => ({
          ...acc,
          [request.id]: { ...request, msgParams: request.messageParams },
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

  #getChainId(request: OriginalRequest): Hex {
    const { networkClientId } = request;

    if (!networkClientId) {
      throw new Error('Network client ID not found in request');
    }

    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    return networkClient.configuration.chainId;
  }

  #decodePermitSignatureRequest(
    signatureRequestId: string,
    request: OriginalRequest,
    chainId: string,
  ) {
    this.#updateMetadata(signatureRequestId, (draftMetadata) => {
      draftMetadata.decodingLoading = true;
    });
    decodeSignature(request, chainId, this.#decodingApiUrl)
      .then((decodingData) =>
        this.#updateMetadata(signatureRequestId, (draftMetadata) => {
          draftMetadata.decodingData = decodingData;
          draftMetadata.decodingLoading = false;
        }),
      )
      .catch((error) =>
        this.#updateMetadata(signatureRequestId, (draftMetadata) => {
          draftMetadata.decodingData = {
            stateChanges: null,
            error: {
              message: (error as unknown as Error).message,
              type: DECODING_API_ERRORS.DECODING_FAILED_WITH_ERROR,
            },
          };
          draftMetadata.decodingLoading = false;
        }),
      );
  }
}
