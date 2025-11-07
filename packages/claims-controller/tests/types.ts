import type { RootControllerMessenger } from './mocks/messenger';
import type {
  ClaimsController,
  ClaimsControllerMessenger,
  ClaimsControllerOptions,
} from '../src/ClaimsController';
import type { ClaimsControllerState } from '../src/types';

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
