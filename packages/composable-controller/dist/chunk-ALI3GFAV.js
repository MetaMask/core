"use strict";Object.defineProperty(exports, "__esModule", {value: true});var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/ComposableController.ts
var _basecontroller = require('@metamask/base-controller');
var controllerName = "ComposableController";
var INVALID_CONTROLLER_ERROR = "Invalid controller: controller must have a `messagingSystem` or be a class inheriting from `BaseControllerV1`.";
function isBaseControllerV1(controller) {
  return "name" in controller && typeof controller.name === "string" && "config" in controller && typeof controller.config === "object" && "defaultConfig" in controller && typeof controller.defaultConfig === "object" && "state" in controller && typeof controller.state === "object" && "defaultState" in controller && typeof controller.defaultState === "object" && "disabled" in controller && typeof controller.disabled === "boolean" && "subscribe" in controller && typeof controller.subscribe === "function" && controller instanceof _basecontroller.BaseControllerV1;
}
function isBaseController(controller) {
  return "name" in controller && typeof controller.name === "string" && "state" in controller && typeof controller.state === "object" && "metadata" in controller && typeof controller.metadata === "object" && controller instanceof _basecontroller.BaseController;
}
var _updateChildController, updateChildController_fn;
var ComposableController = class extends _basecontroller.BaseController {
  /**
   * Creates a ComposableController instance.
   *
   * @param options - Initial options used to configure this controller
   * @param options.controllers - List of child controller instances to compose.
   * @param options.messenger - A restricted controller messenger.
   */
  constructor({
    controllers,
    messenger
  }) {
    if (messenger === void 0) {
      throw new Error(`Messaging system is required`);
    }
    super({
      name: controllerName,
      metadata: controllers.reduce(
        (metadata, controller) => ({
          ...metadata,
          [controller.name]: isBaseController(controller) ? controller.metadata : { persist: true, anonymous: true }
        }),
        {}
      ),
      state: controllers.reduce(
        (state, controller) => {
          return { ...state, [controller.name]: controller.state };
        },
        {}
      ),
      messenger
    });
    /**
     * Constructor helper that subscribes to child controller state changes.
     *
     * @param controller - Controller instance to update
     */
    __privateAdd(this, _updateChildController);
    controllers.forEach(
      (controller) => __privateMethod(this, _updateChildController, updateChildController_fn).call(this, controller)
    );
  }
};
_updateChildController = new WeakSet();
updateChildController_fn = function(controller) {
  const { name } = controller;
  if (isBaseController(controller) || isBaseControllerV1(controller) && "messagingSystem" in controller) {
    this.messagingSystem.subscribe(
      // False negative. `name` is a string type.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      `${name}:stateChange`,
      (childState) => {
        this.update((state) => {
          Object.assign(state, { [name]: childState });
        });
      }
    );
  } else if (isBaseControllerV1(controller)) {
    controller.subscribe((childState) => {
      this.update((state) => {
        Object.assign(state, { [name]: childState });
      });
    });
  } else {
    throw new Error(INVALID_CONTROLLER_ERROR);
  }
};
var ComposableController_default = ComposableController;








exports.controllerName = controllerName; exports.INVALID_CONTROLLER_ERROR = INVALID_CONTROLLER_ERROR; exports.isBaseControllerV1 = isBaseControllerV1; exports.isBaseController = isBaseController; exports.ComposableController = ComposableController; exports.ComposableController_default = ComposableController_default;
//# sourceMappingURL=chunk-ALI3GFAV.js.map