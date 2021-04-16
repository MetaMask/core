import BaseController from './BaseController';
import {
  RestrictedControllerMessenger,
  EventConstraint,
} from './ControllerMessenger';

/**
 * List of child controller instances
 */
export type ControllerList = (
  | BaseController<any, any>
  | { name: string; state: Record<string, unknown> }
)[];

/**
 * Controller that can be used to compose multiple controllers together
 */
export class ComposableController<
  Events extends EventConstraint,
  AllowedEvents extends string
> extends BaseController<never, any> {
  private controllers: ControllerList = [];

  private messagingSystem?: RestrictedControllerMessenger<
    'ComposableController',
    never,
    Events,
    never,
    AllowedEvents
  >;

  /**
   * Name of this controller used during composition
   */
  name = 'ComposableController';

  /**
   * Creates a ComposableController instance
   *
   * @param controllers - Map of names to controller instances
   * @param messenger - The controller messaging system, used for communicating with BaseControllerV2 controllers
   */
  constructor(
    controllers: ControllerList,
    messenger?: RestrictedControllerMessenger<
      'ComposableController',
      never,
      Events,
      never,
      AllowedEvents
    >,
  ) {
    super(
      undefined,
      controllers.reduce((state, controller) => {
        state[controller.name] = controller.state;
        return state;
      }, {} as any),
    );
    this.initialize();
    this.controllers = controllers;
    this.messagingSystem = messenger;
    this.controllers.forEach((controller) => {
      const { name } = controller;
      if (controller instanceof BaseController) {
        controller.subscribe((state) => {
          this.update({ [name]: state });
        });
      } else if (this.messagingSystem) {
        (this.messagingSystem.subscribe as any)(
          `${name}:stateChange`,
          (state: any) => {
            this.update({ [name]: state });
          },
        );
      } else {
        throw new Error(
          `Messaging system required if any BaseControllerV2 controllers are used`,
        );
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
      flatState = { ...flatState, ...controller.state };
    }
    return flatState;
  }
}

export default ComposableController;
