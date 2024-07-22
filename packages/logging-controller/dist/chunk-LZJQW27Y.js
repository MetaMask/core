"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkUJIPPGP6js = require('./chunk-UJIPPGP6.js');

// src/LoggingController.ts
var _basecontroller = require('@metamask/base-controller');
var _uuid = require('uuid');
var name = "LoggingController";
var metadata = {
  logs: { persist: true, anonymous: false }
};
var defaultState = {
  logs: {}
};
var _generateId, generateId_fn;
var LoggingController = class extends _basecontroller.BaseController {
  /**
   * Creates a LoggingController instance.
   *
   * @param options - Constructor options
   * @param options.messenger - An instance of the ControllerMessenger
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state
  }) {
    super({
      name,
      metadata,
      messenger,
      state: {
        ...defaultState,
        ...state
      }
    });
    /**
     * Method to generate a randomId and ensures no collision with existing ids.
     *
     * We may want to end up using a hashing mechanism to make ids deterministic
     * by the *data* passed in, and then make each key an array of logs that
     * match that id.
     *
     * @returns unique id
     */
    _chunkUJIPPGP6js.__privateAdd.call(void 0, this, _generateId);
    this.messagingSystem.registerActionHandler(
      `${name}:add`,
      (log) => this.add(log)
    );
  }
  /**
   * Add log to the state.
   *
   * @param log - Log to add to the controller
   */
  add(log) {
    const newLog = {
      id: _chunkUJIPPGP6js.__privateMethod.call(void 0, this, _generateId, generateId_fn).call(this),
      timestamp: Date.now(),
      log
    };
    this.update((state) => {
      state.logs[newLog.id] = newLog;
    });
  }
  /**
   * Removes all log entries.
   */
  clear() {
    this.update((state) => {
      state.logs = {};
    });
  }
};
_generateId = new WeakSet();
generateId_fn = function() {
  let id = _uuid.v1.call(void 0, );
  while (id in this.state.logs) {
    id = _uuid.v1.call(void 0, );
  }
  return id;
};



exports.LoggingController = LoggingController;
//# sourceMappingURL=chunk-LZJQW27Y.js.map