"use strict";Object.defineProperty(exports, "__esModule", {value: true});




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/QueuedRequestController.ts
var _basecontroller = require('@metamask/base-controller');
var _selectednetworkcontroller = require('@metamask/selected-network-controller');
var _utils = require('@metamask/utils');
var controllerName = "QueuedRequestController";
var QueuedRequestControllerActionTypes = {
  enqueueRequest: `${controllerName}:enqueueRequest`,
  getState: `${controllerName}:getState`
};
var QueuedRequestControllerEventTypes = {
  networkSwitched: `${controllerName}:networkSwitched`,
  stateChange: `${controllerName}:stateChange`
};
var _originOfCurrentBatch, _requestQueue, _processingRequestCount, _shouldRequestSwitchNetwork, _clearPendingConfirmations, _showApprovalRequest, _registerMessageHandlers, registerMessageHandlers_fn, _flushQueueForOrigin, flushQueueForOrigin_fn, _processNextBatch, processNextBatch_fn, _switchNetworkIfNecessary, switchNetworkIfNecessary_fn, _updateQueuedRequestCount, updateQueuedRequestCount_fn, _waitForDequeue, waitForDequeue_fn;
var QueuedRequestController = class extends _basecontroller.BaseController {
  /**
   * Construct a QueuedRequestController.
   *
   * @param options - Controller options.
   * @param options.messenger - The restricted controller messenger that facilitates communication with other controllers.
   * @param options.shouldRequestSwitchNetwork - A function that returns if a request requires the globally selected network to match the dapp selected network.
   * @param options.clearPendingConfirmations - A function that will clear all the pending confirmations.
   * @param options.showApprovalRequest - A function for opening the UI such that
   * the existing request can be displayed to the user.
   */
  constructor({
    messenger,
    shouldRequestSwitchNetwork,
    clearPendingConfirmations,
    showApprovalRequest
  }) {
    super({
      name: controllerName,
      metadata: {
        queuedRequestCount: {
          anonymous: true,
          persist: false
        }
      },
      messenger,
      state: { queuedRequestCount: 0 }
    });
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _flushQueueForOrigin);
    /**
     * Process the next batch of requests.
     *
     * This will trigger the next batch of requests with matching origins to be processed. Each
     * request in the batch is dequeued one at a time, in chronological order, but they all get
     * processed in parallel.
     *
     * This should be called after a batch of requests has finished processing, if the queue is non-
     * empty.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _processNextBatch);
    /**
     * Switch the globally selected network client to match the network
     * client of the current batch.
     *
     * @throws Throws an error if the current selected `networkClientId` or the
     * `networkClientId` on the request are invalid.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _switchNetworkIfNecessary);
    /**
     * Update the queued request count.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _updateQueuedRequestCount);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _waitForDequeue);
    /**
     * The origin of the current batch of requests being processed, or `undefined` if there are no
     * requests currently being processed.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _originOfCurrentBatch, void 0);
    /**
     * The list of all queued requests, in chronological order.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _requestQueue, []);
    /**
     * The number of requests currently being processed.
     *
     * Note that this does not include queued requests, just those being actively processed (i.e.
     * those in the "current batch").
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _processingRequestCount, 0);
    /**
     * This is a function that returns true if a request requires the globally selected
     * network to match the dapp selected network before being processed. These can
     * be for UI/UX reasons where the currently selected network is displayed
     * in the confirmation even though it will be submitted on the correct
     * network for the dapp. It could also be that a method expects the
     * globally selected network to match some value in the request params itself.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _shouldRequestSwitchNetwork, void 0);
    /**
     * This is a function that clears all pending confirmations across
     * several controllers that may handle them.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _clearPendingConfirmations, void 0);
    /**
     * This is a function that makes the confirmation notification view
     * become visible and focused to the user
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _showApprovalRequest, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _shouldRequestSwitchNetwork, shouldRequestSwitchNetwork);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _clearPendingConfirmations, clearPendingConfirmations);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _showApprovalRequest, showApprovalRequest);
    _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  /**
   * Enqueue a request to be processed in a batch with other requests from the same origin.
   *
   * We process requests one origin at a time, so that requests from different origins do not get
   * interwoven, and so that we can ensure that the globally selected network matches the dapp-
   * selected network.
   *
   * Requests get processed in order of insertion, even across origins/batches. All requests get
   * processed even in the event of preceding requests failing.
   *
   * @param request - The JSON-RPC request to process.
   * @param requestNext - A function representing the next steps for processing this request.
   * @returns A promise that resolves when the given request has been fully processed.
   */
  async enqueueRequest(request, requestNext) {
    if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _originOfCurrentBatch) === void 0) {
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _originOfCurrentBatch, request.origin);
    }
    try {
      if (this.state.queuedRequestCount > 0 || _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _originOfCurrentBatch) !== request.origin) {
        _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _showApprovalRequest).call(this);
        await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _waitForDequeue, waitForDequeue_fn).call(this, request.origin);
      } else if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _shouldRequestSwitchNetwork).call(this, request)) {
        await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _switchNetworkIfNecessary, switchNetworkIfNecessary_fn).call(this);
      }
      _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _processingRequestCount, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _processingRequestCount) + 1);
      try {
        await requestNext();
      } finally {
        _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _processingRequestCount, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _processingRequestCount) - 1);
      }
      return void 0;
    } finally {
      if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _processingRequestCount) === 0) {
        _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _originOfCurrentBatch, void 0);
        if (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue).length > 0) {
          _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _processNextBatch, processNextBatch_fn).call(this);
        }
      }
    }
  }
};
_originOfCurrentBatch = new WeakMap();
_requestQueue = new WeakMap();
_processingRequestCount = new WeakMap();
_shouldRequestSwitchNetwork = new WeakMap();
_clearPendingConfirmations = new WeakMap();
_showApprovalRequest = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    `${controllerName}:enqueueRequest`,
    this.enqueueRequest.bind(this)
  );
  this.messagingSystem.subscribe(
    _selectednetworkcontroller.SelectedNetworkControllerEventTypes.stateChange,
    (_, patch) => {
      patch.forEach(({ op, path }) => {
        if (path.length === 2 && path[0] === "domains" && typeof path[1] === "string") {
          const origin = path[1];
          _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _flushQueueForOrigin, flushQueueForOrigin_fn).call(this, origin);
          if (op === "remove" && origin === _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _originOfCurrentBatch)) {
            _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _clearPendingConfirmations).call(this);
          }
        }
      });
    }
  );
};
_flushQueueForOrigin = new WeakSet();
flushQueueForOrigin_fn = function(flushOrigin) {
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue).filter(({ origin }) => origin === flushOrigin).forEach(({ processRequest }) => {
    processRequest(
      new Error(
        "The request has been rejected due to a change in selected network. Please verify the selected network and retry the request."
      )
    );
  });
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _requestQueue, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue).filter(
    ({ origin }) => origin !== flushOrigin
  ));
};
_processNextBatch = new WeakSet();
processNextBatch_fn = async function() {
  const firstRequest = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue).shift();
  _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _originOfCurrentBatch, firstRequest.origin);
  const batch = [firstRequest.processRequest];
  while (_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue)[0]?.origin === _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _originOfCurrentBatch)) {
    const nextEntry = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue).shift();
    batch.push(nextEntry.processRequest);
  }
  let networkSwitchError;
  try {
    await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _switchNetworkIfNecessary, switchNetworkIfNecessary_fn).call(this);
  } catch (error) {
    networkSwitchError = error;
  }
  for (const processRequest of batch) {
    processRequest(networkSwitchError);
  }
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateQueuedRequestCount, updateQueuedRequestCount_fn).call(this);
};
_switchNetworkIfNecessary = new WeakSet();
switchNetworkIfNecessary_fn = async function() {
  if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _originOfCurrentBatch)) {
    throw new Error("Current batch origin must be initialized first");
  }
  const originNetworkClientId = this.messagingSystem.call(
    "SelectedNetworkController:getNetworkClientIdForDomain",
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _originOfCurrentBatch)
  );
  const { selectedNetworkClientId } = this.messagingSystem.call(
    "NetworkController:getState"
  );
  if (originNetworkClientId === selectedNetworkClientId) {
    return;
  }
  await this.messagingSystem.call(
    "NetworkController:setActiveNetwork",
    originNetworkClientId
  );
  this.messagingSystem.publish(
    "QueuedRequestController:networkSwitched",
    originNetworkClientId
  );
};
_updateQueuedRequestCount = new WeakSet();
updateQueuedRequestCount_fn = function() {
  this.update((state) => {
    state.queuedRequestCount = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue).length;
  });
};
_waitForDequeue = new WeakSet();
waitForDequeue_fn = async function(origin) {
  const { promise, reject, resolve } = _utils.createDeferredPromise.call(void 0, {
    suppressUnhandledRejection: true
  });
  _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _requestQueue).push({
    origin,
    processRequest: (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }
  });
  _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _updateQueuedRequestCount, updateQueuedRequestCount_fn).call(this);
  return promise;
};






exports.controllerName = controllerName; exports.QueuedRequestControllerActionTypes = QueuedRequestControllerActionTypes; exports.QueuedRequestControllerEventTypes = QueuedRequestControllerEventTypes; exports.QueuedRequestController = QueuedRequestController;
//# sourceMappingURL=chunk-5GMDEBVM.js.map