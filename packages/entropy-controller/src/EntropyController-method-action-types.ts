/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { EntropyController } from './EntropyController';

/**
 * Registers an entropy source in the controller state.
 *
 * @param entropy - The entropy source to register, including its pre-computed
 * ID and type.
 */
export type EntropyControllerAddEntropyAction = {
  type: `EntropyController:addEntropy`;
  handler: EntropyController['addEntropy'];
};

/**
 * Removes an entropy source from the controller state.
 *
 * @param entropyId - The ID of the entropy source to remove.
 */
export type EntropyControllerRemoveEntropyAction = {
  type: `EntropyController:removeEntropy`;
  handler: EntropyController['removeEntropy'];
};

/**
 * Union of all EntropyController action types.
 */
export type EntropyControllerMethodActions =
  | EntropyControllerAddEntropyAction
  | EntropyControllerRemoveEntropyAction;
