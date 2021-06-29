"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComposableController = void 0;
const BaseController_1 = __importDefault(require("./BaseController"));
/**
 * Controller that can be used to compose multiple controllers together
 */
class ComposableController extends BaseController_1.default {
    /**
     * Creates a ComposableController instance
     *
     * @param controllers - Map of names to controller instances
     * @param messenger - The controller messaging system, used for communicating with BaseControllerV2 controllers
     */
    constructor(controllers, messenger) {
        super(undefined, controllers.reduce((state, controller) => {
            state[controller.name] = controller.state;
            return state;
        }, {}));
        this.controllers = [];
        /**
         * Name of this controller used during composition
         */
        this.name = 'ComposableController';
        this.initialize();
        this.controllers = controllers;
        this.messagingSystem = messenger;
        this.controllers.forEach((controller) => {
            const { name } = controller;
            if (controller.subscribe !== undefined) {
                controller.subscribe((state) => {
                    this.update({ [name]: state });
                });
            }
            else if (this.messagingSystem) {
                this.messagingSystem.subscribe(`${name}:stateChange`, (state) => {
                    this.update({ [name]: state });
                });
            }
            else {
                throw new Error(`Messaging system required if any BaseControllerV2 controllers are used`);
            }
        });
    }
    /**
     * Flat state representation, one that isn't keyed
     * of controller name. Instead, all child controller state is merged
     * together into a single, flat object.
     *
     * @returns - Merged state representation of all child controllers
     */
    get flatState() {
        let flatState = {};
        for (const controller of this.controllers) {
            flatState = Object.assign(Object.assign({}, flatState), controller.state);
        }
        return flatState;
    }
}
exports.ComposableController = ComposableController;
exports.default = ComposableController;
//# sourceMappingURL=ComposableController.js.map