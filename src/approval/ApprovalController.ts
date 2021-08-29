import type { Patch } from 'immer';
import { ethErrors } from 'eth-rpc-errors';
import { nanoid } from 'nanoid';

import { BaseController, Json } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';

const controllerName = 'ApprovalController';

type ApprovalPromiseResolve = (value?: unknown) => void;
type ApprovalPromiseReject = (error?: Error) => void;

type ApprovalRequestData = Record<string, Json> | null;

type ApprovalCallbacks = {
  resolve: ApprovalPromiseResolve;
  reject: ApprovalPromiseReject;
};

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
   */
  type: string;

  /**
   * Additional data associated with the request.
   * TODO:TS4.4 make optional
   */
  requestData: RequestData;
};

type ShowApprovalRequest = () => void | Promise<void>;

export type ApprovalControllerState = {
  pendingApprovals: Record<string, ApprovalRequest<Record<string, Json>>>;
  pendingApprovalCount: number;
};

const stateMetadata = {
  pendingApprovals: { persist: false, anonymous: true },
  pendingApprovalCount: { persist: false, anonymous: false },
};

const getAlreadyPendingMessage = (origin: string, type: string) =>
  `Request of type '${type}' already pending for origin ${origin}. Please wait.`;

const getDefaultState = (): ApprovalControllerState => {
  return {
    pendingApprovals: {},
    pendingApprovalCount: 0,
  };
};

export type GetApprovalsState = {
  type: `${typeof controllerName}:getState`;
  handler: () => ApprovalControllerState;
};

export type ClearApprovalRequests = {
  type: `${typeof controllerName}:clearRequests`;
  handler: () => void;
};

type AddApprovalOptions = {
  id?: string;
  origin: string;
  type: string;
  requestData?: Record<string, Json>;
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

export type ApprovalControllerActions =
  | GetApprovalsState
  | ClearApprovalRequests
  | AddApprovalRequest
  | HasApprovalRequest
  | AcceptRequest
  | RejectRequest;

export type ApprovalStateChange = {
  type: `${typeof controllerName}:stateChange`;
  payload: [ApprovalControllerState, Patch[]];
};

export type ApprovalControllerEvents = ApprovalStateChange;

export type ApprovalControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  ApprovalControllerActions,
  ApprovalControllerEvents,
  never,
  never
>;

type ApprovalControllerOptions = {
  messenger: ApprovalControllerMessenger;
  showApprovalRequest: ShowApprovalRequest;
  state?: Partial<ApprovalControllerState>;
};

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
  private _approvals: Map<string, ApprovalCallbacks>;

  private _origins: Map<string, Set<string>>;

  private _showApprovalRequest: () => void;

  /**
   * @param opts - Options bag
   * @param opts.showApprovalRequest - Function for opening the UI such that
   * the request can be displayed to the user.
   */
  constructor({
    messenger,
    showApprovalRequest,
    state = {},
  }: ApprovalControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this._approvals = new Map();
    this._origins = new Map();
    this._showApprovalRequest = showApprovalRequest;
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
  }

  /**
   * Adds an approval request per the given arguments, calls the show approval
   * request function, and returns the associated approval promise.
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
   * @returns The approval promise.
   */
  addAndShowApprovalRequest(opts: AddApprovalOptions): Promise<unknown> {
    const promise = this._add(
      opts.origin,
      opts.type,
      opts.id,
      opts.requestData,
    );
    this._showApprovalRequest();
    return promise;
  }

  /**
   * Adds an approval request per the given arguments and returns the approval
   * promise.
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
   * @returns The approval promise.
   */
  add(opts: AddApprovalOptions): Promise<unknown> {
    return this._add(opts.origin, opts.type, opts.id, opts.requestData);
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
      return Number(Boolean(this._origins.get(origin)?.has(_type)));
    }

    if (origin) {
      return this._origins.get(origin)?.size || 0;
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
   * @returns The current total approval request count, for all types and
   * origins.
   */
  getTotalApprovalCount(): number {
    return this.state.pendingApprovalCount;
  }

  // These signatures create a meaningful difference when this method is called.
  /* eslint-disable @typescript-eslint/unified-signatures */
  /**
   * Checks if there's a pending approval request with the given ID.
   *
   * @param opts - Options bag.
   * @param opts.id - The ID to check for.
   * @returns `true` if a matching approval is found, and `false` otherwise.
   */
  has(opts: { id: string }): boolean;

  /**
   * Checks if there's any pending approval request with the given origin.
   *
   * @param opts - Options bag.
   * @param opts.origin - The origin to check for.
   * @returns `true` if a matching approval is found, and `false` otherwise.
   */
  has(opts: { origin: string }): boolean;

  /**
   * Checks if there's any pending approval request with the given type.
   *
   * @param opts - Options bag.
   * @param opts.type - The type to check for.
   * @returns `true` if a matching approval is found, and `false` otherwise.
   */
  has(opts: { type: string }): boolean;

  /**
   * Checks if there's any pending approval request with the given origin and
   * type.
   *
   * @param opts - Options bag.
   * @param opts.origin - The origin to check for.
   * @param opts.type - The type to check for.
   * @returns `true` if a matching approval is found, and `false` otherwise.
   */
  has(opts: { origin: string; type: string }): boolean;
  /* eslint-enable @typescript-eslint/unified-signatures */

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
      return this._approvals.has(id);
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
        return Boolean(this._origins.get(origin)?.has(_type));
      }
      return this._origins.has(origin);
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
   */
  accept(id: string, value?: unknown): void {
    this._deleteApprovalAndGetCallbacks(id).resolve(value);
  }

  /**
   * Rejects the promise of the approval with the given id, and deletes the
   * approval. Throws an error if no such approval exists.
   *
   * @param id - The id of the approval request.
   * @param error - The error to reject the approval promise with.
   */
  reject(id: string, error: Error): void {
    this._deleteApprovalAndGetCallbacks(id).reject(error);
  }

  /**
   * Rejects and deletes all approval requests.
   */
  clear(): void {
    const rejectionError = ethErrors.rpc.resourceUnavailable(
      'The request was rejected; please try again.',
    );

    for (const id of this._approvals.keys()) {
      this.reject(id, rejectionError);
    }
    this._origins.clear();
    this.update(() => getDefaultState());
  }

  /**
   * Implementation of add operation.
   *
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   * @param id - The id of the approval request.
   * @param requestData - The request data associated with the approval request.
   * @returns The approval promise.
   */
  private _add(
    origin: string,
    type: string,
    id: string = nanoid(),
    requestData?: Record<string, Json>,
  ): Promise<unknown> {
    this._validateAddParams(id, origin, type, requestData);

    if (this._origins.get(origin)?.has(type)) {
      throw ethErrors.rpc.resourceUnavailable(
        getAlreadyPendingMessage(origin, type),
      );
    }

    // add pending approval
    return new Promise((resolve, reject) => {
      this._approvals.set(id, { resolve, reject });
      this._addPendingApprovalOrigin(origin, type);
      this._addToStore(id, origin, type, requestData);
    });
  }

  /**
   * Validates parameters to the add method.
   *
   * @param id - The id of the approval request.
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   * @param requestData - The request data associated with the approval request.
   */
  private _validateAddParams(
    id: string,
    origin: string,
    type: string,
    requestData?: Record<string, Json>,
  ): void {
    let errorMessage = null;
    if (!id || typeof id !== 'string') {
      errorMessage = 'Must specify non-empty string id.';
    } else if (this._approvals.has(id)) {
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
    }

    if (errorMessage) {
      throw ethErrors.rpc.internal(errorMessage);
    }
  }

  /**
   * Adds an entry to _origins.
   * Performs no validation.
   *
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   */
  private _addPendingApprovalOrigin(origin: string, type: string): void {
    const originSet = this._origins.get(origin) || new Set();
    originSet.add(type);

    if (!this._origins.has(origin)) {
      this._origins.set(origin, originSet);
    }
  }

  /**
   * Adds an entry to the store.
   * Performs no validation.
   *
   * @param id - The id of the approval request.
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request.
   * @param requestData - The request data associated with the approval request.
   */
  private _addToStore(
    id: string,
    origin: string,
    type: string,
    requestData?: Record<string, Json>,
  ): void {
    const approval: ApprovalRequest<Record<string, Json> | null> = {
      id,
      origin,
      type,
      time: Date.now(),
      requestData: requestData || null,
    };

    this.update((draftState) => {
      // Typecast: ts(2589)
      draftState.pendingApprovals[id] = approval as any;
      draftState.pendingApprovalCount = Object.keys(
        draftState.pendingApprovals,
      ).length;
    });
  }

  /**
   * Deletes the approval with the given id. The approval promise must be
   * resolved or reject before this method is called.
   *
   * Deletion is an internal operation because approval state is solely
   * managed by this controller.
   *
   * @param id - The id of the approval request to be deleted.
   */
  private _delete(id: string): void {
    this._approvals.delete(id);

    // This method is only called after verifying that the approval with the
    // specified id exists.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { origin, type } = this.state.pendingApprovals[id]!;

    (this._origins.get(origin) as Set<string>).delete(type);
    if (this._isEmptyOrigin(origin)) {
      this._origins.delete(origin);
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
  private _deleteApprovalAndGetCallbacks(id: string): ApprovalCallbacks {
    const callbacks = this._approvals.get(id);
    if (!callbacks) {
      throw new Error(`Approval request with id '${id}' not found.`);
    }

    this._delete(id);
    return callbacks;
  }

  /**
   * Checks whether there are any approvals associated with the given
   * origin.
   *
   * @param origin - The origin to check.
   * @returns True if the origin has no approvals, false otherwise.
   */
  private _isEmptyOrigin(origin: string): boolean {
    return !this._origins.get(origin)?.size;
  }
}
export default ApprovalController;
