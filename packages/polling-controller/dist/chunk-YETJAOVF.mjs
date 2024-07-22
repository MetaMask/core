import {
  AbstractPollingControllerBaseMixin,
  __privateAdd,
  __privateGet,
  getKey
} from "./chunk-E2WT3D73.mjs";

// src/BlockTrackerPollingController.ts
import { BaseController, BaseControllerV1 } from "@metamask/base-controller";
function BlockTrackerPollingControllerMixin(Base) {
  var _activeListeners;
  class BlockTrackerPollingController2 extends AbstractPollingControllerBaseMixin(
    Base
  ) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _activeListeners, {});
    }
    _startPollingByNetworkClientId(networkClientId, options) {
      const key = getKey(networkClientId, options);
      if (__privateGet(this, _activeListeners)[key]) {
        return;
      }
      const networkClient = this._getNetworkClientById(networkClientId);
      if (networkClient) {
        const updateOnNewBlock = this._executePoll.bind(
          this,
          networkClientId,
          options
        );
        networkClient.blockTracker.addListener("latest", updateOnNewBlock);
        __privateGet(this, _activeListeners)[key] = updateOnNewBlock;
      } else {
        throw new Error(
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Unable to retrieve blockTracker for networkClientId ${networkClientId}`
        );
      }
    }
    _stopPollingByPollingTokenSetId(key) {
      const [networkClientId] = key.split(":");
      const networkClient = this._getNetworkClientById(
        networkClientId
      );
      if (networkClient && __privateGet(this, _activeListeners)[key]) {
        const listener = __privateGet(this, _activeListeners)[key];
        if (listener) {
          networkClient.blockTracker.removeListener("latest", listener);
          delete __privateGet(this, _activeListeners)[key];
        }
      }
    }
  }
  _activeListeners = new WeakMap();
  return BlockTrackerPollingController2;
}
var Empty = class {
};
var BlockTrackerPollingControllerOnly = BlockTrackerPollingControllerMixin(Empty);
var BlockTrackerPollingController = BlockTrackerPollingControllerMixin(BaseController);
var BlockTrackerPollingControllerV1 = BlockTrackerPollingControllerMixin(BaseControllerV1);

export {
  BlockTrackerPollingControllerOnly,
  BlockTrackerPollingController,
  BlockTrackerPollingControllerV1
};
//# sourceMappingURL=chunk-YETJAOVF.mjs.map