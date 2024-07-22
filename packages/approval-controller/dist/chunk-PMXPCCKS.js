"use strict";Object.defineProperty(exports, "__esModule", {value: true});









var _chunkLKCXZAKDjs = require('./chunk-LKCXZAKD.js');

// src/ApprovalController.ts


var _basecontroller = require('@metamask/base-controller');
var _rpcerrors = require('@metamask/rpc-errors');
var _nanoid = require('nanoid');
var ORIGIN_METAMASK = "metamask";
var APPROVAL_TYPE_RESULT_ERROR = "result_error";
var APPROVAL_TYPE_RESULT_SUCCESS = "result_success";
var controllerName = "ApprovalController";
var stateMetadata = {
  pendingApprovals: { persist: false, anonymous: true },
  pendingApprovalCount: { persist: false, anonymous: false },
  approvalFlows: { persist: false, anonymous: false }
};
var getAlreadyPendingMessage = (origin, type) => `Request of type '${type}' already pending for origin ${origin}. Please wait.`;
var getDefaultState = () => {
  return {
    pendingApprovals: {},
    pendingApprovalCount: 0,
    approvalFlows: []
  };
};
var _approvals, _origins, _showApprovalRequest, _typesExcludedFromRateLimiting, _add, add_fn, _validateAddParams, validateAddParams_fn, _addPendingApprovalOrigin, addPendingApprovalOrigin_fn, _addToStore, addToStore_fn, _delete, delete_fn, _deleteApprovalAndGetCallbacks, deleteApprovalAndGetCallbacks_fn, _result, result_fn;
var ApprovalController = class extends _basecontroller.BaseController {
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
    typesExcludedFromRateLimiting = []
  }) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state }
    });
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
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _add);
    /**
     * Validates parameters to the add method.
     *
     * @param id - The id of the approval request.
     * @param origin - The origin of the approval request.
     * @param type - The type associated with the approval request.
     * @param requestData - The request data associated with the approval request.
     * @param requestState - The request state associated with the approval request.
     */
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _validateAddParams);
    /**
     * Adds an entry to _origins.
     * Performs no validation.
     *
     * @param origin - The origin of the approval request.
     * @param type - The type associated with the approval request.
     */
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _addPendingApprovalOrigin);
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
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _addToStore);
    /**
     * Deletes the approval with the given id. The approval promise must be
     * resolved or reject before this method is called.
     * Deletion is an internal operation because approval state is solely
     * managed by this controller.
     *
     * @param id - The id of the approval request to be deleted.
     */
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _delete);
    /**
     * Gets the approval callbacks for the given id, deletes the entry, and then
     * returns the callbacks for promise resolution.
     * Throws an error if no approval is found for the given id.
     *
     * @param id - The id of the approval request.
     * @returns The promise callbacks associated with the approval request.
     */
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _deleteApprovalAndGetCallbacks);
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _result);
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _approvals, void 0);
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _origins, void 0);
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _showApprovalRequest, void 0);
    _chunkLKCXZAKDjs.__privateAdd.call(void 0, this, _typesExcludedFromRateLimiting, void 0);
    _chunkLKCXZAKDjs.__privateSet.call(void 0, this, _approvals, /* @__PURE__ */ new Map());
    _chunkLKCXZAKDjs.__privateSet.call(void 0, this, _origins, /* @__PURE__ */ new Map());
    _chunkLKCXZAKDjs.__privateSet.call(void 0, this, _showApprovalRequest, showApprovalRequest);
    _chunkLKCXZAKDjs.__privateSet.call(void 0, this, _typesExcludedFromRateLimiting, typesExcludedFromRateLimiting);
    this.registerMessageHandlers();
  }
  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:clearRequests`,
      this.clear.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:addRequest`,
      (opts, shouldShowRequest) => {
        if (shouldShowRequest) {
          return this.addAndShowApprovalRequest(opts);
        }
        return this.add(opts);
      }
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:hasRequest`,
      this.has.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:acceptRequest`,
      this.accept.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:rejectRequest`,
      this.reject.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:updateRequestState`,
      this.updateRequestState.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:startFlow`,
      this.startFlow.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:endFlow`,
      this.endFlow.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:setFlowLoadingText`,
      this.setFlowLoadingText.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:showSuccess`,
      this.success.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:showError`,
      this.error.bind(this)
    );
  }
  addAndShowApprovalRequest(opts) {
    const promise = _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _add, add_fn).call(this, opts.origin, opts.type, opts.id, opts.requestData, opts.requestState, opts.expectsResult);
    _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _showApprovalRequest).call(this);
    return promise;
  }
  add(opts) {
    return _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _add, add_fn).call(this, opts.origin, opts.type, opts.id, opts.requestData, opts.requestState, opts.expectsResult);
  }
  /**
   * Gets the info for the approval request with the given id.
   *
   * @param id - The id of the approval request.
   * @returns The approval request data associated with the id.
   */
  get(id) {
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
  getApprovalCount(opts = {}) {
    if (!opts.origin && !opts.type) {
      throw new Error("Must specify origin, type, or both.");
    }
    const { origin, type: _type } = opts;
    if (origin && _type) {
      return _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).get(origin)?.get(_type) || 0;
    }
    if (origin) {
      return Array.from(
        (_chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).get(origin) || /* @__PURE__ */ new Map()).values()
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      ).reduce((total, value) => total + value, 0);
    }
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
  getTotalApprovalCount() {
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
  has(opts = {}) {
    const { id, origin, type: _type } = opts;
    if (id) {
      if (typeof id !== "string") {
        throw new Error("May not specify non-string id.");
      }
      return _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _approvals).has(id);
    }
    if (_type && typeof _type !== "string") {
      throw new Error("May not specify non-string type.");
    }
    if (origin) {
      if (typeof origin !== "string") {
        throw new Error("May not specify non-string origin.");
      }
      if (_type) {
        return Boolean(_chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).get(origin)?.get(_type));
      }
      return _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).has(origin);
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
      "Must specify a valid combination of id, origin, and type."
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
  accept(id, value, options) {
    const approval = this.get(id);
    const requestPromise = _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _deleteApprovalAndGetCallbacks, deleteApprovalAndGetCallbacks_fn).call(this, id);
    return new Promise((resolve, reject) => {
      const resultCallbacks = {
        success: (acceptValue) => resolve({ value: acceptValue }),
        error: reject
      };
      if (options?.waitForResult && !approval.expectsResult) {
        reject(new (0, _chunkLKCXZAKDjs.ApprovalRequestNoResultSupportError)(id));
        return;
      }
      const resultValue = options?.waitForResult ? resultCallbacks : void 0;
      const resolveValue = approval.expectsResult ? { value, resultCallbacks: resultValue } : value;
      requestPromise.resolve(resolveValue);
      if (!options?.waitForResult) {
        resolve({ value: void 0 });
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
  reject(id, error) {
    _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _deleteApprovalAndGetCallbacks, deleteApprovalAndGetCallbacks_fn).call(this, id).reject(error);
  }
  /**
   * Rejects and deletes all approval requests.
   *
   * @param rejectionError - The JsonRpcError to reject the approval
   * requests with.
   */
  clear(rejectionError) {
    for (const id of _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _approvals).keys()) {
      this.reject(id, rejectionError);
    }
    _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).clear();
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
  updateRequestState(opts) {
    if (!this.state.pendingApprovals[opts.id]) {
      throw new (0, _chunkLKCXZAKDjs.ApprovalRequestNotFoundError)(opts.id);
    }
    this.update((draftState) => {
      draftState.pendingApprovals[opts.id].requestState = opts.requestState;
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
  startFlow(opts = {}) {
    const id = opts.id ?? _nanoid.nanoid.call(void 0, );
    const loadingText = opts.loadingText ?? null;
    this.update((draftState) => {
      draftState.approvalFlows.push({ id, loadingText });
    });
    if (opts.show !== false) {
      _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _showApprovalRequest).call(this);
    }
    return { id, loadingText };
  }
  /**
   * Ends the current approval flow.
   *
   * @param opts - Options bag.
   * @param opts.id - The id of the approval flow that will be finished.
   */
  endFlow({ id }) {
    if (!this.state.approvalFlows.length) {
      throw new (0, _chunkLKCXZAKDjs.NoApprovalFlowsError)();
    }
    const currentFlow = this.state.approvalFlows.slice(-1)[0];
    if (id !== currentFlow.id) {
      throw new (0, _chunkLKCXZAKDjs.EndInvalidFlowError)(
        id,
        this.state.approvalFlows.map((flow) => flow.id)
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
  setFlowLoadingText({ id, loadingText }) {
    const flowIndex = this.state.approvalFlows.findIndex(
      (flow) => flow.id === id
    );
    if (flowIndex === -1) {
      throw new (0, _chunkLKCXZAKDjs.MissingApprovalFlowError)(id);
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
  async success(opts = {}) {
    await _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _result, result_fn).call(this, APPROVAL_TYPE_RESULT_SUCCESS, opts, {
      message: opts.message,
      header: opts.header,
      title: opts.title,
      icon: opts.icon
    });
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
  async error(opts = {}) {
    await _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _result, result_fn).call(this, APPROVAL_TYPE_RESULT_ERROR, opts, {
      error: opts.error,
      header: opts.header,
      title: opts.title,
      icon: opts.icon
    });
    return {};
  }
};
_approvals = new WeakMap();
_origins = new WeakMap();
_showApprovalRequest = new WeakMap();
_typesExcludedFromRateLimiting = new WeakMap();
_add = new WeakSet();
add_fn = function(origin, type, id = _nanoid.nanoid.call(void 0, ), requestData, requestState, expectsResult) {
  _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _validateAddParams, validateAddParams_fn).call(this, id, origin, type, requestData, requestState);
  if (!_chunkLKCXZAKDjs.__privateGet.call(void 0, this, _typesExcludedFromRateLimiting).includes(type) && this.has({ origin, type })) {
    throw _rpcerrors.rpcErrors.resourceUnavailable(
      getAlreadyPendingMessage(origin, type)
    );
  }
  return new Promise((resolve, reject) => {
    _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _approvals).set(id, { resolve, reject });
    _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _addPendingApprovalOrigin, addPendingApprovalOrigin_fn).call(this, origin, type);
    _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _addToStore, addToStore_fn).call(this, id, origin, type, requestData, requestState, expectsResult);
  });
};
_validateAddParams = new WeakSet();
validateAddParams_fn = function(id, origin, type, requestData, requestState) {
  let errorMessage = null;
  if (!id || typeof id !== "string") {
    errorMessage = "Must specify non-empty string id.";
  } else if (_chunkLKCXZAKDjs.__privateGet.call(void 0, this, _approvals).has(id)) {
    errorMessage = `Approval request with id '${id}' already exists.`;
  } else if (!origin || typeof origin !== "string") {
    errorMessage = "Must specify non-empty string origin.";
  } else if (!type || typeof type !== "string") {
    errorMessage = "Must specify non-empty string type.";
  } else if (requestData && (typeof requestData !== "object" || Array.isArray(requestData))) {
    errorMessage = "Request data must be a plain object if specified.";
  } else if (requestState && (typeof requestState !== "object" || Array.isArray(requestState))) {
    errorMessage = "Request state must be a plain object if specified.";
  }
  if (errorMessage) {
    throw _rpcerrors.rpcErrors.internal(errorMessage);
  }
};
_addPendingApprovalOrigin = new WeakSet();
addPendingApprovalOrigin_fn = function(origin, type) {
  let originMap = _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).get(origin);
  if (!originMap) {
    originMap = /* @__PURE__ */ new Map();
    _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).set(origin, originMap);
  }
  const currentValue = originMap.get(type) || 0;
  originMap.set(type, currentValue + 1);
};
_addToStore = new WeakSet();
addToStore_fn = function(id, origin, type, requestData, requestState, expectsResult) {
  const approval = {
    id,
    origin,
    type,
    time: Date.now(),
    requestData: requestData || null,
    requestState: requestState || null,
    expectsResult: expectsResult || false
  };
  this.update((draftState) => {
    draftState.pendingApprovals[id] = approval;
    draftState.pendingApprovalCount = Object.keys(
      draftState.pendingApprovals
    ).length;
  });
};
_delete = new WeakSet();
delete_fn = function(id) {
  _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _approvals).delete(id);
  const { origin, type } = this.state.pendingApprovals[id];
  const originMap = _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).get(origin);
  const originTotalCount = this.getApprovalCount({ origin });
  const originTypeCount = originMap.get(type);
  if (originTotalCount === 1) {
    _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _origins).delete(origin);
  } else {
    originMap.set(type, originTypeCount - 1);
  }
  this.update((draftState) => {
    delete draftState.pendingApprovals[id];
    draftState.pendingApprovalCount = Object.keys(
      draftState.pendingApprovals
    ).length;
  });
};
_deleteApprovalAndGetCallbacks = new WeakSet();
deleteApprovalAndGetCallbacks_fn = function(id) {
  const callbacks = _chunkLKCXZAKDjs.__privateGet.call(void 0, this, _approvals).get(id);
  if (!callbacks) {
    throw new (0, _chunkLKCXZAKDjs.ApprovalRequestNotFoundError)(id);
  }
  _chunkLKCXZAKDjs.__privateMethod.call(void 0, this, _delete, delete_fn).call(this, id);
  return callbacks;
};
_result = new WeakSet();
result_fn = async function(type, opts, requestData) {
  try {
    await this.addAndShowApprovalRequest({
      origin: ORIGIN_METAMASK,
      type,
      requestData
    });
  } catch (error) {
    console.info("Failed to display result page", error);
  } finally {
    if (opts.flowToEnd) {
      try {
        this.endFlow({ id: opts.flowToEnd });
      } catch (error) {
        console.info("Failed to end flow", { id: opts.flowToEnd, error });
      }
    }
  }
};
var ApprovalController_default = ApprovalController;







exports.ORIGIN_METAMASK = ORIGIN_METAMASK; exports.APPROVAL_TYPE_RESULT_ERROR = APPROVAL_TYPE_RESULT_ERROR; exports.APPROVAL_TYPE_RESULT_SUCCESS = APPROVAL_TYPE_RESULT_SUCCESS; exports.ApprovalController = ApprovalController; exports.ApprovalController_default = ApprovalController_default;
//# sourceMappingURL=chunk-PMXPCCKS.js.map