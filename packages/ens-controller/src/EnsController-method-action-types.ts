/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { EnsController } from './EnsController';

/**
 * Clears ensResolutionsByAddress state property.
 */
export type EnsControllerResetStateAction = {
  type: `EnsController:resetState`;
  handler: EnsController['resetState'];
};

/**
 * Remove all chain Ids and ENS entries from state.
 */
export type EnsControllerClearAction = {
  type: `EnsController:clear`;
  handler: EnsController['clear'];
};

/**
 * Delete an ENS entry.
 *
 * @param chainId - Parent chain of the ENS entry to delete.
 * @param ensName - Name of the ENS entry to delete.
 * @returns Boolean indicating if the entry was deleted.
 */
export type EnsControllerDeleteAction = {
  type: `EnsController:delete`;
  handler: EnsController['delete'];
};

/**
 * Retrieve a DNS entry.
 *
 * @param chainId - Parent chain of the ENS entry to retrieve.
 * @param ensName - Name of the ENS entry to retrieve.
 * @returns The EnsEntry or null if it does not exist.
 */
export type EnsControllerGetAction = {
  type: `EnsController:get`;
  handler: EnsController['get'];
};

/**
 * Add or update an ENS entry by chainId and ensName.
 *
 * A null address indicates that the ENS name does not resolve.
 *
 * @param chainId - Id of the associated chain.
 * @param ensName - The ENS name.
 * @param address - Associated address (or null) to add or update.
 * @returns Boolean indicating if the entry was set.
 */
export type EnsControllerSetAction = {
  type: `EnsController:set`;
  handler: EnsController['set'];
};

/**
 * Resolve ens by address.
 *
 * @param nonChecksummedAddress - address
 * @returns ens resolution
 */
export type EnsControllerReverseResolveAddressAction = {
  type: `EnsController:reverseResolveAddress`;
  handler: EnsController['reverseResolveAddress'];
};

/**
 * Union of all EnsController action types.
 */
export type EnsControllerMethodActions =
  | EnsControllerResetStateAction
  | EnsControllerClearAction
  | EnsControllerDeleteAction
  | EnsControllerGetAction
  | EnsControllerSetAction
  | EnsControllerReverseResolveAddressAction;
