"use strict";Object.defineProperty(exports, "__esModule", {value: true});





var _chunkJCXUPRTTjs = require('./chunk-JCXUPRTT.js');

// src/StaticIntervalPollingController.ts
var _basecontroller = require('@metamask/base-controller');
function StaticIntervalPollingControllerMixin(Base) {
  var _intervalIds, _intervalLength;
  class StaticIntervalPollingController2 extends _chunkJCXUPRTTjs.AbstractPollingControllerBaseMixin.call(void 0, Base) {
    constructor() {
      super(...arguments);
      _chunkJCXUPRTTjs.__privateAdd.call(void 0, this, _intervalIds, {});
      _chunkJCXUPRTTjs.__privateAdd.call(void 0, this, _intervalLength, 1e3);
    }
    setIntervalLength(intervalLength) {
      _chunkJCXUPRTTjs.__privateSet.call(void 0, this, _intervalLength, intervalLength);
    }
    getIntervalLength() {
      return _chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalLength);
    }
    _startPollingByNetworkClientId(networkClientId, options) {
      if (!_chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalLength)) {
        throw new Error("intervalLength must be defined and greater than 0");
      }
      const key = _chunkJCXUPRTTjs.getKey.call(void 0, networkClientId, options);
      const existingInterval = _chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalIds)[key];
      this._stopPollingByPollingTokenSetId(key);
      const intervalId = _chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalIds)[key] = setTimeout(
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
          try {
            await this._executePoll(networkClientId, options);
          } catch (error) {
            console.error(error);
          }
          if (intervalId === _chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalIds)[key]) {
            this._startPollingByNetworkClientId(networkClientId, options);
          }
        },
        existingInterval ? _chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalLength) : 0
      );
    }
    _stopPollingByPollingTokenSetId(key) {
      const intervalId = _chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalIds)[key];
      if (intervalId) {
        clearTimeout(intervalId);
        delete _chunkJCXUPRTTjs.__privateGet.call(void 0, this, _intervalIds)[key];
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
var StaticIntervalPollingController = StaticIntervalPollingControllerMixin(_basecontroller.BaseController);
var StaticIntervalPollingControllerV1 = StaticIntervalPollingControllerMixin(_basecontroller.BaseControllerV1);





exports.StaticIntervalPollingControllerOnly = StaticIntervalPollingControllerOnly; exports.StaticIntervalPollingController = StaticIntervalPollingController; exports.StaticIntervalPollingControllerV1 = StaticIntervalPollingControllerV1;
//# sourceMappingURL=chunk-RD6EX3RW.js.map