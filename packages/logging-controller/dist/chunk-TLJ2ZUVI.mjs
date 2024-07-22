import {
  __privateAdd,
  __privateMethod
} from "./chunk-ZNSHBDHA.mjs";

// src/LoggingController.ts
import { BaseController } from "@metamask/base-controller";
import { v1 as random } from "uuid";
var name = "LoggingController";
var metadata = {
  logs: { persist: true, anonymous: false }
};
var defaultState = {
  logs: {}
};
var _generateId, generateId_fn;
var LoggingController = class extends BaseController {
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
    __privateAdd(this, _generateId);
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
      id: __privateMethod(this, _generateId, generateId_fn).call(this),
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
  let id = random();
  while (id in this.state.logs) {
    id = random();
  }
  return id;
};

export {
  LoggingController
};
//# sourceMappingURL=chunk-TLJ2ZUVI.mjs.map