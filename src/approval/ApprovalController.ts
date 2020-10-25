import BaseController, { BaseConfig, BaseState } from '../BaseController';

const { ethErrors } = require('eth-rpc-errors');
const { nanoid } = require('nanoid');

const DEFAULT_TYPE = Symbol('DEFAULT_APPROVAL_TYPE');
const STORE_KEY = 'pendingApprovals';

type ApprovalType = string | typeof DEFAULT_TYPE;

type ApprovalPromiseResolve = (value?: unknown) => void;
type ApprovalPromiseReject = (error?: Error) => void;

type RequestData = Record<string, unknown>;

interface ApprovalCallbacks {
  resolve: ApprovalPromiseResolve;
  reject: ApprovalPromiseReject;
}

/**
 * Data associated with a pending approval.
 */
export interface ApprovalInfo {
  id: string;
  origin: string;
  type?: string;
  requestData?: RequestData;
}

export interface ApprovalConfig extends BaseConfig {
  showApprovalRequest: () => void;
}

export interface ApprovalState extends BaseState {
  [STORE_KEY]: { [approvalId: string]: ApprovalInfo };
}

const getAlreadyPendingMessage = (origin: string, type: ApprovalType) => (
  `Request ${type === DEFAULT_TYPE ? '' : `of type '${type}' `}already pending for origin ${origin}. Please wait.`
);

const defaultState = { [STORE_KEY]: {} };

/**
 * Controller for keeping track of pending approvals by id and/or origin and
 * type pair.
 *
 * Useful for managing requests that require user approval, and restricting
 * the number of approvals a particular origin can have pending at any one time.
 */
export default class ApprovalController extends BaseController<ApprovalConfig, ApprovalState> {

  private _approvals: Map<string, ApprovalCallbacks>;

  private _origins: Map<string, Set<ApprovalType>>;

  private _showApprovalRequest: () => void;

  /**
   * @param opts - Options bag
   * @param opts.showApprovalRequest - Function for opening the MetaMask user
   * confirmation UI.
   */
  constructor(config: ApprovalConfig, state?: ApprovalState) {
    super(config, state || defaultState);

    this._approvals = new Map();

    this._origins = new Map();

    this._showApprovalRequest = config.showApprovalRequest;
  }

  /**
   * Adds a pending approval per the given arguments, opens the MetaMask user
   * confirmation UI, and returns the associated id and approval promise.
   * An internal, default type will be used if none is specified.
   *
   * There can only be one approval per origin and type. An error is thrown if
   * attempting
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request. A random id will be
   * generated if none is provided.
   * @param opts.origin - The origin of the approval request.
   * @param opts.type - The type associated with the approval request, if
   * applicable.
   * @param opts.requestData - The request data associated with the approval
   * request.
   * @returns The approval promise.
   */
  addAndShowApprovalRequest(opts: {
    id?: string;
    origin: string;
    type?: string;
    requestData?: RequestData;
  }): Promise<unknown> {
    const promise = this._add(opts.origin, opts.requestData, opts.id, opts.type);
    this._showApprovalRequest();
    return promise;
  }

  /**
   * Adds a pending approval per the given arguments, and returns the associated
   * id and approval promise. An internal, default type will be used if none is
   * specified.
   *
   * There can only be one approval per origin and type. An error is thrown if
   * attempting
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request. A random id will be
   * generated if none is provided.
   * @param opts.origin - The origin of the approval request.
   * @param opts.type - The type associated with the approval request, if
   * applicable.
   * @param opts.requestData - The request data associated with the approval
   * request.
   * @returns The approval promise.
   */
  add(opts: {
    id?: string;
    origin: string;
    type?: string;
    requestData?: RequestData;
  }): Promise<unknown> {
    return this._add(opts.origin, opts.requestData, opts.id, opts.type);
  }

  /**
   * Gets the pending approval info for the given id.
   *
   * @param id - The id of the approval request.
   * @returns The pending approval data associated with the id.
   */
  get(id: string): ApprovalInfo | undefined {
    const info = this.state[STORE_KEY][id];
    return info
      ? { ...info }
      : undefined;
  }

  /**
   * Checks if there's a pending approval request for the given id, or origin
   * and type pair if no id is specified.
   * If no type is specified, the default type will be used.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval request.
   * @param opts.origin - The origin of the approval request.
   * @param opts.type - The type of the approval request.
   * @returns True if an approval is found, false otherwise.
   */
  has(opts: { id?: string; origin?: string; type?: string }): boolean {
    const _type = opts.type === undefined ? DEFAULT_TYPE : opts.type;
    if (!_type) {
      throw new Error('May not specify falsy type.');
    }

    if (opts.id) {
      return this._approvals.has(opts.id);
    } else if (opts.origin) {
      return Boolean(this._origins.get(opts.origin)?.has(_type));
    }
    throw new Error('Must specify id or origin.');
  }

  /**
   * Resolves the promise of the approval with the given id, and deletes the
   * approval. Throws an error if no such approval exists.
   *
   * @param id - The id of the approval request.
   * @param value - The value to resolve the approval promise with.
   */
  resolve(id: string, value?: unknown): void {
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
   * Rejects and deletes all pending approval requests.
   */
  clear(): void {
    const rejectionError = ethErrors.rpc.resourceUnavailable(
      'The request was rejected; please try again.'
    );

    for (const id of this._approvals.keys()) {
      this.reject(id, rejectionError);
    }
    this._origins.clear();
    this.update(defaultState, true);
  }

  /**
   * Implementation of add operation.
   *
   * @param id - The id of the approval request.
   * @param origin - The origin of the approval request.
   * @param type - The type associated with the approval request, if applicable.
   * @param requestData - The request data associated with the approval request.
   * @returns The approval promise.
   */
  private _add(
    origin: string,
    requestData?: RequestData,
    id: string = nanoid(),
    type: ApprovalType = DEFAULT_TYPE,
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
    type: ApprovalType,
    requestData?: RequestData
  ): void {
    let errorMessage = null;
    if (!id && id !== undefined) {
      errorMessage = 'May not specify falsy id.';
    } else if (!origin) {
      errorMessage = 'Must specify origin.';
    } else if (this._approvals.has(id)) {
      errorMessage = `Approval with id '${id}' already exists.`;
    } else if (typeof type !== 'string' && type !== DEFAULT_TYPE) {
      errorMessage = 'Must specify string type.';
    } else if (!type) {
      errorMessage = 'May not specify empty string type.';
    } else if (requestData && (
      typeof requestData !== 'object' || Array.isArray(requestData)
    )) {
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
  private _addPendingApprovalOrigin(origin: string, type: ApprovalType): void {
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
    type: ApprovalType,
    requestData?: RequestData
  ): void {
    const info: ApprovalInfo = { id, origin };
    // default type is for internal bookkeeping only
    if (type !== DEFAULT_TYPE) {
      info.type = type;
    }
    if (requestData) {
      info.requestData = requestData;
    }

    this.update({
      [STORE_KEY]: {
        ...this.state[STORE_KEY],
        [id]: info,
      },
    }, true);
  }

  /**
   * Deletes the approval with the given id. The approval promise must be
   * resolved or reject before this method is called.
   * Deletion is an internal operation because approval state is solely
   * managed by this controller.
   *
   * @param id - The id of the approval request to be deleted.
   */
  private _delete(id: string): void {
    if (this._approvals.has(id)) {
      this._approvals.delete(id);

      const state = this.state[STORE_KEY];
      const {
        origin,
        type = DEFAULT_TYPE,
      } = state[id];

      /* istanbul ignore next */
      this._origins.get(origin)?.delete(type);
      if (this._isEmptyOrigin(origin)) {
        this._origins.delete(origin);
      }

      const newState = { ...state };
      delete newState[id];
      this.update({
        [STORE_KEY]: newState,
      }, true);
    }
  }

  /**
   * Gets the approval callbacks for the given id, deletes the entry, and then
   * returns the callbacks for promise resolution.
   * Throws an error if no approval is found for the given id.
   *
   * @param id - The id of the approval request.
   * @returns The pending approval callbacks associated with the id.
   */
  private _deleteApprovalAndGetCallbacks(id: string): ApprovalCallbacks {
    const callbacks = this._approvals.get(id);
    if (!callbacks) {
      throw new Error(`Approval with id '${id}' not found.`);
    }

    this._delete(id);
    return callbacks;
  }

  /**
   * Checks whether there are any pending approvals associated with the given
   * origin.
   *
   * @param origin - The origin to check.
   * @returns True if the origin has no pending approvals, false otherwise.
   */
  private _isEmptyOrigin(origin: string): boolean {
    return !this._origins.get(origin)?.size;
  }
}
