import type { ControllerGetStateAction } from '@metamask/base-controller';
import {
  BaseController,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import type { JsonRpcError, DataWithOptionalCause } from '@metamask/rpc-errors';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Json, OptionalField } from '@metamask/utils';
import { nanoid } from 'nanoid';

import {
  ApprovalRequestNotFoundError,
  ApprovalRequestNoResultSupportError,
  EndInvalidFlowError,
  NoApprovalFlowsError,
  MissingApprovalFlowError,
} from './errors';

// Constants

// Avoiding dependency on controller-utils
export const ORIGIN_METAMASK = 'metamask';
export const APPROVAL_TYPE_RESULT_ERROR = 'result_error';
export const APPROVAL_TYPE_RESULT_SUCCESS = 'result_success';

const controllerName = 'ApprovalController';

const stateMetadata = {
  pendingApprovals: { persist: false, anonymous: true },
  pendingApprovalCount: { persist: false, anonymous: false },
  approvalFlows: { persist: false, anonymous: false },
};

const getAlreadyPendingMessage = (origin: string, type: string) =>
  `Request of type '${type}' already pending for origin ${origin}. Please wait.`;

const getDefaultState = (): ApprovalControllerState => {
  return {
    pendingApprovals: {},
    pendingApprovalCount: 0,
    approvalFlows: [],
  };
};

// Internal Types

type ApprovalPromiseResolve = (value?: unknown | AddResult) => void;

type ApprovalPromiseReject = (error?: unknown) => void;

type ApprovalRequestData = Record<string, Json> | null;

type ApprovalRequestState = Record<string, Json> | null;

type ApprovalCallbacks = {
  resolve: ApprovalPromiseResolve;
  reject: ApprovalPromiseReject;
};

type ApprovalFlow = {
  id: string;
  loadingText: string | null;
};

type ResultOptions = {
  flowToEnd?: string;
  header?: (string | ResultComponent)[];
  icon?: string | null;
  title?: string | null;
};

// Miscellaneous Types

export type ApprovalRequest<RequestData extends ApprovalRequestData> = {
  /**
   * The ID of the approval request.
   */
  id: string;

  /**
   * The origin of the approval request.
   */
  origin: string;

  /**
   * The time that the request was received, per Date.now().
   */
  time: number;

  /**
   * The type of the approval request.
   * Unfortunately, not all values will match the `ApprovalType` enum, so we are using `string` here.
   * TODO: Replace `string` with `ApprovalType` when all `type` values used by the clients can be encompassed by the `ApprovalType` enum.
   */
  type: string;

  /**
   * Additional data associated with the request.
   */
  requestData: RequestData;

  /**
   * Additional mutable state associated with the request
   */
  requestState: ApprovalRequestState;

  /**
   * Whether the request expects a result object to be returned instead of just the approval value.
   */
  expectsResult: boolean;
};

export type ApprovalFlowState = ApprovalFlow;

export type ApprovalControllerState = {
  pendingApprovals: Record<string, ApprovalRequest<Record<string, Json>>>;
  pendingApprovalCount: number;
  approvalFlows: ApprovalFlowState[];
};

export type ApprovalControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  ApprovalControllerActions,
  ApprovalControllerEvents,
  never,
  never
>;

// Option Types

export type ShowApprovalRequest = () => void | Promise<void>;

export type ResultComponent = {
  /**
   * A unique identifier for this instance of the component.
   */
  key: string;

  /**
   * The name of the component to render.
   */
  name: string;

  /**
   * Any properties required by the component.
   */
  properties?: Record<string, unknown>;

  /**
   * Any child components to render inside the component.
   */
  children?: string | ResultComponent | (string | ResultComponent)[];
};

export type ApprovalControllerOptions = {
  messenger: ApprovalControllerMessenger;
  showApprovalRequest: ShowApprovalRequest;
  state?: Partial<ApprovalControllerState>;
  typesExcludedFromRateLimiting?: string[];
};

export type AddApprovalOptions = {
  id?: string;
  origin: string;
  type: string;
  requestData?: Record<string, Json>;
  requestState?: Record<string, Json>;
  expectsResult?: boolean;
};

export type UpdateRequestStateOptions = {
  id: string;
  requestState: Record<string, Json>;
};

export type AcceptOptions = {
  /**
   * Whether to resolve the returned promise only when the request creator indicates the success of the
   * post-approval logic using the result callbacks.
   * If false or unspecified, the promise will resolve immediately.
   */
  waitForResult?: boolean;
};

export type StartFlowOptions = OptionalField<
  ApprovalFlow,
  'id' | 'loadingText'
> & { show?: boolean };

export type EndFlowOptions = Pick<ApprovalFlow, 'id'>;

export type SetFlowLoadingTextOptions = ApprovalFlow;

export type SuccessOptions = ResultOptions & {
  message?: string | ResultComponent | (string | ResultComponent)[];
};

export type ErrorOptions = ResultOptions & {
  error?: string | ResultComponent | (string | ResultComponent)[];
};

// Result Types

export type AcceptResultCallbacks = {
  /**
   * Inform the request acceptor that the post-approval logic was successful.
   *
   * @param value - An optional value generated by the post-approval logic.
   */
  success: (value?: unknown) => void;

  /**
   * Inform the request acceptor that the post-approval logic failed.
   *
   * @param error - The reason for the failure.
   */
  error: (error: Error) => void;
};

export type AddResult = {
  /**
   * An optional value provided by the request acceptor.
   */
  value?: unknown;

  /**
   * Callback functions that must be used to indicate to the request acceptor whether the post-approval logic was successful or not.
   * Will be undefined if the request acceptor did not specify that they want to wait for a result.
   */
  resultCallbacks?: AcceptResultCallbacks;
};

export type AcceptResult = {
  /**
   * An optional value provided by the request creator when indicating a successful result.
   */
  value?: unknown;
};

export type ApprovalFlowStartResult = ApprovalFlow;

export type SuccessResult = Record<string, never>;

export type ErrorResult = Record<string, never>;

// Event Types

export type ApprovalStateChange = ControllerStateChangeEvent<
  typeof controllerName,
  ApprovalControllerState
>;

export type ApprovalControllerEvents = ApprovalStateChange;

// Action Types

export type GetApprovalsState = ControllerGetStateAction<
  typeof controllerName,
  ApprovalControllerState
>;

export type ClearApprovalRequests = {
  type: `${typeof controllerName}:clearRequests`;
  handler: (error: JsonRpcError<DataWithOptionalCause>) => void;
};

export type AddApprovalRequest = {
  type: `${typeof controllerName}:addRequest`;
  handler: (
    opts: AddApprovalOptions,
    shouldShowRequest: boolean,
  ) => ReturnType<ApprovalController['add']>;
};

export type HasApprovalRequest = {
  type: `${typeof controllerName}:hasRequest`;
  handler: ApprovalController['has'];
};

export type AcceptRequest = {
  type: `${typeof controllerName}:acceptRequest`;
  handler: ApprovalController['accept'];
};

export type RejectRequest = {
  type: `${typeof controllerName}:rejectRequest`;
  handler: ApprovalController['reject'];
};

export type UpdateRequestState = {
  type: `${typeof controllerName}:updateRequestState`;
  handler: ApprovalController['updateRequestState'];
};

export type StartFlow = {
  type: `${typeof controllerName}:startFlow`;
  handler: ApprovalController['startFlow'];
};

export type EndFlow = {
  type: `${typeof controllerName}:endFlow`;
  handler: ApprovalController['endFlow'];
};

export type SetFlowLoadingText = {
  type: `${typeof controllerName}:setFlowLoadingText`;
  handler: ApprovalController['setFlowLoadingText'];
};

export type ShowSuccess = {
  type: `${typeof controllerName}:showSuccess`;
  handler: ApprovalController['success'];
};

export type ShowError = {
  type: `${typeof controllerName}:showError`;
  handler: ApprovalController['error'];
};

export type ApprovalControllerActions =
  | GetApprovalsState
  | ClearApprovalRequests
  | AddApprovalRequest
  | HasApprovalRequest
  | AcceptRequest
  | RejectRequest
  | UpdateRequestState
  | StartFlow
  | EndFlow
  | SetFlowLoadingText
  | ShowSuccess
  | ShowError;

/**
 * Controller for managing requests that require user approval.
 *
 * Enables limiting the number of pending requests by origin and type, counting
 * pending requests, and more.
 *
 * Adding a request returns a promise that resolves or rejects when the request
 * is approved or denied, respectively.
 */
export class ApprovalController extends BaseController<
  typeof controllerName,
  ApprovalControllerState,
  ApprovalControllerMessenger
> {
  #approvals: Map<string, ApprovalCallbacks>;

  #origins: Map<string, Map<string, number>>;

  #showApprovalRequest: () => void;

  #typesExcludedFromRateLimiting: string[];

  /**
   * Construct an Approval controller.
   *
   * @param options - The controller options.
   * @param options.showApprovalRequest - Function for opening the UI such that
   * the request can be displayed to the user.
   * @param options.messenger - The restricted controller messenger for the Approval controller.
   * @param options.state - The initial controller state.
   * @param options.typesExcludedFromRateLimiting - Array of approval types which allow multiple pending approval requests from the same origin.
   */
  constructor({
    messenger,
    showApprovalRequest,
    state = {},
    typesExcludedFromRateLimiting = [],
  }: ApprovalControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.#approvals = new Map();
    this.#origins = new Map();
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#showApprovalRequest = showApprovalRequest;
    this.#typesExcludedFromRateLimiting = typesExcludedFromRateLimiting;
    this.registerMessageHandlers();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  private registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:clearRequests` as const,
      this.clear.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:addRequest` as const,
      (opts: AddApprovalOptions, shouldShowRequest: boolean) => {
        if (shouldShowRequest) {
          return this.addAndShowApprovalRequest(opts);
        }
        return this.add(opts);
      },
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:hasRequest` as const,
      this.has.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:acceptRequest` as const,
      this.accept.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:rejectRequest` as const,
      this.reject.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:updateRequestState` as const,
      this.updateRequestState.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:startFlow` as const,
      this.startFlow.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:endFlow` as const,
      this.endFlow.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setFlowLoadingText` as const,
      this.setFlowLoadingText.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:showSuccess` as const,
      this.success.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:showError` as const,
      this.error.bind(this),
    );
  }

  /**
   * Adds an approval request per the given arguments, calls the show approval
   * request function, and returns the associated approval promise resolving to
   * an AddResult object.
   *
   * There can only be one approval per origin and type. An error is thrown if
   * attempting to add an invalid or duplicate request.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request. A random id will be
   * generated if none is provided.
   * @param opts.origin - The origin of the approval request.
   * @param opts.type - The type associated with the approval request.
   * @param opts.requestData - Additional data associated with the request,
   * @param opts.requestState - Additional state associated with the request,
   * if any.
   * @returns The approval promise resolving to an AddResult object.
   */
  addAndShowApprovalRequest(
    opts: AddApprovalOptions & { expectsResult: true },
  ): Promise<AddResult>;

  /**
   * Adds an approval request per the given arguments, calls the show approval
   * request function, and returns the associated approval promise resolving
   * to a value provided during acceptance.
   *
   * There can only be one approval per origin and type. An error is thrown if
   * attempting to add an invalid or duplicate request.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request. A random id will be
   * generated if none is provided.
   * @param opts.origin - The origin of the approval request.
   * @param opts.type - The type associated with the approval request.
   * @param opts.requestData - Additional data associated with the request,
   * @param opts.requestState - Additional state associated with the request,
   * if any.
   * @returns The approval promise resolving to a value provided during acceptance.
   */
  addAndShowApprovalRequest(opts: AddApprovalOptions): Promise<unknown>;

  addAndShowApprovalRequest(opts: AddApprovalOptions): Promise<unknown> {
    const promise = this.#add(
      opts.origin,
      opts.type,
      opts.id,
      opts.requestData,
      opts.requestState,
      opts.expectsResult,
    );
    this.#showApprovalRequest();
    return promise;
  }

  /**
   * Adds an approval request per the given arguments and returns the approval
   * promise resolving to an AddResult object.
   *
   * There can only be one approval per origin and type. An error is thrown if
   * attempting to add an invalid or duplicate request.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request. A random id will be
   * generated if none is provided.
   * @param opts.origin - The origin of the approval request.
   * @param opts.type - The type associated with the approval request.
   * @param opts.requestData - Additional data associated with the request,
   * if any.
   * @returns The approval promise resolving to an AddResult object.
   */
  add(opts: AddApprovalOptions & { expectsResult: true }): Promise<AddResult>;

  /**
   * Adds an approval request per the given arguments and returns the approval
   * promise resolving to a value provided during acceptance.
   *
   * There can only be one approval per origin and type. An error is thrown if
   * attempting to add an invalid or duplicate request.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request. A random id will be
   * generated if none is provided.
   * @param opts.origin - The origin of the approval request.
   * @param opts.type - The type associated with the approval request.
   * @param opts.requestData - Additional data associated with the request,
   * if any.
   * @returns The approval promise resolving to a value provided during acceptance.
   */
  add(opts: AddApprovalOptions): Promise<unknown>;

  add(opts: AddApprovalOptions): Promise<unknown | AddResult> {
    return this.#add(
      opts.origin,
      opts.type,
      opts.id,
      opts.requestData,
      opts.requestState,
      opts.expectsResult,
    );
  }

  /**
   * Gets the info for the approval request with the given id.
   *
   * @param id - The id of the approval request.
   * @returns The approval request data associated with the id.
   */
  get(id: string): ApprovalRequest<ApprovalRequestData> | undefined {
    return this.state.pendingApprovals[id];
  }

  /**
   * Gets the number of pending approvals, by origin and/or type.
   *
   * If only `origin` is specified, all approvals for that origin will be
   * counted, regardless of type.
   * If only `type` is specified, all approvals for that type will be counted,
   * regardless of origin.
   * If both `origin` and `type` are specified, 0 or 1 will be returned.
   *
   * @param opts - The approval count options.
   * @param opts.origin - An approval origin.
   * @param opts.type - The type of the approval request.
   * @returns The current approval request count for the given origin and/or
   * type.
   */
  getApprovalCount(opts: { origin?: string; type?: string } = {}): number {
    if (!opts.origin && !opts.type) {
      throw new Error('Must specify origin, type, or both.');
    }
    const { origin, type: _type } = opts;

    if (origin && _type) {
      return this.#origins.get(origin)?.get(_type) || 0;
    }

    if (origin) {
      return Array.from(
        (this.#origins.get(origin) || new Map()).values(),
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      ).reduce((total, value) => total + value, 0);
    }

    // Only "type" was specified
    let count = 0;
    for (const approval of Object.values(this.state.pendingApprovals)) {
      if (approval.type === _type) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Get the total count of all pending approval requests for all origins.
   *
   * @returns The total pending approval request count.
   */
  getTotalApprovalCount(): number {
    return this.state.pendingApprovalCount;
  }

  /**
   * Checks if there's a pending approval request per the given parameters.
   * At least one parameter must be specified. An error will be thrown if the
   * parameters are invalid.
   *
   * If `id` is specified, all other parameters will be ignored.
   * If `id` is not specified, the method will check for requests that match
   * all of the specified parameters.
   *
   * @param opts - Options bag.
   * @param opts.id - The ID to check for.
   * @param opts.origin - The origin to check for.
   * @param opts.type - The type to check for.
   * @returns `true` if a matching approval is found, and `false` otherwise.
   */
  has(opts: { id?: string; origin?: string; type?: string } = {}): boolean {
    const { id, origin, type: _type } = opts;

    if (id) {
      if (typeof id !== 'string') {
        throw new Error('May not specify non-string id.');
      }
      return this.#approvals.has(id);
    }

    if (_type && typeof _type !== 'string') {
      throw new Error('May not specify non-string type.');
    }

    if (origin) {
      if (typeof origin !== 'string') {
        throw new Error('May not specify non-string origin.');
      }

      // Check origin and type pair if type also specified
      if (_type) {
        return Boolean(this.#origins.get(origin)?.get(_type));
      }
      return this.#origins.has(origin);
    }

    if (_type) {
      for (const approval of Object.values(this.state.pendingApprovals)) {
        if (approval.type === _type) {
          return true;
        }
      }
      return false;
    }
    throw new Error(
      'Must specify a valid combination of id, origin, and type.',
    );
  }

  /**
   * Resolves the promise of the approval with the given id, and deletes the
   * approval. Throws an error if no such approval exists.
   *
   * @param id - The id of the approval request.
   * @param value - The value to resolve the approval promise with.
   * @param options - Options bag.
   * @returns A promise that either resolves once a result is provided by
   * the creator of the approval request, or immediately if `options.waitForResult`
   * is `false` or `undefined`.
   */
  accept(
    id: string,
    value?: unknown,
    options?: AcceptOptions,
  ): Promise<AcceptResult> {
    // Safe to cast as the delete method below will throw if the ID is not found
    const approval = this.get(id) as ApprovalRequest<ApprovalRequestData>;
    const requestPromise = this.#deleteApprovalAndGetCallbacks(id);

    return new Promise((resolve, reject) => {
      const resultCallbacks: AcceptResultCallbacks = {
        success: (acceptValue?: unknown) => resolve({ value: acceptValue }),
        error: reject,
      };

      if (options?.waitForResult && !approval.expectsResult) {
        reject(new ApprovalRequestNoResultSupportError(id));
        return;
      }

      const resultValue = options?.waitForResult ? resultCallbacks : undefined;

      const resolveValue = approval.expectsResult
        ? { value, resultCallbacks: resultValue }
        : value;

      requestPromise.resolve(resolveValue);

      if (!options?.waitForResult) {
        resolve({ value: undefined });
      }
    });
  }

  /**
   * Rejects the promise of the approval with the given id, and deletes the
   * approval. Throws an error if no such approval exists.
   *
   * @param id - The id of the approval request.
   * @param error - The error to reject the approval promise with.
   */
  reject(id: string, error: unknown): void {
    this.#deleteApprovalAndGetCallbacks(id).reject(error);
  }

  /**
   * Rejects and deletes all approval requests.
   *
   * @param rejectionError - The JsonRpcError to reject the approval
   * requests with.
   */
  clear(rejectionError: JsonRpcError<DataWithOptionalCause>): void {
    for (const id of this.#approvals.keys()) {
      this.reject(id, rejectionError);
    }
    this.#origins.clear();
    this.update((draftState) => {
      draftState.pendingApprovals = {};
      draftState.pendingApprovalCount = 0;
    });
  }

  /**
   * Updates the request state of the approval with the given id.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request.
   * @param opts.requestState - Additional data associated with the request
   */
  updateRequestState(opts: UpdateRequestStateOptions): void {
    if (!this.state.pendingApprovals[opts.id]) {
      throw new ApprovalRequestNotFoundError(opts.id);
    }

    this.update((draftState) => {
      draftState.pendingApprovals[opts.id].requestState =
        opts.requestState as never;
    });
  }

  /**
   * Starts a new approval flow.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval flow.
   * @param opts.loadingText - The loading text that will be associated to the approval flow.
   * @param opts.show - A flag to determine whether the approval should show to the user.
   * @returns The object containing the approval flow id.
   */
  startFlow(opts: StartFlowOptions = {}): ApprovalFlowStartResult {
    const id = opts.id ?? nanoid();
    const loadingText = opts.loadingText ?? null;

    this.update((draftState) => {
      draftState.approvalFlows.push({ id, loadingText });
    });

    // By default, if nothing else is specified, we always show the approval.
    if (opts.show !== false) {
      this.#showApprovalRequest();
    }

    return { id, loadingText };
  }

  /**
   * Ends the current approval flow.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval flow that will be finished.
   */
  endFlow({ id }: EndFlowOptions) {
    if (!this.state.approvalFlows.length) {
      throw new NoApprovalFlowsError();
    }

    const currentFlow = this.state.approvalFlows.slice(-1)[0];

    if (id !== currentFlow.id) {
      throw new EndInvalidFlowError(
        id,
        this.state.approvalFlows.map((flow) => flow.id),
      );
    }

    this.update((draftState) => {
      draftState.approvalFlows.pop();
    });
  }

  /**
   * Sets the loading text for the approval flow.
   *
   * @param opts - Options bag.
   * @param opts.id - The approval flow loading text that will be displayed.
   * @param opts.loadingText - The loading text that will be associated to the approval flow.
   */
  setFlowLoadingText({ id, loadingText }: SetFlowLoadingTextOptions) {
    const flowIndex = this.state.approvalFlows.findIndex(
      (flow) => flow.id === id,
    );

    if (flowIndex === -1) {
      throw new MissingApprovalFlowError(id);
    }

    this.update((draftState) => {
      draftState.approvalFlows[flowIndex].loadingText = loadingText;
    });
  }

  /**
   * Show a success page.
   *
   * @param opts - Options bag.
   * @param opts.message - The message text or components to display in the page.
   * @param opts.header - The text or components to display in the header of the page.
   * @param opts.flowToEnd - The ID of the approval flow to end once the success page is approved.
   * @param opts.title - The title to display above the message. Shown by default but can be hidden with `null`.
   * @param opts.icon - The icon to display in the page. Shown by default but can be hidden with `null`.
   * @returns Empty object to support future additions.
   */
  async success(opts: SuccessOptions = {}): Promise<SuccessResult> {
    await this.#result(APPROVAL_TYPE_RESULT_SUCCESS, opts, {
      message: opts.message,
      header: opts.header,
      title: opts.title,
      icon: opts.icon,
    } as Record<string, Json>);

    return {};
  }

  /**
   * Show an error page.
   *
   * @param opts - Options bag.
   * @param opts.message - The message text or components to display in the page.
   * @param opts.header - The text or components to display in the header of the page.
   * @param opts.flowToEnd - The ID of the approval flow to end once the error page is approved.
   * @param opts.title - The title to display above the message. Shown by default but can be hidden with `null`.
   * @param opts.icon - The icon to display in the page. Shown by default but can be hidden with `null`.
   * @returns Empty object to support future additions.
   */
  async error(opts: ErrorOptions = {}): Promise<ErrorResult> {
    await this.#result(APPROVAL_TYPE_RESULT_ERROR, opts, {
      error: opts.error,
      header: opts.header,
      title: opts.title,
      icon: opts.icon,
    } as Record<string, Json>);

    return {};
  }

  /**
   * Implementation of add operation.
   *
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   * @param id - The id of the approval request.
   * @param requestData - The request data associated with the approval request.
   * @param requestState - The request state associated with the approval request.
   * @param expectsResult - Whether the approval request expects a result object to be returned.
   * @returns The approval promise.
   */
  #add(
    origin: string,
    type: string,
    id: string = nanoid(),
    requestData?: Record<string, Json>,
    requestState?: Record<string, Json>,
    expectsResult?: boolean,
  ): Promise<unknown | AddResult> {
    this.#validateAddParams(id, origin, type, requestData, requestState);

    if (
      !this.#typesExcludedFromRateLimiting.includes(type) &&
      this.has({ origin, type })
    ) {
      throw rpcErrors.resourceUnavailable(
        getAlreadyPendingMessage(origin, type),
      );
    }

    // add pending approval
    return new Promise((resolve, reject) => {
      this.#approvals.set(id, { resolve, reject });
      this.#addPendingApprovalOrigin(origin, type);

      this.#addToStore(
        id,
        origin,
        type,
        requestData,
        requestState,
        expectsResult,
      );
    });
  }

  /**
   * Validates parameters to the add method.
   *
   * @param id - The id of the approval request.
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   * @param requestData - The request data associated with the approval request.
   * @param requestState - The request state associated with the approval request.
   */
  #validateAddParams(
    id: string,
    origin: string,
    type: string,
    requestData?: Record<string, Json>,
    requestState?: Record<string, Json>,
  ): void {
    let errorMessage = null;
    if (!id || typeof id !== 'string') {
      errorMessage = 'Must specify non-empty string id.';
    } else if (this.#approvals.has(id)) {
      errorMessage = `Approval request with id '${id}' already exists.`;
    } else if (!origin || typeof origin !== 'string') {
      errorMessage = 'Must specify non-empty string origin.';
    } else if (!type || typeof type !== 'string') {
      errorMessage = 'Must specify non-empty string type.';
    } else if (
      requestData &&
      (typeof requestData !== 'object' || Array.isArray(requestData))
    ) {
      errorMessage = 'Request data must be a plain object if specified.';
    } else if (
      requestState &&
      (typeof requestState !== 'object' || Array.isArray(requestState))
    ) {
      errorMessage = 'Request state must be a plain object if specified.';
    }

    if (errorMessage) {
      throw rpcErrors.internal(errorMessage);
    }
  }

  /**
   * Adds an entry to _origins.
   * Performs no validation.
   *
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   */
  #addPendingApprovalOrigin(origin: string, type: string): void {
    let originMap = this.#origins.get(origin);

    if (!originMap) {
      originMap = new Map();
      this.#origins.set(origin, originMap);
    }

    const currentValue = originMap.get(type) || 0;
    originMap.set(type, currentValue + 1);
  }

  /**
   * Adds an entry to the store.
   * Performs no validation.
   *
   * @param id - The id of the approval request.
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   * @param requestData - The request data associated with the approval request.
   * @param requestState - The request state associated with the approval request.
   * @param expectsResult - Whether the request expects a result object to be returned.
   */
  #addToStore(
    id: string,
    origin: string,
    type: string,
    requestData?: Record<string, Json>,
    requestState?: Record<string, Json>,
    expectsResult?: boolean,
  ): void {
    const approval = {
      id,
      origin,
      type,
      time: Date.now(),
      requestData: requestData || null,
      requestState: requestState || null,
      expectsResult: expectsResult || false,
    };

    this.update((draftState) => {
      draftState.pendingApprovals[id] = approval as never;

      draftState.pendingApprovalCount = Object.keys(
        draftState.pendingApprovals,
      ).length;
    });
  }

  /**
   * Deletes the approval with the given id. The approval promise must be
   * resolved or reject before this method is called.
   * Deletion is an internal operation because approval state is solely
   * managed by this controller.
   *
   * @param id - The id of the approval request to be deleted.
   */
  #delete(id: string): void {
    this.#approvals.delete(id);

    // This method is only called after verifying that the approval with the
    // specified id exists.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { origin, type } = this.state.pendingApprovals[id]!;

    const originMap = this.#origins.get(origin) as Map<string, number>;
    const originTotalCount = this.getApprovalCount({ origin });
    const originTypeCount = originMap.get(type) as number;

    if (originTotalCount === 1) {
      this.#origins.delete(origin);
    } else {
      originMap.set(type, originTypeCount - 1);
    }

    this.update((draftState) => {
      delete draftState.pendingApprovals[id];
      draftState.pendingApprovalCount = Object.keys(
        draftState.pendingApprovals,
      ).length;
    });
  }

  /**
   * Gets the approval callbacks for the given id, deletes the entry, and then
   * returns the callbacks for promise resolution.
   * Throws an error if no approval is found for the given id.
   *
   * @param id - The id of the approval request.
   * @returns The promise callbacks associated with the approval request.
   */
  #deleteApprovalAndGetCallbacks(id: string): ApprovalCallbacks {
    const callbacks = this.#approvals.get(id);
    if (!callbacks) {
      throw new ApprovalRequestNotFoundError(id);
    }

    this.#delete(id);
    return callbacks;
  }

  async #result(
    type: string,
    opts: ResultOptions,
    requestData: Record<string, Json>,
  ) {
    try {
      await this.addAndShowApprovalRequest({
        origin: ORIGIN_METAMASK,
        type,
        requestData,
      });
    } catch (error) {
      console.info('Failed to display result page', error);
    } finally {
      if (opts.flowToEnd) {
        try {
          this.endFlow({ id: opts.flowToEnd });
        } catch (error) {
          console.info('Failed to end flow', { id: opts.flowToEnd, error });
        }
      }
    }
  }
}

export default ApprovalController;
