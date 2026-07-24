import type {
  ClaimsController,
  ClaimsControllerMessenger,
  ClaimsControllerOptions,
} from '../src/ClaimsController.js';
import type { ClaimsControllerState } from '../src/types.js';
import type { RootControllerMessenger } from './mocks/messenger.js';

/**
 * Helper function to create controller with options.
 */
type WithControllerCallback<ReturnValue> = (params: {
  controller: ClaimsController;
  initialState: ClaimsControllerState;
  messenger: ClaimsControllerMessenger;
  rootMessenger: RootControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

export type WithControllerOptions = Partial<ClaimsControllerOptions>;

export type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];
