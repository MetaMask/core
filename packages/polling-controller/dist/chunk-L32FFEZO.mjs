import {
  AbstractPollingControllerBaseMixin,
  __privateAdd,
  __privateGet,
  __privateSet,
  getKey
} from "./chunk-E2WT3D73.mjs";

// src/StaticIntervalPollingController.ts
import { BaseController, BaseControllerV1 } from "@metamask/base-controller";
function StaticIntervalPollingControllerMixin(Base) {
  var _intervalIds, _intervalLength;
  class StaticIntervalPollingController2 extends AbstractPollingControllerBaseMixin(Base) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _intervalIds, {});
      __privateAdd(this, _intervalLength, 1e3);
    }
    setIntervalLength(intervalLength) {
      __privateSet(this, _intervalLength, intervalLength);
    }
    getIntervalLength() {
      return __privateGet(this, _intervalLength);
    }
    _startPollingByNetworkClientId(networkClientId, options) {
      if (!__privateGet(this, _intervalLength)) {
        throw new Error("intervalLength must be defined and greater than 0");
      }
      const key = getKey(networkClientId, options);
      const existingInterval = __privateGet(this, _intervalIds)[key];
      this._stopPollingByPollingTokenSetId(key);
      const intervalId = __privateGet(this, _intervalIds)[key] = setTimeout(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
          try {
            await this._executePoll(networkClientId, options);
          } catch (error) {
            console.error(error);
          }
          if (intervalId === __privateGet(this, _intervalIds)[key]) {
            this._startPollingByNetworkClientId(networkClientId, options);
          }
        },
        existingInterval ? __privateGet(this, _intervalLength) : 0
      );
    }
    _stopPollingByPollingTokenSetId(key) {
      const intervalId = __privateGet(this, _intervalIds)[key];
      if (intervalId) {
        clearTimeout(intervalId);
        delete __privateGet(this, _intervalIds)[key];
      }
    }
  }
  _intervalIds = new WeakMap();
  _intervalLength = new WeakMap();
  return StaticIntervalPollingController2;
}
var Empty = class {
};
var StaticIntervalPollingControllerOnly = StaticIntervalPollingControllerMixin(Empty);
var StaticIntervalPollingController = StaticIntervalPollingControllerMixin(BaseController);
var StaticIntervalPollingControllerV1 = StaticIntervalPollingControllerMixin(BaseControllerV1);

export {
  StaticIntervalPollingControllerOnly,
  StaticIntervalPollingController,
  StaticIntervalPollingControllerV1
};
//# sourceMappingURL=chunk-L32FFEZO.mjs.map