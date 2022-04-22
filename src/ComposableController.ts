import { BaseController } from './BaseController';
import { RestrictedControllerMessenger } from './ControllerMessenger';

/**
 * List of child controller instances
 *
 * This type encompasses controllers based up either BaseController or
 * BaseControllerV2. The BaseControllerV2 type can't be included directly
 * because the generic parameters it expects require knowing the exact state
 * shape, so instead we look for an object with the BaseControllerV2 properties
 * that we use in the ComposableController (name and state).
 */
export type ControllerList = (
  | BaseController<any, any>
  | { name: string; state: Record<string, unknown> }
)[];

/**
 * Controller that can be used to compose multiple controllers together
 */
export class ComposableController extends BaseController<never, any> {
  private controllers: ControllerList = [];

  private messagingSystem?: RestrictedControllerMessenger<
    'ComposableController',
    never,
    any,
    never,
    any
  >;

  /**
   * Name of this controller used during composition
   */
  override name = 'ComposableController';

  /**
   * Creates a ComposableController instance.
   *
   * @param controllers - Map of names to controller instances.
   * @param messenger - The controller messaging system, used for communicating with BaseControllerV2 controllers.
   */
  constructor(
    controllers: ControllerList,
    messenger?: RestrictedControllerMessenger<
      'ComposableController',
      never,
      any,
      never,
      any
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
    if (messenger) {
      this.messagingSystem = messenger;
    }

    this.controllers.forEach((controller) => {
      const { name } = controller;
      if ((controller as BaseController<any, any>).subscribe !== undefined) {
        (controller as BaseController<any, any>).subscribe((state) => {
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
   * @returns Merged state representation of all child controllers.
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
